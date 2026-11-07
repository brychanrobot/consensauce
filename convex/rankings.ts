import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';

// NOTE: Keep in sync with src/lib/rankings.ts
export function isEphemeralUserId(id?: string | null): boolean {
  if (!id || typeof id !== 'string') return false;
  return id.startsWith('guest-') || /^user_[a-z0-9]{1,12}$/.test(id);
}

// NOTE: Keep in sync with src/lib/rankings.ts
export function mergePlacements(
  rankingsList: Array<{
    placements: Array<{ itemId: Id<'items'>; tierId: string; rank: number }>;
    updatedAt: number;
  }>,
): Array<{ itemId: Id<'items'>; tierId: string; rank: number }> {
  const sorted = [...rankingsList].sort((a, b) => a.updatedAt - b.updatedAt);
  const itemMap = new Map<Id<'items'>, { itemId: Id<'items'>; tierId: string; rank: number }>();
  for (const r of sorted) {
    for (const p of r.placements) {
      itemMap.set(p.itemId, p);
    }
  }

  const tierMap = new Map<string, Array<{ itemId: Id<'items'>; tierId: string; rank: number }>>();
  for (const p of itemMap.values()) {
    let group = tierMap.get(p.tierId);
    if (!group) {
      group = [];
      tierMap.set(p.tierId, group);
    }
    group.push(p);
  }

  const result: Array<{ itemId: Id<'items'>; tierId: string; rank: number }> = [];
  for (const [tierId, group] of tierMap.entries()) {
    group.sort((a, b) => a.rank - b.rank);
    group.forEach((p, idx) => {
      result.push({
        itemId: p.itemId,
        tierId,
        rank: idx,
      });
    });
  }
  return result;
}

export const listBySession = query({
  args: { sessionId: v.id('sessions') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('rankings')
      .withIndex('by_session', (q) => q.eq('sessionId', args.sessionId))
      .collect();
  },
});

export const getMyRanking = query({
  args: {
    sessionId: v.id('sessions'),
    clientUserId: v.optional(v.string()),
    anonymousUserId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || args.clientUserId;
    const validAnonId =
      args.anonymousUserId && isEphemeralUserId(args.anonymousUserId)
        ? args.anonymousUserId
        : undefined;

    if (!userId && !validAnonId) return null;

    let ranking = userId
      ? await ctx.db
          .query('rankings')
          .withIndex('by_session_user', (q) =>
            q.eq('sessionId', args.sessionId).eq('userId', userId),
          )
          .first()
      : null;

    if (!ranking && validAnonId && validAnonId !== userId) {
      ranking = await ctx.db
        .query('rankings')
        .withIndex('by_session_user', (q) =>
          q.eq('sessionId', args.sessionId).eq('userId', validAnonId),
        )
        .first();
    }

    return ranking;
  },
});

export const joinSession = mutation({
  args: {
    sessionId: v.id('sessions'),
    clientUserId: v.optional(v.string()),
    anonymousUserId: v.optional(v.string()),
    userName: v.string(),
    userAvatar: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const validAnonId =
      args.anonymousUserId && isEphemeralUserId(args.anonymousUserId)
        ? args.anonymousUserId
        : undefined;
    const userId =
      identity?.subject ||
      args.clientUserId ||
      validAnonId ||
      `guest-${Math.random().toString(36).slice(2, 8)}`;
    const userName = args.userName.trim() || identity?.name || identity?.email || 'Taster';

    const session = await ctx.db.get(args.sessionId);

    const sessionRankings = await ctx.db
      .query('rankings')
      .withIndex('by_session', (q) => q.eq('sessionId', args.sessionId))
      .take(100);

    const matchingRankings = sessionRankings.filter((r) => {
      if (r.userId === userId) return true;
      if (validAnonId && r.userId === validAnonId) return true;
      return false;
    });

    if (matchingRankings.length > 0) {
      const primary = matchingRankings.find((r) => r.userId === userId) ?? matchingRankings[0];

      const mergedPlacements = mergePlacements(matchingRankings);
      const mergedIsReady = matchingRankings.some((r) => r.isReady);
      const resolvedName = userName !== 'Taster' ? userName : primary.userName;
      const resolvedAvatar = args.userAvatar || identity?.pictureUrl || primary.userAvatar;

      await ctx.db.patch(primary._id, {
        userId,
        userName: resolvedName,
        userAvatar: resolvedAvatar,
        placements: mergedPlacements,
        isReady: mergedIsReady,
        updatedAt: Date.now(),
      });

      for (const r of matchingRankings) {
        if (r._id !== primary._id) {
          await ctx.db.delete(r._id);
        }
      }

      if (
        session &&
        (session.hostId === userId || (validAnonId && session.hostId === validAnonId))
      ) {
        if (session.hostId !== userId || session.hostName !== resolvedName) {
          await ctx.db.patch(session._id, {
            hostId: userId,
            hostName: resolvedName !== 'Taster' ? resolvedName : session.hostName,
          });
        }
      }

      return { rankingId: primary._id, userId };
    }

    const rankingId = await ctx.db.insert('rankings', {
      sessionId: args.sessionId,
      userId,
      userName,
      userAvatar: args.userAvatar || identity?.pictureUrl,
      isReady: false,
      placements: [],
      updatedAt: Date.now(),
    });

    return { rankingId, userId };
  },
});

