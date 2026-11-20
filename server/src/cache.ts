import { readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CACHE_DIR = process.env.CACHE_DIR || path.resolve(__dirname, '../../audio-cache');
const MAX_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

interface CacheEntry {
  videoId: string;
  filePath: string;
  sizeBytes: number;
  lastAccessedAt: number;
}

class AudioCache {
  private entries = new Map<string, CacheEntry>();

  async loadFromDisk(): Promise<void> {
    if (!existsSync(CACHE_DIR)) return;
    const files = await readdir(CACHE_DIR).catch(() => [] as string[]);
    for (const file of files) {
      const match = file.match(/^([a-zA-Z0-9_-]{11})\.mp4$/);
      if (!match) continue;
      const videoId = match[1];
      const filePath = path.join(CACHE_DIR, file);
      const s = await stat(filePath).catch(() => null);
      if (!s) continue;
      this.entries.set(videoId, {
        videoId,
        filePath,
        sizeBytes: s.size,
        lastAccessedAt: s.mtimeMs,
      });
    }
    console.log(`[cache] Loaded ${this.entries.size} cached audio files`);
  }

  has(videoId: string): boolean {
    return this.entries.has(videoId);
  }

  touch(videoId: string): void {
    const entry = this.entries.get(videoId);
    if (entry) entry.lastAccessedAt = Date.now();
  }

  async register(videoId: string, filePath: string): Promise<void> {
    const s = await stat(filePath).catch(() => null);
    if (!s) return;
    this.entries.set(videoId, {
      videoId,
      filePath,
      sizeBytes: s.size,
      lastAccessedAt: Date.now(),
    });
    // Keep cached media stable during a live session. Clean up between sessions.
  }

  canDownload(): boolean {
    return [...this.entries.values()].reduce((n,e)=>n+e.sizeBytes,0) < MAX_SIZE_BYTES;
  }

  count(): number {
    return this.entries.size;
  }
}

export const audioCache = new AudioCache();
