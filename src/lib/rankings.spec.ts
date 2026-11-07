import { describe, expect, it } from 'vitest';
import type { Id } from '$convex/_generated/dataModel';
import { deduplicateSessionRankings, isEphemeralUserId, mergePlacements } from './rankings';

describe('isEphemeralUserId', () => {
  it('identifies guest IDs with guest- prefix as ephemeral', () => {
    expect(isEphemeralUserId('guest-a1b2c3')).toBe(true);
    expect(isEphemeralUserId('guest-xyz987')).toBe(true);
  });

  it('identifies local client IDs (user_ + <=12 chars) as ephemeral', () => {
    expect(isEphemeralUserId('user_a1b2c3d')).toBe(true);
    expect(isEphemeralUserId('user_1234567')).toBe(true);
    expect(isEphemeralUserId('user_abc')).toBe(true);
  });

  it('distinguishes 12-char user_xxxxxxx and guest-xxxxxx from 32-char Clerk user_2... IDs', () => {
    // Clerk IDs: user_ + ~27-32 characters, uppercase & lowercase
    const clerkId1 = 'user_2t1aBcDeFgHiJkLmNoPqRsTuVwX';
    expect(clerkId1.length).toBeGreaterThan(17);
    expect(isEphemeralUserId(clerkId1)).toBe(false);

    const clerkId2 = 'user_345678901234567890123456789';
    expect(isEphemeralUserId(clerkId2)).toBe(false);
  });

  it('does not identify other non-ephemeral IDs', () => {
    expect(isEphemeralUserId(null)).toBe(false);
    expect(isEphemeralUserId(undefined)).toBe(false);
    expect(isEphemeralUserId('')).toBe(false);
    expect(isEphemeralUserId('host-12345')).toBe(false);
    expect(isEphemeralUserId('auth0|1234567890')).toBe(false);
  });
});

describe('mergePlacements', () => {
  const item1 = 'item_1' as Id<'items'>;
  const item2 = 'item_2' as Id<'items'>;
  const item3 = 'item_3' as Id<'items'>;

  it('merges placements and lets newer placements override older ones for the same item', () => {
    const older = {
      updatedAt: 100,
      placements: [
        { itemId: item1, tierId: 'B', rank: 0 },
        { itemId: item2, tierId: 'A', rank: 0 },
      ],
    };
    const newer = {
      updatedAt: 200,
      placements: [
        { itemId: item1, tierId: 'S', rank: 0 }, // item1 moved to S
        { itemId: item3, tierId: 'B', rank: 0 },
      ],
    };

    const merged = mergePlacements([older, newer]);

    // item1 should be in S (from newer)
    const p1 = merged.find((p) => p.itemId === item1);
    expect(p1?.tierId).toBe('S');
    expect(p1?.rank).toBe(0);

    // item2 should be in A (from older)
    const p2 = merged.find((p) => p.itemId === item2);
    expect(p2?.tierId).toBe('A');
    expect(p2?.rank).toBe(0);

    // item3 should be in B (from newer)
    const p3 = merged.find((p) => p.itemId === item3);
    expect(p3?.tierId).toBe('B');
    expect(p3?.rank).toBe(0);

    expect(merged.length).toBe(3);
  });

  it('correctly re-indexes ranks when multiple items are in the same tier without duplicate rank indices', () => {
    const rankings = [
      {
        updatedAt: 100,
        placements: [
          { itemId: item1, tierId: 'A', rank: 5 },
          { itemId: item2, tierId: 'A', rank: 10 },
          { itemId: item3, tierId: 'A', rank: 2 },
        ],
      },
    ];

    const merged = mergePlacements(rankings);
    expect(merged.map((p) => p.rank)).toEqual([0, 1, 2]);
    expect(merged.map((p) => p.itemId)).toEqual([item3, item1, item2]);
  });
});

