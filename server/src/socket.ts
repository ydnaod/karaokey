import type { Server } from 'socket.io';
import { roomStore, generateQueueItemId } from './rooms.js';
import { audioCache } from './cache.js';
import { extractAudio, extractVideoId } from './ytdlp.js';
export function registerSocketHandlers(io: Server) {
    // Recovery point stays at most two seconds behind the last host report.
    const saveTimer = setInterval(() => { try {
        roomStore.save(true);
    }
    catch (err) {
        console.error('[storage]', err);
    } }, 2000);
    saveTimer.unref();
    io.on('connection', socket => {
        let code: string | null = null;
        let viewer = false;
        let budget = 0;
        let windowStart = Date.now();
        const room = () => code ? roomStore.get(code) : undefined;
        const host = () => room()?.hostSocketId === socket.id;
        const error = (err: unknown) => socket.emit('room:error', { code: 'REQUEST_FAILED', message: err instanceof Error ? err.message : 'Request failed' });
        const state = () => { const r = room(); if (r)
            io.to(r.code).emit('room:state', roomStore.snapshot(r)); };
        const playback = () => { const r = room(); if (r)
            io.to(r.code).emit('playback:state', { nowPlaying: r.nowPlaying }); };
        function leave() { if (!code)
            return; const old = code; const { room: r, wasHost } = roomStore.leave(old, socket.id); socket.leave(old); code = null; viewer = false; if (r) {
            io.to(old).emit('room:state', roomStore.snapshot(r));
            if (wasHost)
                io.to(old).emit('playback:state', { nowPlaying: r.nowPlaying });
        } }
        // Catch sync errors and rejected async handlers, including malformed client packets.
        function on(event: string, handler: (data: any) => unknown) {
            socket.on(event, (data = {}) => {
                if (Date.now() - windowStart > 1000) {
                    windowStart = Date.now();
                    budget = 0;
                }
                if (++budget > 60) {
                    error(new Error('Too many requests'));
                    return;
                }
                Promise.resolve().then(() => handler(data ?? {})).catch(error);
            });
        }
        on('room:create', ({ displayName }) => { const name = typeof displayName === 'string' ? displayName.trim().slice(0, 32) : ''; if (!name)
            throw new Error('Display name required'); leave(); const r = roomStore.create(socket.id, name); code = r.code; socket.join(code); socket.emit('room:created', { roomCode: code, hostToken: r.hostToken }); socket.emit('room:joined', { room: roomStore.snapshot(r), myRole: 'host' }); });
        on('room:join', ({ roomCode, displayName, hostToken }) => {
            if (typeof roomCode !== 'string' || typeof displayName !== 'string' || !displayName.trim())
                throw new Error('Invalid room or name');
            const next = roomCode.trim().toUpperCase();
            if (code && code !== next)
                leave();
            const { room: r, participant, demotedSocketId } = roomStore.join(next, socket.id, displayName.trim().slice(0, 32), hostToken);
            code = r.code;
            viewer = false;
            socket.join(code);
            if (demotedSocketId)
                io.to(demotedSocketId).emit('role:changed', { newRole: 'participant' });
            socket.emit('room:joined', { room: roomStore.snapshot(r), myRole: participant.role });
            state();
        });
        on('room:watch', ({ roomCode }) => { if (typeof roomCode !== 'string')
            throw new Error('Invalid room'); const r = roomStore.require(roomCode); if (code && code !== r.code)
            leave(); code = r.code; viewer = true; socket.join(code); socket.emit('room:joined', { room: roomStore.snapshot(r), myRole: 'viewer' }); socket.emit('playback:state', { nowPlaying: r.nowPlaying }); });
        on('room:leave', leave);
        socket.on('disconnect', () => { try {
            leave();
        }
        catch (err) {
            console.error(err);
        } });
        on('queue:add', async ({ url, title, thumbnailUrl }) => {
            const r = room();
            if (!r || viewer || !r.participants.has(socket.id))
                return;
            if (typeof url !== 'string')
                throw new Error('Invalid URL');
            const id = extractVideoId(url);
            if (!id)
                throw new Error('Invalid YouTube URL');
            const item = { id: generateQueueItemId(), videoId: id, title: typeof title === 'string' ? title.slice(0, 300) : id, thumbnailUrl: typeof thumbnailUrl === 'string' ? thumbnailUrl.slice(0, 1000) : '', addedBy: r.participants.get(socket.id)!.displayName, audioReady: audioCache.has(id) };
            roomStore.addToQueue(r.code, item);
            state();
            if (!title) {
                void fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`, { signal: AbortSignal.timeout(5000) })
                    .then(async (response) => {
                    if (!response.ok)
                        return;
                    const metadata = await response.json() as {
                        title?: string;
                        thumbnail_url?: string;
                    };
                    if (!r.queue.includes(item))
                        return;
                    if (typeof metadata.title === 'string')
                        item.title = metadata.title.slice(0, 300);
                    if (typeof metadata.thumbnail_url === 'string')
                        item.thumbnailUrl = metadata.thumbnail_url.slice(0, 1000);
                    roomStore.save();
                    io.to(r.code).emit('room:state', roomStore.snapshot(r));
                }).catch(() => { });
            }
            if (item.audioReady)
                return;
            try {
                if (!audioCache.canDownload())
                    throw new Error("Media cache full; clear unused files between sessions");
                const file = await extractAudio(id);
                await audioCache.register(id, file);
                roomStore.markAudioReady(id);
            }
            catch (err) {
                roomStore.markAudioFailed(id);
                console.error('[download]', id, err instanceof Error ? err.message : err);
            }
            // Same video can be queued in several rooms; publish all updated snapshots.
            io.emit('queue:refresh');
            io.to(r.code).emit('room:state', roomStore.snapshot(r));
        });
        on('queue:retry', async ({ queueItemId }) => {
            const r = room();
            if (!r || viewer || !r.participants.has(socket.id))
                return;
            const item = r.queue.find(q => q.id === queueItemId);
            if (!item || !item.audioFailed)
                return;
            item.audioFailed = false;
            roomStore.save();
            state();
            try {
                const file = await extractAudio(item.videoId);
                await audioCache.register(item.videoId, file);
                roomStore.markAudioReady(item.videoId);
            }
            catch (err) {
                roomStore.markAudioFailed(item.videoId);
                error(err);
            }
            io.emit('queue:refresh');
            io.to(r.code).emit('room:state', roomStore.snapshot(r));
        });
        on('room:sync', () => { const r = room(); if (r)
            socket.emit('room:state', roomStore.snapshot(r)); });
        function control(event: string, fn: (data: any) => void) { on(event, data => { if (!host())
            return; fn(data); state(); }); }
        control('queue:remove', ({ queueItemId }) => { const was = room()?.nowPlaying?.queueItemId === queueItemId; roomStore.removeFromQueue(code!, queueItemId); if (was)
            playback(); });
        control('queue:reorder', ({ fromIndex, toIndex }) => roomStore.reorder(code!, fromIndex, toIndex));
        control('player:play', ({ queueItemId }) => roomStore.play(code!, queueItemId));
        control('player:pause', () => roomStore.pause(code!));
        control('player:resume', () => roomStore.resume(code!));
        control('player:restart', () => { const np = room()?.nowPlaying; if (np)
            roomStore.play(code!, np.queueItemId); });
        control('player:next', ({ revision }) => { const np = room()?.nowPlaying; if (revision && revision !== np?.revision)
            return; roomStore.next(code!); if (!room()?.nowPlaying)
            playback(); });
        control('pitch:set', ({ semitones }) => roomStore.setPitch(code!, semitones));
        on('playback:report', ({ revision, positionSeconds, paused }) => { if (!host() || typeof paused !== 'boolean')
            return; if (roomStore.report(code!, revision, positionSeconds, paused))
            playback(); });
    });
}
