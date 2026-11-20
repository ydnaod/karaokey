import { nanoid } from 'nanoid';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Room, QueueItem } from './types.js';
import { audioExists } from './ytdlp.js';
const DEFAULT_FILE = fileURLToPath(new URL('../../data/rooms.json', import.meta.url));
export class RoomStore {
    private rooms = new Map<string, Room>();
    private file: string;
    private checkpointDirty = false;
    constructor(file = process.env.ROOMS_FILE || DEFAULT_FILE) {
        this.file = file;
        if (!existsSync(file))
            return;
        const saved = JSON.parse(readFileSync(file, 'utf8'));
        if (saved.version !== 1 || !Array.isArray(saved.rooms))
            throw new Error('Invalid room storage');
        for (const room of saved.rooms) {
            room.participants = new Map();
            room.hostSocketId = '';
            room.expiryTimeout = null;
            room.queue = room.queue.map((q: QueueItem) => ({ ...q, audioReady: audioExists(q.videoId), audioFailed: !audioExists(q.videoId) }));
            if (room.nowPlaying) {
                room.nowPlaying.paused = true;
                room.nowPlaying.pausedAt = Date.now();
                room.nowPlaying.startedAt = Date.now() - room.nowPlaying.positionSeconds * 1000;
                room.nowPlaying.revision = nanoid();
            }
            this.rooms.set(room.code, room);
        }
    }
    save(checkpointOnly = false) {
        if (checkpointOnly && !this.checkpointDirty)
            return;
        mkdirSync(path.dirname(this.file), { recursive: true });
        const rooms = [...this.rooms.values()].map(({ participants, expiryTimeout, hostSocketId, ...room }) => room);
        writeFileSync(this.file + '.tmp', JSON.stringify({ version: 1, rooms }), { mode: 0o600 });
        renameSync(this.file + '.tmp', this.file);
        this.checkpointDirty = false;
    }
    snapshot(room: Room) {
        return { code: room.code, participants: [...room.participants.values()].map(({ displayName, role }) => ({ displayName, role })), queue: room.queue, nowPlaying: room.nowPlaying };
    }
    create(socketId: string, name: string) {
        if (this.rooms.size >= 100)
            throw new Error('MAX_ROOMS_REACHED');
        let code: string;
        do {
            code = Array.from({ length: 4 }, () => 'BCDFGHJKLMNPQRSTVWXYZ'[Math.floor(Math.random() * 20)]).join('');
        } while (this.rooms.has(code));
        const room: Room = { code, hostSocketId: socketId, hostToken: nanoid(32), participants: new Map([[socketId, { socketId, displayName: name, role: 'host', joinedAt: Date.now() }]]), queue: [], nowPlaying: null, createdAt: Date.now(), expiryTimeout: null };
        this.rooms.set(code, room);
        this.save();
        return room;
    }
    get(code: string) { return this.rooms.get(code.toUpperCase()); }
    join(code: string, socketId: string, name: string, token?: string) {
        const room = this.get(code);
        if (!room)
            throw new Error('ROOM_NOT_FOUND');
        const host = token === room.hostToken;
        const demotedSocketId = host && room.hostSocketId !== socketId ? room.hostSocketId : null;
        if (host) {
            if (room.hostSocketId !== socketId && room.nowPlaying) this.pause(room.code);
            const old = room.participants.get(room.hostSocketId);
            if (old)
                old.role = 'participant';
            room.hostSocketId = socketId;
        }
        const participant = { socketId, displayName: name, role: host ? 'host' as const : 'participant' as const, joinedAt: Date.now() };
        room.participants.set(socketId, participant);
        return { room, participant, demotedSocketId };
    }
    leave(code: string, socketId: string) {
        const room = this.get(code);
        if (!room)
            return { room: null, wasHost: false };
        const wasHost = room.hostSocketId === socketId;
        room.participants.delete(socketId);
        if (wasHost) {
            room.hostSocketId = '';
            if (room.nowPlaying)
                this.pause(code);
        }
        return { room, wasHost };
    }
    addToQueue(code: string, item: QueueItem) { const room = this.require(code); if (room.queue.length >= 200)
        throw new Error('QUEUE_FULL'); room.queue.push(item); this.save(); return room; }
    removeFromQueue(code: string, id: string) { const room = this.require(code); room.queue = room.queue.filter(q => q.id !== id); if (room.nowPlaying?.queueItemId === id)
        room.nowPlaying = null; this.save(); return room; }
    reorder(code: string, from: number, to: number) { const room = this.require(code); if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= room.queue.length || to >= room.queue.length)
        throw new Error('INVALID_INDEX'); const [q] = room.queue.splice(from, 1); room.queue.splice(to, 0, q); this.save(); return room; }
    markAudioReady(id: string) { for (const room of this.rooms.values())
        for (const q of room.queue)
            if (q.videoId === id) {
                q.audioReady = true;
                q.audioFailed = false;
            } this.save(); }
    markAudioFailed(id: string) { for (const room of this.rooms.values())
        for (const q of room.queue)
            if (q.videoId === id) {
                q.audioReady = false;
                q.audioFailed = true;
            } this.save(); }
    play(code: string, id: string) { const room = this.require(code); const q = room.queue.find(q => q.id === id); if (!q?.audioReady)
        throw new Error('AUDIO_NOT_READY'); room.nowPlaying = { queueItemId: id, videoId: q.videoId, positionSeconds: 0, revision: nanoid(), startedAt: Date.now(), pitchSemitones: room.nowPlaying?.pitchSemitones ?? 0, paused: false, pausedAt: null }; this.save(); return room; }
    pause(code: string) { const room = this.require(code); const np = room.nowPlaying; if (np && !np.paused) {
        np.paused = true;
        np.pausedAt = Date.now();
        np.startedAt = Date.now() - np.positionSeconds * 1000;
        np.revision = nanoid();
        this.save();
    } return room; }
    resume(code: string) { const room = this.require(code); const np = room.nowPlaying; if (np && np.paused) {
        np.paused = false;
        np.pausedAt = null;
        np.startedAt = Date.now() - np.positionSeconds * 1000;
        np.revision = nanoid();
        this.save();
    } return room; }
    next(code: string) { const room = this.require(code); const remaining = room.queue.filter(q => q.id !== room.nowPlaying?.queueItemId); const next = remaining[0]; if (next && !next.audioReady)
        throw new Error('AUDIO_NOT_READY'); room.queue = remaining; if (next)
        return this.play(code, next.id); room.nowPlaying = null; this.save(); return room; }
    setPitch(code: string, n: number) { if (!Number.isFinite(n))
        throw new Error('INVALID_PITCH'); const room = this.require(code); if (room.nowPlaying)
        room.nowPlaying.pitchSemitones = Math.max(-12, Math.min(12, n)); this.save(); return room; }
    report(code: string, revision: string, position: number, paused: boolean) { const room = this.require(code); const np = room.nowPlaying; if (!np || np.revision !== revision || !Number.isFinite(position) || position < 0 || position > 86400)
        return false; np.positionSeconds = position; np.startedAt = Date.now() - position * 1000; np.paused = paused; np.pausedAt = paused ? Date.now() : null; this.checkpointDirty = true; return true; }
    require(code: string) { const room = this.get(code); if (!room)
        throw new Error('ROOM_NOT_FOUND'); return room; }
    count() { return this.rooms.size; }
}
export const roomStore = new RoomStore();
export function generateQueueItemId() { return nanoid(8); }
