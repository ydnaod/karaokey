import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { roomStore } from './rooms.js';
import { audioCache, CACHE_DIR } from './cache.js';
import { extractVideoId } from './ytdlp.js';

export function buildHonoApp() {
  const app = new Hono();

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
