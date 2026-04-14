import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { readdir, unlink } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(__dirname, '../../audio-cache');

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

export function extractAudio(videoId: string): Promise<string> {
  if (!validateVideoId(videoId)) {
    return Promise.reject(new Error('INVALID_VIDEO_ID'));
  }

  const outPath = audioPath(videoId);
  if (existsSync(outPath)) {
    return Promise.resolve(outPath);
  }

  return new Promise((resolve, reject) => {
    const args = [
      '-f', 'bestvideo[height<=720]+bestaudio/best[height<=720]',
      '--merge-output-format', 'mp4',
      '-o', path.join(CACHE_DIR, '%(id)s.mp4'),
      '--no-playlist',
      '--',
      videoId,
    ];

    const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    async function cleanupPartials() {
      try {
        const files = await readdir(CACHE_DIR);
        await Promise.all(
          files
            .filter((f) => f.startsWith(videoId + '.') && f !== `${videoId}.webm`)
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
  });
}

export interface SearchResult {
  videoId: string;
  title: string;
  thumbnail: string;
  duration: number | null;   // seconds
  channelName: string;
}

export function searchYouTube(query: string, limit = 10): Promise<SearchResult[]> {
  return new Promise((resolve, reject) => {
    const args = [
      `ytsearch${limit}:${query}`,
      '--flat-playlist',
      '--dump-json',
      '--quiet',
      '--no-warnings',
    ];

    const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });

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
  });
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