export const savePlacement = mutation({
  args: {
    sessionId: v.id('sessions'),
    clientUserId: v.optional(v.string()),
    anonymousUserId: v.optional(v.string()),
    itemId: v.id('items'),
    tierId: v.union(v.string(), v.null()), // null means move back to unranked
    targetRank: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || args.clientUserId;
    const validAnonId =
      args.anonymousUserId && isEphemeralUserId(args.anonymousUserId)
        ? args.anonymousUserId
        : undefined;
    const effectiveUserId = userId || validAnonId;
    if (!effectiveUserId) throw new Error('User not identified');

    let ranking = userId
      ? await ctx.db
          .query('rankings')
          .withIndex('by_session_user', (q) =>
            q.eq('sessionId', args.sessionId).eq('userId', userId),
          )
          .first()
      : null;

    if (!ranking && validAnonId && validAnonId !== userId) {
      const anonRanking = await ctx.db
        .query('rankings')
        .withIndex('by_session_user', (q) =>
          q.eq('sessionId', args.sessionId).eq('userId', validAnonId),
        )
        .first();
      if (anonRanking) {
        if (userId) {
          await ctx.db.patch(anonRanking._id, {
            userId,
            updatedAt: Date.now(),
          });
        }
        ranking = anonRanking;
      }
    }

    if (!ranking) {
      const rankingId = await ctx.db.insert('rankings', {
        sessionId: args.sessionId,
        userId: userId || effectiveUserId,
        userName: identity?.name || 'Taster',
        userAvatar: identity?.pictureUrl,
        isReady: false,
        placements: [],
        updatedAt: Date.now(),
      });
      const fetched = await ctx.db.get(rankingId);
      if (!fetched) {
        throw new Error('Failed to retrieve created ranking');
      }
      ranking = fetched;
    }

    // Remove existing placement for this item
    const currentPlacements = ranking.placements.filter((p) => p.itemId !== args.itemId);

    if (args.tierId !== null) {
      // Find other items in the same tier
      const sameTierItems = currentPlacements.filter((p) => p.tierId === args.tierId);
      sameTierItems.sort((a, b) => a.rank - b.rank);

      const rankIndex = args.targetRank !== undefined ? args.targetRank : sameTierItems.length;
      sameTierItems.splice(rankIndex, 0, {
        itemId: args.itemId,
        tierId: args.tierId,
        rank: rankIndex,
      });

      // Re-index ranks
      const otherTierItems = currentPlacements.filter((p) => p.tierId !== args.tierId);
      const updatedSameTier = sameTierItems.map((item, idx) => ({
        ...item,
        rank: idx,
      }));

      await ctx.db.patch(ranking._id, {
        placements: [...otherTierItems, ...updatedSameTier],
        updatedAt: Date.now(),
      });
    } else {
      // Item moved back to unranked pool
      await ctx.db.patch(ranking._id, {
        placements: currentPlacements,
        updatedAt: Date.now(),
      });
    }
  },
});

export const setReady = mutation({
  args: {
    sessionId: v.id('sessions'),
    clientUserId: v.optional(v.string()),
    anonymousUserId: v.optional(v.string()),
    isReady: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || args.clientUserId;
    const validAnonId =
      args.anonymousUserId && isEphemeralUserId(args.anonymousUserId)
        ? args.anonymousUserId
        : undefined;
    const effectiveUserId = userId || validAnonId;
    if (!effectiveUserId) throw new Error('User not identified');

    let ranking = userId
      ? await ctx.db
          .query('rankings')
          .withIndex('by_session_user', (q) =>
            q.eq('sessionId', args.sessionId).eq('userId', userId),
          )
          .first()
      : null;

    if (!ranking && validAnonId && validAnonId !== userId) {
      ranking = await ctx.db
        .query('rankings')
        .withIndex('by_session_user', (q) =>
          q.eq('sessionId', args.sessionId).eq('userId', validAnonId),
        )
        .first();
      if (ranking && userId) {
        await ctx.db.patch(ranking._id, { userId });
      }
    }

    if (!ranking) throw new Error('Ranking record not found');
    await ctx.db.patch(ranking._id, { isReady: args.isReady, updatedAt: Date.now() });
  },
});

