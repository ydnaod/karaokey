# Demo readiness — 2026-10-23

## Start and stop

Double-click `start.command`, or run:

```sh
cd /Users/andydo/repos/karaokey
PATH="/Users/andydo/.nvm/versions/node/v22.19.0/bin:$PATH" npm run demo
```

Open **http://localhost:5173** on the host laptop. Keep this terminal open; Ctrl+C stops the app. `start.command` chooses an already installed Node 20+ from nvm if the current Node is older, for that process only. It installs nothing and changes no global defaults. `npm run demo` builds and runs the compiled API (no API file watcher) plus the Vite client. `npm run dev` is still available for development.

Guests use the QR/link on the same Wi-Fi. Connect the laptop to the speaker before playback. Use Open Display for a muted TV video window; the host laptop remains the audio source. Keep the host tab awake. Host playback must use localhost (or a secure HTTPS origin); plain LAN HTTP does not provide AudioWorklet on other devices.

## Recovery and boundaries

- `data/rooms.json` is the versioned atomic room store, gitignored and written with owner-only file permissions. It contains room codes, queues, host tokens, pitch and playback checkpoints. Do not share it or remove it during a session. One API process owns it; this is not a multi-server database.
- Queue/control mutations are saved immediately. Actual media position is checkpointed every two seconds while reports arrive. A hard crash can lose roughly two seconds of position, plus the report interval; a power-loss guarantee is not provided.
- Server restart restores the same room codes, queues and host credentials. All clients rejoin on connection recovery. Reloading the host page uses its existing browser storage to reclaim host authority. Guests are not automatically promoted when the host disconnects.
- Recovery is **paused**. Click Play on the host to resume from the saved position. Restarting the server/media source or refreshing the playback browser can interrupt media. Controls and playback still run in the host page; independent uninterrupted playback would require a separate playback device/page and ownership UI.
- Host media position, pause and seek reports drive the TV, rather than independent wall clocks. Reports carry a playback revision to reject stale data. The TV corrects drift and pauses after two seconds without reports. This is approximate synchronization, not frame-locked HDMI mirroring.
- Downloads/search share two worker slots, at most 40 queued jobs and a two-minute subprocess timeout. Duplicate video requests share a download. Process groups are killed on timeout/normal service exit, including ffmpeg on macOS. A hard OS kill can still orphan an external child process.
- Download admission checks a 2 GiB cache budget; active downloads can overshoot that threshold. yt-dlp has a 500 MB per-file limit. Media is no longer evicted during a live session, because that can break playback or persisted queues. Clear unused cache files **between sessions** if full. Existing cache was about 1 GiB at inspection.
- Queue is capped at 200 songs/room and storage at 100 rooms. Rooms are retained, not automatically expired. Missing media after restart is marked failed; Retry download preserves its queue item.
- Do not clear browser storage before the demo: the original host credential is stored there. No server-side host-password recovery UI is included.

## What reproduced the crash

Baseline: Node 22.19.0, 20 connected clients in one room, 20 cached-song additions, queue reorders, playback controls and a 10-client reconnect wave. This stage stayed healthy. A `ps` sample showed 103,760 KiB RSS and 9.9% CPU.

Next, 20 controlled yt-dlp failures were requested with a temporary fake binary (no network downloads). The server exited with code 1. `extractAudio()` called `promise.finally(...)` and ignored the newly returned rejecting promise, so a handled download error still became an unhandled rejection. This proves a reproducible crash path; it does **not** establish the cause of the earlier real event. Unbounded downloader concurrency was also a resource risk, not a measured historical OOM.

## Verification performed

`npm test` uses isolated temporary storage and controlled downloader fixtures, with no real downloads:

- 20 active Socket.io clients, additions, reorder and room broadcasts.
- Late display gets actual reported position.
- Repeated pause/resume; stale reports ignored; guests cannot control/report playback.
- SIGKILL API restart restores room code, 20-item queue, pitch and position; 20 clients rejoin.
- Replacement host socket (refresh model) recovers host authority.
- 20 failed downloads and 20 concurrent searches share a maximum of two active jobs; server survives. Observed RSS peak approximately 109 MiB in this bounded test.
- Five requests for a new video share one successful download; success propagates to all items. Failed retries settle correctly.
- Unfinished Next is rejected; final song clears playback; repeated empty controls and malformed packets do not crash.
- Durable file remains parseable. These checks establish this workload, not a maximum supported audience or a long-running soak guarantee.

