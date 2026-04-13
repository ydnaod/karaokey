import { readdir, stat, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CACHE_DIR = path.resolve(__dirname, '../../audio-cache');
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
      const match = file.match(/^([a-zA-Z0-9_-]{11})\.webm$/);
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
    await this.evictIfNeeded();
  }

  private totalSize(): number {
    let total = 0;
    for (const e of this.entries.values()) total += e.sizeBytes;
    return total;
  }

  private async evictIfNeeded(): Promise<void> {
    while (this.totalSize() > MAX_SIZE_BYTES && this.entries.size > 0) {
      const oldest = Array.from(this.entries.values()).sort(
        (a, b) => a.lastAccessedAt - b.lastAccessedAt
      )[0];
      await unlink(oldest.filePath).catch(() => {});
      this.entries.delete(oldest.videoId);
      console.log(`[cache] Evicted ${oldest.videoId}`);
    }
  }

  count(): number {
    return this.entries.size;
  }
}

export const audioCache = new AudioCache();
