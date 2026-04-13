# karaokey

A lightweight in-browser karaoke app. Users create/join rooms, queue YouTube videos, and the host controls playback and real-time key (pitch) shifting — playing audio through their device to a TV or speaker.

## System dependencies

These must be installed on the machine running the server. They are not npm packages.

| Dependency | Purpose | Install |
|---|---|---|
| `yt-dlp` | Extracts audio from YouTube URLs | `brew install yt-dlp` |
| `ffmpeg` | Transcodes audio to opus format (required by yt-dlp) | `brew install ffmpeg` |

```bash
# Install both at once (macOS)
brew install yt-dlp ffmpeg

# Cross-platform alternative for yt-dlp
pip3 install yt-dlp
# ffmpeg: https://ffmpeg.org/download.html
```

Keep `yt-dlp` updated periodically — YouTube changes their format occasionally and old versions stop working:

```bash
brew upgrade yt-dlp
# or: pip3 install -U yt-dlp
```

## Architecture overview

npm workspaces monorepo with two packages:

- `server/` — Node.js + Hono + Socket.io API server (port 3001)
- `client/` — React 18 + Vite + TypeScript frontend (port 5173 in dev)

## The key technical challenge

YouTube iframes block Web Audio API access via CORS. Pitch shifting is impossible if you route through the YT iframe. The solution:

1. **Server extracts audio** with `yt-dlp` when a song is queued → saves as `server/audio-cache/<videoId>.webm` (opus)
2. **Host client fetches** the raw audio file and decodes it via `AudioContext.decodeAudioData()`
3. **SoundTouchJS AudioWorklet** (`@soundtouchjs/audio-worklet`) does real-time phase vocoder pitch shifting in the browser — no speed change, just pitch
4. **Muted YouTube iframe** is shown for visuals alongside the extracted audio, kept in sync via offset timestamps + drift correction

Pitch is changed by setting `SoundTouchNode.pitchSemitones.value` (an `AudioParam`) — takes effect within milliseconds, no reload.

## Role model

| Action | Host | Participant |
|---|---|---|
| Audio playback & pitch control | Yes (their device only) | No |
| Play / pause / skip | Yes | No |
| Reorder / remove queue | Yes | No |
| Add songs to queue | Yes | Yes |
| See YouTube video | Yes (muted, for visuals) | No |

## Running locally

```bash
# Prerequisite: yt-dlp must be on your PATH
pip install yt-dlp   # or: brew install yt-dlp

npm install
npm run dev          # starts both server (:3001) and client (:5173)
```

## Key files

| File | Purpose |
|---|---|
| `server/src/rooms.ts` | `RoomStore` — single source of truth for all room/queue/playback/pitch state |
| `server/src/socket.ts` | All Socket.io event handlers + server-side role enforcement |
| `server/src/ytdlp.ts` | Safe `yt-dlp` spawn (uses `spawn` not `exec`, validates videoId regex) |
| `server/src/cache.ts` | LRU disk cache for audio files (2 GB cap) |
| `client/src/hooks/useAudioEngine.ts` | AudioContext + SoundTouchJS worklet setup + pitch control |
| `client/src/components/Player.tsx` | Glues muted YT iframe + audio engine; drift correction every 5s |
| `client/src/hooks/useRoom.ts` | All socket listeners → `useReducer` room state |

## Socket events (quick ref)

**Client → Server:** `room:create`, `room:join`, `room:leave`, `queue:add`, `queue:remove` (host), `queue:reorder` (host), `player:play/pause/resume/next` (host), `pitch:set` (host)

**Server → Client:** `room:created`, `room:joined`, `room:error`, `room:participants`, `role:changed`, `queue:updated`, `audio:ready`, `player:started`, `player:paused`, `player:resumed`, `pitch:changed`

## Caveats

- `yt-dlp` must be installed on the server — it's a system binary, not an npm package
- `server/audio-cache/` is gitignored; created automatically on server start
- YouTube ToS gray area — intended for personal/private use only