export const removeParticipant = mutation({
  args: {
    sessionId: v.id('sessions'),
    clientUserId: v.optional(v.string()),
    anonymousUserId: v.optional(v.string()),
    targetUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const callerUserId = identity?.subject || args.clientUserId;
    const validAnonId =
      args.anonymousUserId && isEphemeralUserId(args.anonymousUserId)
        ? args.anonymousUserId
        : undefined;
    if (!callerUserId && !validAnonId) throw new Error('Unauthorized');

    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error('Session not found');

    const isHost =
      session.hostId === callerUserId || (Boolean(validAnonId) && session.hostId === validAnonId);

    if (!isHost) {
      throw new Error('Only the session host can remove participants');
    }

    if (args.targetUserId === callerUserId || (validAnonId && args.targetUserId === validAnonId)) {
      throw new Error('Cannot remove yourself from the session');
    }

    // Only promote session.hostId to callerUserId if validAnonId && session.hostId === validAnonId
    if (callerUserId && validAnonId && session.hostId === validAnonId) {
      await ctx.db.patch(session._id, {
        hostId: callerUserId,
        hostName: identity?.name || identity?.email || session.hostName,
      });
    }

    const targetRanking = await ctx.db
      .query('rankings')
      .withIndex('by_session_user', (q) =>
        q.eq('sessionId', args.sessionId).eq('userId', args.targetUserId),
      )
      .first();

    if (targetRanking) {
      await ctx.db.delete(targetRanking._id);
    }
  },
});

export const getConsensus = query({
  args: { sessionId: v.id('sessions') },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;

    const items = await ctx.db
      .query('items')
      .withIndex('by_session_order', (q) => q.eq('sessionId', args.sessionId))
      .collect();

    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const url = await ctx.storage.getUrl(item.imageStorageId);
        return { ...item, imageUrl: url ?? '' };
      }),
    );

    const rankings = await ctx.db
      .query('rankings')
      .withIndex('by_session', (q) => q.eq('sessionId', args.sessionId))
      .collect();

    const tiers = session.tiers;
    const totalTiers = tiers.length;

    // Map each tier to a numeric score (highest tier index 0 gets highest points)
    // e.g. 6 tiers: S=5, A=4, B=3, C=2, D=1, F=0
    const tierScoreMap = new Map<string, number>();
    tiers.forEach((t, idx) => {
      tierScoreMap.set(t.id, totalTiers - 1 - idx);
    });

    // Analyze each item across participants
    const consensusItems = enrichedItems.map((item) => {
      const itemPlacements: Array<{
        userId: string;
        userName: string;
        tierId: string;
        score: number;
      }> = [];

      for (const r of rankings) {
        const placement = r.placements.find((p) => p.itemId === item._id);
        const score = placement ? tierScoreMap.get(placement.tierId) : undefined;
        if (placement && score !== undefined) {
          itemPlacements.push({
            userId: r.userId,
            userName: r.userName,
            tierId: placement.tierId,
            score,
          });
        }
      }

      if (itemPlacements.length === 0) {
        return {
          ...item,
          isPlaced: false,
          averageScore: -1,
          consensusTierId: null,
          consensusTierName: null,
          scores: [],
          scoreDiff: 0,
          agreement: 'none',
        };
      }

      const totalScore = itemPlacements.reduce((sum, p) => sum + p.score, 0);
      const averageScore = totalScore / itemPlacements.length;

      // Map average score back to nearest tier
      // Score range: 0 to (totalTiers - 1)
      const roundedIndex = Math.max(
        0,
        Math.min(totalTiers - 1, Math.round(totalTiers - 1 - averageScore)),
      );
      const consensusTier = tiers[roundedIndex];

      const scoresOnly = itemPlacements.map((p) => p.score);
      const minScore = Math.min(...scoresOnly);
      const maxScore = Math.max(...scoresOnly);
      const scoreDiff = maxScore - minScore;

      let agreement: 'mind_meld' | 'spicy_debate' | 'moderate' = 'moderate';
      if (itemPlacements.length >= 2) {
        if (scoreDiff === 0) {
          agreement = 'mind_meld';
        } else if (scoreDiff >= 2) {
          agreement = 'spicy_debate';
        }
      }

      return {
        ...item,
        isPlaced: true,
        averageScore,
        consensusTierId: consensusTier.id,
        consensusTierName: consensusTier.name,
        scores: itemPlacements,
        scoreDiff,
        agreement,
      };
    });

    // Find biggest spicy debate and biggest mind meld
    const placedItems = consensusItems.filter((i) => i.isPlaced);
    placedItems.sort((a, b) => b.scoreDiff - a.scoreDiff);

    const spiciest = placedItems.find((i) => i.agreement === 'spicy_debate') || null;
    const mindMeld = placedItems.find((i) => i.agreement === 'mind_meld') || null;

    return {
      consensusItems,
      spiciest,
      mindMeld,
      totalParticipants: rankings.length,
      readyParticipants: rankings.filter((r) => r.isReady).length,
    };
  },
});
