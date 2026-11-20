import { spawn } from 'child_process';
import { runJob } from './jobs.js';
import { audioCache } from './cache.js';
import { existsSync } from 'fs';
import { readdir, unlink } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolve relative to this module, never the caller's working directory or PATH.
const downloaderPath = process.env.YTDLP_PATH || path.resolve(__dirname, '../../.venv-ytdlp/bin/yt-dlp');
if (!path.isAbsolute(downloaderPath)) throw new Error('YTDLP_PATH must be an absolute executable path');
console.log('[downloader] executable:', downloaderPath);
const CACHE_DIR = process.env.CACHE_DIR || path.resolve(__dirname, '../../audio-cache');

// Kill the whole downloader process group, including ffmpeg, on timeout/shutdown.
const children = new Set<ReturnType<typeof spawn>>();
function stopChild(child: ReturnType<typeof spawn>) {
  if (!child.pid) return;
  try { if (process.platform === 'win32') child.kill('SIGKILL'); else process.kill(-child.pid, 'SIGKILL'); } catch { /* already exited */ }
}
process.once('exit', () => { for (const child of children) stopChild(child); });
function downloader(args: string[]) {
  const child = spawn(downloaderPath, args, { stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
  children.add(child);
  const timer = setTimeout(() => stopChild(child), 120000);
  timer.unref();
  child.once('close', () => { clearTimeout(timer); children.delete(child); });
  return child;
}

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export function validateVideoId(videoId: string): boolean {
  return VIDEO_ID_RE.test(videoId);
}

export function audioPath(videoId: string): string {
  return path.join(CACHE_DIR, `${videoId}.mp4`);
}

export function audioExists(videoId: string): boolean {
  return existsSync(audioPath(videoId));
}

const inFlight = new Map<string, Promise<string>>();

export function extractAudio(videoId: string): Promise<string> {
  if (!validateVideoId(videoId)) {
    return Promise.reject(new Error('INVALID_VIDEO_ID'));
  }

  const outPath = audioPath(videoId);
  if (existsSync(outPath)) {
    return Promise.resolve(outPath);
  }

  const existing = inFlight.get(videoId);
  if (existing) return existing;

  const promise = runJob(() => new Promise<string>((resolve, reject) => {
    if (!audioCache.canDownload()) { reject(new Error('Media cache full; clear unused files between sessions')); return; }
    const args = [
      '--socket-timeout', '20', '--retries', '1', '--no-progress',
      '--max-filesize', '500M',
      '-f', 'bestvideo[height<=720]+bestaudio/best[height<=720]',
      '--merge-output-format', 'mp4',
      '-o', path.join(CACHE_DIR, '%(id)s.mp4'),
      '--no-playlist',
      '--',
      videoId,
    ];

    const proc = downloader(args);

    proc.stdout!.resume();
    let stderr = '';
    proc.stderr!.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });

    async function cleanupPartials() {
      try {
        const files = await readdir(CACHE_DIR);
        await Promise.all(
          files
            .filter((f) => f.startsWith(videoId + '.'))
            .map((f) => unlink(path.join(CACHE_DIR, f)).catch(() => {}))
        );
      } catch {
        // best-effort
      }
    }

    proc.on('close', async (code) => {
      if (code === 0 && existsSync(outPath)) {
        resolve(outPath);
      } else {
        await cleanupPartials();
        reject(new Error(`yt-dlp exited with code ${code}: ${stderr.slice(-500)}`));
      }
    });

    proc.on('error', async (err) => {
      await cleanupPartials();
      reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
    });
  }));

  inFlight.set(videoId, promise);
  const clear = () => { if (inFlight.get(videoId) === promise) inFlight.delete(videoId); };
  void promise.then(clear, clear);
  return promise;
}

export interface SearchResult {
  videoId: string;
  title: string;
  thumbnail: string;
  duration: number | null;   // seconds
  channelName: string;
}

export function searchYouTube(query: string, limit = 10): Promise<SearchResult[]> {
  return runJob(() => new Promise<SearchResult[]>((resolve, reject) => {
    const args = [
      `ytsearch${limit}:${query}`,
      '--flat-playlist',
      '--dump-json',
      '--quiet',
      '--no-warnings',
    ];

    const proc = downloader(args);

    proc.stderr!.resume();
    let stdout = '';
    proc.stdout!.on('data', (chunk: Buffer) => { stdout = (stdout + chunk.toString()).slice(-2_000_000); });

    proc.on('close', (code) => {
      if (code !== 0 && stdout.trim() === '') {
        reject(new Error(`yt-dlp search failed with code ${code}`));
        return;
      }
      const results: SearchResult[] = [];
      for (const line of stdout.trim().split('\n')) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line) as {
            id: string;
            title: string;
            thumbnail?: string;
            thumbnails?: { url: string }[];
            duration?: number;
            uploader?: string;
            channel?: string;
          };
          if (!entry.id || !validateVideoId(entry.id)) continue;
          const thumbnail =
            entry.thumbnail ??
            entry.thumbnails?.slice(-1)[0]?.url ??
            `https://i.ytimg.com/vi/${entry.id}/mqdefault.jpg`;
          results.push({
            videoId: entry.id,
            title: entry.title,
            thumbnail,
            duration: entry.duration ?? null,
            channelName: entry.uploader ?? entry.channel ?? '',
          });
        } catch {
          // skip malformed line
        }
      }
      resolve(results);
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
    });
  }));
}

export function extractVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    // Standard watch URL
    const v = parsed.searchParams.get('v');
    if (v && validateVideoId(v)) return v;
    // youtu.be short URL
    if (parsed.hostname === 'youtu.be') {
      const id = parsed.pathname.slice(1).split('?')[0];
      if (validateVideoId(id)) return id;
    }
    return null;
  } catch {
    return null;
  }
}
