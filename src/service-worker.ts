/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { version } from '$app/env';
import { assets, immutable, prerendered } from '$app/manifest';

declare const self: ServiceWorkerGlobalScope;

const CACHE_NAME = `consensauce-cache-${version}`;

// Assets to cache immediately on install (normalized with leading slashes for url.pathname matching)
const ASSET_PATHS = [
  ...immutable.map((item) =>
    typeof item === 'string'
      ? item.startsWith('/')
        ? item
        : `/${item}`
      : `/${(item as { path: string }).path}`,
  ),
  ...assets.map((item) =>
    typeof item === 'string'
      ? item.startsWith('/')
        ? item
        : `/${item}`
      : `/${(item as { path: string }).path}`,
  ),
  ...prerendered.map((item) =>
    typeof item === 'string'
      ? item.startsWith('/')
        ? item
        : `/${item}`
      : `/${(item as { path: string }).path}`,
  ),
];
const ASSET_SET = new Set(ASSET_PATHS);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSET_PATHS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then(async (keys) => {
        for (const key of keys) {
          if (key !== CACHE_NAME) {
            await caches.delete(key);
          }
        }
      })
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignore non-GET requests, Chrome extensions, and WebSockets (e.g. Convex realtime)
  if (
    event.request.method !== 'GET' ||
    url.protocol.startsWith('ws') ||
    url.protocol.startsWith('chrome-extension')
  ) {
    return;
  }

  // Only handle same-origin requests; skip Clerk, Convex, and external CDN traffic
  if (url.origin !== self.location.origin) {
    return;
  }

  // 1. Static and immutable build assets: Cache-First strategy
  if (ASSET_SET.has(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      }),
    );
    return;
  }

  // 2. Navigation / HTML pages: Network-First with Cache fallback for offline app shell
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          const rootCached = await caches.match('/');
          if (rootCached) return rootCached;
          return new Response('Offline - Consensauce', {
            status: 503,
            statusText: 'Offline',
            headers: { 'Content-Type': 'text/html' },
          });
        }),
    );
    return;
  }
});
