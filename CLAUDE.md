# karaokey

An npm-workspaces karaoke app: React 18/Vite/TypeScript client (5173), Node/Hono/Socket.io service (3001). Use Node 20+ and system `yt-dlp`/`ffmpeg`.

## Development and verification

- `npm run dev`: API watcher plus Vite.
- `npm run build`: client type check/Vite build and API TypeScript build.
- `npm test`: isolated 20-client integration/restart/downloader tests; uses existing dependencies and fake media/downloader fixtures.
- `npm run demo`: build, compiled API without a watcher, and Vite frontend. `start.command` selects an installed supported runtime for this launch only.
- See [DEMO.md](DEMO.md) for recovery behavior, measured checks, limitations and tonight's startup steps.

## Ownership and lifecycle

`server/src/rooms.ts` owns room state, persists atomic JSON snapshots in `data/rooms.json`, and restores rooms paused. Room codes and host tokens survive service restarts; socket participants do not. Host identity is reclaimed with the saved browser token. No automatic promotion on disconnect: guests must not unexpectedly become the audio source.

The room page hosts controls and the single authoritative playback engine. `/display/:code` is muted, watch-only TV playback. Host refresh/disconnect pauses playback. Queue durability is independent of browser lifetime; uninterrupted audio across playback-browser or media-server restart is not promised.

`server/src/socket.ts` validates/catches client requests, enforces host ownership, bounds per-socket event rate and publishes snapshots. Commands update playback revisions. The host sends `playback:report` with actual video position/paused state every 250 ms; only the active host and matching revision are accepted. `playback:state` drives TV correction. Playback checkpoints save every two seconds while dirty.

## Media

`server/src/ytdlp.ts` spawns yt-dlp safely using arguments and validated video IDs; duplicate downloads are shared. `server/src/jobs.ts` caps downloads/searches at two active and 40 pending jobs. Subprocess groups have a two-minute deadline. Failures are handled without floating rejected promises.

Downloaded media stays in `audio-cache/<videoId>.mp4`. **Do not change the merge output to WebM.** YouTube can serve h264, which cannot be stream-copied into WebM. The format selector remains `bestvideo[height<=720]+bestaudio/best[height<=720]` with MP4 merge output.

`client/src/hooks/useAudioEngine.ts` routes a native video element through a SoundTouch AudioWorklet. Initialize the graph only when playing, and unlock/resume AudioContext from a user gesture. Always load the currently requested source, including A→B→A repeats. Cancel obsolete playback operations when the command revision changes.

The TV follows measured host media time, uses local elapsed time between reports, corrects drift and pauses after missing reports. It never advances the queue itself. Handle `nowPlaying: null` explicitly.

No cache eviction during live playback. Admission uses a soft 2 GiB budget, with possible active-download overshoot; cleanup belongs between sessions. Missing media is marked failed on restore and can be retried.

## Configuration

`PORT` defaults to 3001. `ROOMS_FILE` and `CACHE_DIR` override storage for isolated testing. Never check runtime room data or credentials into Git. The default store is single-process, versioned JSON. Invalid storage fails startup rather than silently discarding rooms. Existing file permissions are not broadly changed.
