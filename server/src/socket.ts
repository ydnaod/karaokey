import type { Server } from 'socket.io';
import { roomStore, generateQueueItemId } from './rooms.js';
import { audioCache } from './cache.js';
import { extractAudio, extractVideoId, validateVideoId } from './ytdlp.js';

export function registerSocketHandlers(io: Server) {
  io.on('connection', (socket) => {
    let currentRoomCode: string | null = null;

    function getRoom() {
      if (!currentRoomCode) return null;
      return roomStore.get(currentRoomCode) ?? null;
    }

    function isHost(): boolean {
      const room = getRoom();
      return room?.hostSocketId === socket.id;
    }

    // Create room — called by the host
    socket.on('room:create', ({ displayName }: { displayName: string }) => {
      const name = (displayName ?? '').trim().slice(0, 32);
      if (!name) {
        socket.emit('room:error', { code: 'INVALID_NAME', message: 'Display name required' });
        return;
      }
      try {
        const room = roomStore.create(socket.id, name);
        currentRoomCode = room.code;
        socket.join(room.code);
        socket.emit('room:created', { roomCode: room.code });
        // Also send joined event right away so client has full state
        socket.emit('room:joined', {
          room: roomStore.snapshot(room),
          myRole: 'host',
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        socket.emit('room:error', { code: msg, message: 'Failed to create room' });
      }
    });

    socket.on('room:join', ({ roomCode, displayName }: { roomCode: string; displayName: string }) => {
      const code = (roomCode ?? '').trim().toUpperCase();
      const name = (displayName ?? '').trim().slice(0, 32);

      if (!name) {
        socket.emit('room:error', { code: 'INVALID_NAME', message: 'Display name required' });
        return;
      }

      try {
        const { room } = roomStore.join(code, socket.id, name);
        currentRoomCode = room.code;
        socket.join(room.code);

        const participant = room.participants.get(socket.id)!;
        socket.emit('room:joined', {
          room: roomStore.snapshot(room),
          myRole: participant.role,
        });

        // Notify others of updated participant list
        socket.to(room.code).emit('room:participants', {
          participants: Array.from(room.participants.values()).map((p) => ({
            displayName: p.displayName,
            role: p.role,
          })),
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        socket.emit('room:error', { code: msg, message: 'Failed to join room' });
      }
    });

    socket.on('room:leave', () => {
      handleLeave();
    });

    socket.on('disconnect', () => {
      handleLeave();
    });

    function handleLeave() {
      if (!currentRoomCode) return;
      const code = currentRoomCode;
      currentRoomCode = null;

      const { room, promotedSocketId } = roomStore.leave(code, socket.id);
      socket.leave(code);

      if (!room || room.participants.size === 0) return;

      if (promotedSocketId) {
        io.to(promotedSocketId).emit('role:changed', { newRole: 'host' });
      }

      io.to(code).emit('room:participants', {
        participants: Array.from(room.participants.values()).map((p) => ({
          displayName: p.displayName,
          role: p.role,
        })),
      });
    }

    // Queue: add (all participants)
    socket.on('queue:add', async ({ url }: { url: string }) => {
      const room = getRoom();
      if (!room) return;

      const videoId = extractVideoId(url ?? '');
      if (!videoId) {
        socket.emit('room:error', { code: 'INVALID_URL', message: 'Invalid YouTube URL' });
        return;
      }

      // Fetch metadata
      let title = videoId;
      let thumbnailUrl = '';
      try {
        const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        const res = await fetch(oembedUrl);
        if (res.ok) {
          const data = (await res.json()) as { title: string; thumbnail_url: string };
          title = data.title;
          thumbnailUrl = data.thumbnail_url;
        }
      } catch {
        // proceed with defaults
      }

      const addedBy = room.participants.get(socket.id)?.displayName ?? 'Unknown';
      const item = {
        id: generateQueueItemId(),
        videoId,
        title,
        thumbnailUrl,
        addedBy,
        audioReady: audioCache.has(videoId),
      };

      roomStore.addToQueue(room.code, item);
      io.to(room.code).emit('queue:updated', { queue: room.queue });

      if (!audioCache.has(videoId)) {
        // Extract audio in the background
        extractAudio(videoId)
          .then(async (filePath) => {
            await audioCache.register(videoId, filePath);
            roomStore.markAudioReady(videoId);
            io.to(room.code).emit('audio:ready', { videoId });
            io.to(room.code).emit('queue:updated', { queue: room.queue });
          })
          .catch((err) => {
            console.error(`[ytdlp] Failed to extract ${videoId}:`, err.message);
          });
      }
    });

    // Queue: remove (host only)
    socket.on('queue:remove', ({ queueItemId }: { queueItemId: string }) => {
      if (!isHost()) return;
      const room = getRoom();
      if (!room) return;

      roomStore.removeFromQueue(room.code, queueItemId);
      io.to(room.code).emit('queue:updated', { queue: room.queue });
    });

    // Queue: reorder (host only)
    socket.on('queue:reorder', ({ fromIndex, toIndex }: { fromIndex: number; toIndex: number }) => {
      if (!isHost()) return;
      const room = getRoom();
      if (!room) return;

      try {
        roomStore.reorder(room.code, fromIndex, toIndex);
        io.to(room.code).emit('queue:updated', { queue: room.queue });
      } catch {
        // invalid indices — ignore
      }
    });

    // Player: play (host only)
    socket.on('player:play', ({ queueItemId }: { queueItemId: string }) => {
      if (!isHost()) return;
      const room = getRoom();
      if (!room) return;

      const item = room.queue.find((q) => q.id === queueItemId);
      if (!item || !item.audioReady) {
        socket.emit('room:error', { code: 'AUDIO_NOT_READY', message: 'Audio not ready yet' });
        return;
      }

      roomStore.play(room.code, queueItemId);
      io.to(room.code).emit('player:started', {
        nowPlaying: room.nowPlaying,
        queue: room.queue,
      });
    });

    // Player: pause (host only)
    socket.on('player:pause', () => {
      if (!isHost()) return;
      const room = getRoom();
      if (!room || !room.nowPlaying) return;

      roomStore.pause(room.code);
      const elapsed = room.nowPlaying.pausedAt
        ? (room.nowPlaying.pausedAt - room.nowPlaying.startedAt) / 1000
        : 0;
      io.to(room.code).emit('player:paused', { positionSeconds: elapsed });
    });

    // Player: resume (host only)
    socket.on('player:resume', () => {
      if (!isHost()) return;
      const room = getRoom();
      if (!room || !room.nowPlaying) return;

      roomStore.resume(room.code);
      io.to(room.code).emit('player:resumed', {
        nowPlaying: room.nowPlaying,
        serverTime: Date.now(),
      });
    });

    // Player: next (host only)
    socket.on('player:next', () => {
      if (!isHost()) return;
      const room = getRoom();
      if (!room) return;

      roomStore.next(room.code);
      io.to(room.code).emit('player:started', {
        nowPlaying: room.nowPlaying,
        queue: room.queue,
      });
    });

    // Display: watch-only connection for TV display (no participant entry)
    socket.on('room:watch', ({ roomCode }: { roomCode: string }) => {
      const code = (roomCode ?? '').trim().toUpperCase();
      const room = roomStore.get(code);
      if (!room) {
        socket.emit('room:error', { code: 'NOT_FOUND', message: 'Room not found' });
        return;
      }
      currentRoomCode = code;
      socket.join(code);
      socket.emit('room:joined', { room: roomStore.snapshot(room), myRole: 'viewer' });
    });

    // Pitch: set (host only)
    socket.on('pitch:set', ({ semitones }: { semitones: number }) => {
      if (!isHost()) return;
      const room = getRoom();
      if (!room || !room.nowPlaying) return;

      try {
        roomStore.setPitch(room.code, semitones);
        io.to(room.code).emit('pitch:changed', { semitones: room.nowPlaying.pitchSemitones });
      } catch {
        // nothing playing
      }
    });
  });
}
