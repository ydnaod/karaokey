import { nanoid } from 'nanoid';
import type { Room, Participant, QueueItem, NowPlaying, RoomSnapshot } from './types.js';

const CONSONANTS = 'BCDFGHJKLMNPQRSTVWXYZ';
const MAX_ROOMS = 20;
const ROOM_EXPIRY_MS = 4 * 60 * 60 * 1000; // 4 hours

function generateCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += CONSONANTS[Math.floor(Math.random() * CONSONANTS.length)];
  }
  return code;
}

class RoomStore {
  private rooms = new Map<string, Room>();

  snapshot(room: Room): RoomSnapshot {
    return {
      code: room.code,
      participants: Array.from(room.participants.values()).map((p) => ({
        displayName: p.displayName,
        role: p.role,
      })),
      queue: room.queue,
      nowPlaying: room.nowPlaying,
    };
  }

  create(hostSocketId: string, displayName: string): Room {
    if (this.rooms.size >= MAX_ROOMS) {
      throw new Error('MAX_ROOMS_REACHED');
    }

    let code: string;
    do {
      code = generateCode();
    } while (this.rooms.has(code));

    const host: Participant = {
      socketId: hostSocketId,
      displayName,
      role: 'host',
      joinedAt: Date.now(),
    };

    const room: Room = {
      code,
      hostSocketId,
      hostToken: nanoid(32),
      participants: new Map([[hostSocketId, host]]),
      queue: [],
      nowPlaying: null,
      createdAt: Date.now(),
      expiryTimeout: null,
    };

    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  join(code: string, socketId: string, displayName: string, hostToken?: string): { room: Room; participant: Participant; demotedSocketId: string | null } {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) throw new Error('ROOM_NOT_FOUND');

    // Cancel expiry if room was about to close
    if (room.expiryTimeout) {
      clearTimeout(room.expiryTimeout);
      room.expiryTimeout = null;
    }

    const isReclaiming = !!hostToken && hostToken === room.hostToken && room.hostSocketId !== socketId;
    let demotedSocketId: string | null = null;

    if (isReclaiming) {
      // Demote current host to participant
      const currentHost = room.participants.get(room.hostSocketId);
      if (currentHost) {
        currentHost.role = 'participant';
        demotedSocketId = room.hostSocketId;
      }
      room.hostSocketId = socketId;
    }

    const role = isReclaiming ? 'host' : (room.participants.size === 0 ? 'host' : 'participant');
    const participant: Participant = {
      socketId,
      displayName,
      role,
      joinedAt: Date.now(),
    };
    room.participants.set(socketId, participant);
    return { room, participant, demotedSocketId };
  }

  leave(code: string, socketId: string): { room: Room; wasHost: boolean; promotedSocketId: string | null } {
    const room = this.rooms.get(code);
    if (!room) return { room: null as unknown as Room, wasHost: false, promotedSocketId: null };

    const wasHost = room.hostSocketId === socketId;
    room.participants.delete(socketId);

    let promotedSocketId: string | null = null;

    if (room.participants.size === 0) {
      // Schedule deletion
      room.expiryTimeout = setTimeout(() => {
        this.rooms.delete(code);
      }, ROOM_EXPIRY_MS);
    } else if (wasHost) {
      // Promote earliest-joined participant
      const next = Array.from(room.participants.values()).sort((a, b) => a.joinedAt - b.joinedAt)[0];
      next.role = 'host';
      room.hostSocketId = next.socketId;
      promotedSocketId = next.socketId;
    }

    return { room, wasHost, promotedSocketId };
  }

  addToQueue(code: string, item: QueueItem): Room {
    const room = this.rooms.get(code);
    if (!room) throw new Error('ROOM_NOT_FOUND');
    room.queue.push(item);
    return room;
  }

  removeFromQueue(code: string, queueItemId: string): Room {
    const room = this.rooms.get(code);
    if (!room) throw new Error('ROOM_NOT_FOUND');
    room.queue = room.queue.filter((q) => q.id !== queueItemId);
    return room;
  }

  reorder(code: string, fromIndex: number, toIndex: number): Room {
    const room = this.rooms.get(code);
    if (!room) throw new Error('ROOM_NOT_FOUND');
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= room.queue.length ||
      toIndex >= room.queue.length
    ) {
      throw new Error('INVALID_INDEX');
    }
    const [item] = room.queue.splice(fromIndex, 1);
    room.queue.splice(toIndex, 0, item);
    return room;
  }

  markAudioReady(videoId: string): void {
    for (const room of this.rooms.values()) {
      for (const item of room.queue) {
        if (item.videoId === videoId) {
          item.audioReady = true;
          item.audioFailed = false;
        }
      }
    }
  }

  markAudioFailed(videoId: string): void {
    for (const room of this.rooms.values()) {
      for (const item of room.queue) {
        if (item.videoId === videoId) {
          item.audioFailed = true;
        }
      }
    }
  }

  play(code: string, queueItemId: string): Room {
    const room = this.rooms.get(code);
    if (!room) throw new Error('ROOM_NOT_FOUND');
    const item = room.queue.find((q) => q.id === queueItemId);
    if (!item) throw new Error('ITEM_NOT_FOUND');

    room.nowPlaying = {
      queueItemId,
      videoId: item.videoId,
      startedAt: Date.now(),
      pitchSemitones: room.nowPlaying?.pitchSemitones ?? 0,
      paused: false,
      pausedAt: null,
    };
    return room;
  }

  pause(code: string): Room {
    const room = this.rooms.get(code);
    if (!room || !room.nowPlaying) throw new Error('NOTHING_PLAYING');
    room.nowPlaying.paused = true;
    room.nowPlaying.pausedAt = Date.now();
    return room;
  }

  resume(code: string): Room {
    const room = this.rooms.get(code);
    if (!room || !room.nowPlaying) throw new Error('NOTHING_PLAYING');
    if (!room.nowPlaying.paused) return room;

    const pausedDuration = Date.now() - (room.nowPlaying.pausedAt ?? Date.now());
    room.nowPlaying.startedAt += pausedDuration; // shift startedAt forward so offset calc stays correct
    room.nowPlaying.paused = false;
    room.nowPlaying.pausedAt = null;
    return room;
  }

  next(code: string): Room {
    const room = this.rooms.get(code);
    if (!room) throw new Error('ROOM_NOT_FOUND');

    if (room.nowPlaying) {
      room.queue = room.queue.filter((q) => q.id !== room.nowPlaying?.queueItemId);
    }

    const nextItem = room.queue[0] ?? null;
    if (nextItem) {
      room.nowPlaying = {
        queueItemId: nextItem.id,
        videoId: nextItem.videoId,
        startedAt: Date.now(),
        pitchSemitones: room.nowPlaying?.pitchSemitones ?? 0,
        paused: false,
        pausedAt: null,
      };
    } else {
      room.nowPlaying = null;
    }

    return room;
  }

  setPitch(code: string, semitones: number): Room {
    const room = this.rooms.get(code);
    if (!room || !room.nowPlaying) throw new Error('NOTHING_PLAYING');
    room.nowPlaying.pitchSemitones = Math.max(-12, Math.min(12, semitones));
    return room;
  }

  count(): number {
    return this.rooms.size;
  }
}

export const roomStore = new RoomStore();
export function generateQueueItemId(): string {
  return nanoid(8);
}
