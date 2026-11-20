import { createServer } from 'http';
import { createAdaptorServer } from '@hono/node-server';
import { Server as SocketServer } from 'socket.io';
import { buildHonoApp } from './hono.js';
import { registerSocketHandlers } from './socket.js';
import { audioCache } from './cache.js';
import { roomStore } from './rooms.js';
import { mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = process.env.CACHE_DIR || path.resolve(__dirname, '../../audio-cache');
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  await audioCache.loadFromDisk();

  const honoApp = buildHonoApp();

  const httpServer = createAdaptorServer({
    fetch: honoApp.fetch,
    createServer,
  });

  const io = new SocketServer(httpServer, {
    cors: {
      origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
      methods: ['GET', 'POST'],
    },
  });

  registerSocketHandlers(io);

  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    try { roomStore.save(); } catch (err) { console.error('[storage] checkpoint failed', err); }
    io.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  httpServer.listen(PORT, () => {
    console.log(`[karaokey] Server running on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('[karaokey] Fatal error:', err);
  process.exit(1);
});
