import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { isEphemeralUserId } from './rankings';

const DEFAULT_TIERS = [
  { id: 'S', name: 'S', color: '#ef4444' },
  { id: 'A', name: 'A', color: '#f97316' },
  { id: 'B', name: 'B', color: '#eab308' },
  { id: 'C', name: 'C', color: '#22c55e' },
  { id: 'D', name: 'D', color: '#3b82f6' },
  { id: 'F', name: 'F', color: '#8b5cf6' },
];

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    customTiers: v.optional(
      v.array(
        v.object({
          id: v.string(),
          name: v.string(),
          color: v.string(),
        }),
      ),
    ),
    hostName: v.optional(v.string()),
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
    const hostId = userId || validAnonId || `guest-${Math.random().toString(36).slice(2, 8)}`;
    const hostName =
      args.hostName || (identity ? identity.name || identity.email || 'Host' : 'Host');

    let code = generateCode();
    // Ensure unique code
    let existing = await ctx.db
      .query('sessions')
      .withIndex('by_code', (q) => q.eq('code', code))
      .first();
    while (existing) {
      code = generateCode();
      existing = await ctx.db
        .query('sessions')
        .withIndex('by_code', (q) => q.eq('code', code))
        .first();
    }

    const sessionId = await ctx.db.insert('sessions', {
      title: args.title.trim() || 'Taste Test Session',
      code,
      hostId,
      hostName,
      status: 'ranking',
      tiers: args.customTiers && args.customTiers.length > 0 ? args.customTiers : DEFAULT_TIERS,
      createdAt: Date.now(),
    });

    // Auto-register host as participant
    await ctx.db.insert('rankings', {
      sessionId,
      userId: hostId,
      userName: hostName,
      userAvatar: identity?.pictureUrl,
      isReady: false,
      placements: [],
      updatedAt: Date.now(),
    });

    return { sessionId, code };
  },
});

export const get = query({
  args: { sessionId: v.id('sessions') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.sessionId);
  },
});

export const getByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('sessions')
      .withIndex('by_code', (q) => q.eq('code', args.code.trim().toUpperCase()))
      .first();
  },
});

export const listRecent = query({
  args: {
    deviceSessionIds: v.optional(v.array(v.id('sessions'))),
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

    const sessionMap = new Map<string, Doc<'sessions'>>();

    const hostIds = new Set<string>();
    if (userId) hostIds.add(userId);
    if (validAnonId) hostIds.add(validAnonId);

    for (const hostId of hostIds) {
      const hosted = await ctx.db
        .query('sessions')
        .withIndex('by_host', (q) => q.eq('hostId', hostId))
        .order('desc')
        .take(20);
      for (const s of hosted) {
        sessionMap.set(s._id, s);
      }
    }

    if (args.deviceSessionIds && args.deviceSessionIds.length > 0) {
      const deviceSessions = await Promise.all(
        args.deviceSessionIds.slice(0, 20).map((id) => ctx.db.get(id)),
      );
      for (const s of deviceSessions) {
        if (s) {
          sessionMap.set(s._id, s);
        }
      }
    }

    const deduplicated = Array.from(sessionMap.values());
    deduplicated.sort((a, b) => b.createdAt - a.createdAt);
    return deduplicated.slice(0, 20);
  },
});

export const updateStatus = mutation({
  args: {
    sessionId: v.id('sessions'),
    status: v.union(v.literal('ranking'), v.literal('revealed')),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error('Session not found');
    await ctx.db.patch(args.sessionId, { status: args.status });
  },
});

export const updateTiers = mutation({
  args: {
    sessionId: v.id('sessions'),
    tiers: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        color: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error('Session not found');
    await ctx.db.patch(args.sessionId, { tiers: args.tiers });
  },
});
