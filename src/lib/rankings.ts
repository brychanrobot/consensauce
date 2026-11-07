// NOTE: Keep in sync with convex/rankings.ts
export function isEphemeralUserId(id?: string | null): boolean {
  if (!id || typeof id !== 'string') return false;
  return id.startsWith('guest-') || /^user_[a-z0-9]{1,12}$/.test(id);
}

// NOTE: Keep in sync with convex/rankings.ts
export function mergePlacements<T extends { itemId: string; tierId: string; rank: number }>(
  rankingsList: Array<{
    placements: T[];
    updatedAt: number;
  }>,
): T[] {
  const sorted = [...rankingsList].sort((a, b) => a.updatedAt - b.updatedAt);
  const itemMap = new Map<string, T>();
  for (const r of sorted) {
    for (const p of r.placements) {
      itemMap.set(p.itemId, p);
    }
  }

  const tierMap = new Map<string, T[]>();
  for (const p of itemMap.values()) {
    let group = tierMap.get(p.tierId);
    if (!group) {
      group = [];
      tierMap.set(p.tierId, group);
    }
    group.push(p);
  }

  const result: T[] = [];
  for (const [tierId, group] of tierMap.entries()) {
    group.sort((a, b) => a.rank - b.rank);
    group.forEach((p, idx) => {
      result.push({
        ...p,
        tierId,
        rank: idx,
      });
    });
  }
  return result;
}

export interface DeduplicateSessionRankingsOptions {
  clerkUserId?: string | null;
  localUserId?: string | null;
  hostId?: string | null;
}

export function deduplicateSessionRankings<
  R extends {
    _id: string;
    userId: string;
    userName: string;
    isReady: boolean;
    updatedAt: number;
    placements: Array<{ itemId: string; tierId: string; rank: number }>;
  },
>(rawList: R[], options: DeduplicateSessionRankingsOptions): R[] {
  if (!rawList || rawList.length === 0) return [];

  const isSelfRow = (r: R) =>
    Boolean(
      (options.clerkUserId && r.userId === options.clerkUserId) ||
        (options.localUserId && r.userId === options.localUserId),
    );

  const selfRows = rawList.filter(isSelfRow);
  if (selfRows.length <= 1) {
    return rawList;
  }

  const primary =
    selfRows.find((r) => options.clerkUserId && r.userId === options.clerkUserId) ??
    selfRows.find((r) => options.hostId && r.userId === options.hostId) ??
    selfRows[0];

  const nameRow = selfRows.find((r) => r.userName && r.userName !== 'Host') ?? primary;
  const mergedPlacements = mergePlacements(selfRows);
  const isAnySelfHost = selfRows.some((r) => options.hostId && r.userId === options.hostId);
  const resolvedUserId = isAnySelfHost && options.hostId ? options.hostId : primary.userId;
  const mergedIsReady = selfRows.some((r) => r.isReady);
  const latestUpdatedAt = Math.max(...selfRows.map((r) => r.updatedAt));

  const collapsedSelf: R = {
    ...primary,
    userId: resolvedUserId,
    userName: nameRow.userName || primary.userName,
    isReady: mergedIsReady,
    placements: mergedPlacements,
    updatedAt: latestUpdatedAt,
  };

  const result: R[] = [];
  let selfInserted = false;
  for (const r of rawList) {
    if (isSelfRow(r)) {
      if (!selfInserted) {
        result.push(collapsedSelf);
        selfInserted = true;
      }
    } else {
      result.push(r);
    }
  }

  return result;
}
