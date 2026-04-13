import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(__dirname, '../../audio-cache');

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export function validateVideoId(videoId: string): boolean {
  return VIDEO_ID_RE.test(videoId);
}

export function audioPath(videoId: string): string {
  return path.join(CACHE_DIR, `${videoId}.webm`);
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
      '-f', 'bestvideo[height<=720][ext=webm]+bestaudio[ext=webm]/bestvideo[height<=720]+bestaudio/best[height<=720]',
      '--merge-output-format', 'webm',
      '-o', path.join(CACHE_DIR, '%(id)s.webm'),
      '--no-playlist',
      '--',
      videoId,
    ];

    const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code) => {
      if (code === 0 && existsSync(outPath)) {
        resolve(outPath);
      } else {
        reject(new Error(`yt-dlp exited with code ${code}: ${stderr.slice(-500)}`));
      }
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
