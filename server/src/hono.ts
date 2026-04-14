import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import os from 'os';
import { roomStore } from './rooms.js';
import { audioCache, CACHE_DIR } from './cache.js';
import { extractVideoId, searchYouTube } from './ytdlp.js';

function getLocalIP(): string | null {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return null;
}

export function buildHonoApp() {
  const app = new Hono();

  // Network info (for QR code)
  app.get('/api/info', (c) => {
    const ip = getLocalIP();
    return c.json({ ip, clientUrl: ip ? `http://${ip}:5173` : null });
  });

  // Health
  app.get('/health', (c) =>
    c.json({ ok: true, rooms: roomStore.count(), cacheEntries: audioCache.count() })
  );

  // oEmbed proxy
  app.get('/api/oembed', async (c) => {
    const url = c.req.query('url');
    if (!url) return c.json({ error: 'Missing url' }, 400);

    const videoId = extractVideoId(url);
    if (!videoId) return c.json({ error: 'Invalid YouTube URL' }, 400);

    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
      const res = await fetch(oembedUrl);
      if (!res.ok) return c.json({ error: 'Failed to fetch oEmbed' }, 502);
      const data = (await res.json()) as { title: string; thumbnail_url: string };
      return c.json({ title: data.title, thumbnailUrl: data.thumbnail_url, videoId });
    } catch {
      return c.json({ error: 'oEmbed fetch error' }, 502);
    }
  });

  // YouTube search proxy
  app.get('/api/search', async (c) => {
    const q = c.req.query('q')?.trim();
    if (!q) return c.json({ error: 'Missing q' }, 400);
    try {
      const results = await searchYouTube(q);
      return c.json({ results });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Search failed';
      return c.json({ error: msg }, 502);
    }
  });

  // Room existence check
  app.get('/api/rooms/:code', (c) => {
    const code = c.req.param('code').toUpperCase();
    const room = roomStore.get(code);
    if (!room) return c.json({ exists: false, participantCount: 0 });
    return c.json({ exists: true, participantCount: room.participants.size });
  });

  // Serve video cache files
  app.use(
    '/video/*',
    serveStatic({
      root: CACHE_DIR,
      rewriteRequestPath: (p) => p.replace(/^\/video/, ''),
    })
  );

  return app;
}