Browser checks in Chrome, using two generated 180-second MP4 fixtures:

- Create room; start video/audio pipeline; change pitch; pause/resume/restart.
- A → B → A changes load the correct source in both host and TV.
- Host refresh while playing recovers paused; Play resumes. Refresh initially exposed a worklet lifecycle bug, fixed by deferring audio graph initialization until playback.
- Seek to 90 seconds while paused yields 90 seconds on both videos.
- Last-song Next clears both players without a console error.
- Service-only restart with both tabs open reconnects automatically; both paused at 6.421333 seconds. Earlier full Vite/API restart stalled one automated TV tab; reopening recovered it. The later API-only test passed without reopening.
- Initial moving-video samples differed by roughly 0.05–0.20 seconds; final TV correction threshold is 0.15 seconds, 0.02 while paused. Real Wi-Fi/TV latency is not measured.
- One live app search returned HTTP 200 and 10 YouTube results.

Both workspace builds/type checks pass. Shell syntax and `git diff --check` pass. Build warns about old Browserslist data; no dependency update was performed.

Not performed: real new-media YouTube download, physical speaker audibility/latency, HDMI/AirPlay/TV hardware, Safari, phone-on-venue-Wi-Fi test, extended soak, disk-full fault injection, full 120-second timeout test. Verify these physical/network conditions before presenting; cache the intended demo songs in advance.

All code changes are local. No dependencies installed, credentials changed, remote push or deployment.

## Local file inventory

- `.gitignore`
- `CLAUDE.md`
- `DEMO.md`
- `README.md`
- `client/src/components/Player.tsx`
- `client/src/components/Queue.tsx`
- `client/src/hooks/useAudioEngine.ts`
- `client/src/hooks/useRoom.ts`
- `client/src/pages/Display.tsx`
- `client/src/pages/Home.tsx`
- `client/src/pages/Room.tsx`
- `client/src/types.ts`
- `client/tsconfig.json`
- `package.json`
- `server/src/cache.ts`
- `server/src/hono.ts`
- `server/src/index.ts`
- `server/src/jobs.ts`
- `server/src/rooms.ts`
- `server/src/socket.ts`
- `server/src/types.ts`
- `server/src/ytdlp.ts`
- `start.command`
- `tests/demo.integration.mjs`

Normal demo startup was verified through `bash start.command`: API health OK, 99 existing cached files, 0 test rooms, 0 active/pending downloader jobs, frontend HTTP 200. Test storage stayed under temporary directories. No test media was added to the normal cache.

## Pinned downloader

Karaokey invokes `.venv-ytdlp/bin/yt-dlp` by absolute path relative to the server module, regardless of the current working directory or shell PATH. `requirements-ytdlp.lock` pins yt-dlp **2026.10.21** and all installed runtime dependencies. The virtual environment is gitignored. Homebrew's yt-dlp is no longer used by default.

Set up using an already installed Python 3.10+ (this Mac):

```sh
PYTHON_BIN=/usr/local/opt/python@3.14/bin/python3.14 bash setup-downloader.command
.venv-ytdlp/bin/yt-dlp --version
.venv-ytdlp/bin/python -m pip check
bash start.command
```

Elsewhere set `PYTHON_BIN` to your installed compatible Python. A supported JavaScript runtime such as Deno and ffmpeg must remain available on PATH. Installation uses official PyPI. To intentionally select another downloader, set `YTDLP_PATH` to its absolute executable path; the server logs the selected path and the launcher prints its version. No fallback to a global downloader occurs when the local environment is missing.

After updating server code, restart your running server once to load the explicit executable selection. Rooms and queue persist; playback may be interrupted. Failed songs require **Retry download**, not just a page refresh. Upgrading yt-dlp does not guarantee every YouTube download succeeds.