describe('deduplicateSessionRankings', () => {
  const item1 = 'item_1' as Id<'items'>;
  const item2 = 'item_2' as Id<'items'>;

  it("merges a user's clerkUserId and localUserId rows into a single entry while preserving host status and re-indexed placements", () => {
    const hostId = 'user_ephemeral1';
    const clerkUserId = 'user_2t1aBcDeFgHiJkLmNoPqRsTuVwX';
    const localUserId = 'user_ephemeral1';

    const rawRankings = [
      {
        _id: 'r1' as Id<'rankings'>,
        sessionId: 's1' as Id<'sessions'>,
        userId: hostId,
        userName: 'Host',
        isReady: false,
        placements: [{ itemId: item1, tierId: 'S', rank: 0 }],
        updatedAt: 100,
      },
      {
        _id: 'r2' as Id<'rankings'>,
        sessionId: 's1' as Id<'sessions'>,
        userId: clerkUserId,
        userName: 'Bryant',
        isReady: true,
        placements: [{ itemId: item2, tierId: 'S', rank: 0 }],
        updatedAt: 200,
      },
      {
        _id: 'r3' as Id<'rankings'>,
        sessionId: 's1' as Id<'sessions'>,
        userId: 'other_user',
        userName: 'Friend',
        isReady: false,
        placements: [],
        updatedAt: 150,
      },
    ];

    const deduplicated = deduplicateSessionRankings(rawRankings, {
      clerkUserId,
      localUserId,
      hostId,
    });

    expect(deduplicated.length).toBe(2);

    const selfRow = deduplicated.find((r) => r.userId === hostId);
    expect(selfRow).toBeDefined();
    expect(selfRow?.userName).toBe('Bryant');
    expect(selfRow?.isReady).toBe(true);
    // Placements in tier S must be re-indexed: rank 0 and rank 1
    expect(selfRow?.placements.length).toBe(2);
    expect(selfRow?.placements.map((p) => p.rank)).toEqual([0, 1]);

    const otherRow = deduplicated.find((r) => r.userId === 'other_user');
    expect(otherRow).toBeDefined();
    expect(otherRow?.userName).toBe('Friend');
  });

  it('negative test: A guest joining a session where the host has 0 placements does NOT match or hijack the host row', () => {
    const hostId = 'user_host_123';
    const guestLocalId = 'guest-newjoin';

    const rawRankings = [
      {
        _id: 'r_host' as Id<'rankings'>,
        sessionId: 's1' as Id<'sessions'>,
        userId: hostId,
        userName: 'Host',
        isReady: false,
        placements: [],
        updatedAt: 100,
      },
      {
        _id: 'r_guest' as Id<'rankings'>,
        sessionId: 's1' as Id<'sessions'>,
        userId: guestLocalId,
        userName: 'Taster',
        isReady: false,
        placements: [],
        updatedAt: 200,
      },
    ];

    const deduplicated = deduplicateSessionRankings(rawRankings, {
      clerkUserId: null,
      localUserId: guestLocalId,
      hostId,
    });

    // Both host and guest must remain distinct!
    expect(deduplicated.length).toBe(2);

    const hostEntry = deduplicated.find((r) => r.userId === hostId);
    expect(hostEntry).toBeDefined();
    expect(hostEntry?.userName).toBe('Host');
    expect(hostEntry?._id).toBe('r_host');

    const guestEntry = deduplicated.find((r) => r.userId === guestLocalId);
    expect(guestEntry).toBeDefined();
    expect(guestEntry?.userName).toBe('Taster');
    expect(guestEntry?._id).toBe('r_guest');
  });

  it('negative test: Two different participants with the exact same userName are NOT merged or deleted when their userIds are distinct', () => {
    const user1Id = 'user_alex1';
    const user2Id = 'user_alex2';

    const rawRankings = [
      {
        _id: 'r_alex1' as Id<'rankings'>,
        sessionId: 's1' as Id<'sessions'>,
        userId: user1Id,
        userName: 'Alex',
        isReady: true,
        placements: [{ itemId: item1, tierId: 'A', rank: 0 }],
        updatedAt: 100,
      },
      {
        _id: 'r_alex2' as Id<'rankings'>,
        sessionId: 's1' as Id<'sessions'>,
        userId: user2Id,
        userName: 'Alex',
        isReady: false,
        placements: [{ itemId: item2, tierId: 'B', rank: 0 }],
        updatedAt: 110,
      },
    ];

    // From perspective of user1
    const deduplicated1 = deduplicateSessionRankings(rawRankings, {
      clerkUserId: null,
      localUserId: user1Id,
      hostId: 'someone_else',
    });

    expect(deduplicated1.length).toBe(2);
    expect(deduplicated1.find((r) => r.userId === user1Id)?._id).toBe('r_alex1');
    expect(deduplicated1.find((r) => r.userId === user2Id)?._id).toBe('r_alex2');

    // Also verify when both are named "Host"
    const hostRankings = [
      {
        _id: 'r_h1' as Id<'rankings'>,
        sessionId: 's1' as Id<'sessions'>,
        userId: 'user_first_host',
        userName: 'Host',
        isReady: false,
        placements: [],
        updatedAt: 100,
      },
      {
        _id: 'r_h2' as Id<'rankings'>,
        sessionId: 's1' as Id<'sessions'>,
        userId: 'user_second_participant',
        userName: 'Host',
        isReady: false,
        placements: [],
        updatedAt: 105,
      },
    ];

    const deduplicatedHost = deduplicateSessionRankings(hostRankings, {
      clerkUserId: null,
      localUserId: 'user_second_participant',
      hostId: 'user_first_host',
    });

    expect(deduplicatedHost.length).toBe(2);
    expect(deduplicatedHost[0].userId).toBe('user_first_host');
    expect(deduplicatedHost[1].userId).toBe('user_second_participant');
  });
});
