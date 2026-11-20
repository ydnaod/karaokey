import { useEffect, useRef, useState } from 'react';
import { socket } from '../socket';
import type { AudioEngine } from '../hooks/useAudioEngine';
import PitchControl from './PitchControl';
import type { NowPlaying, QueueItem } from '../types';
interface Props {
    audio: AudioEngine;
    videoRef: React.RefObject<HTMLVideoElement>;
    nowPlaying: NowPlaying;
    queue: QueueItem[];
    pitchSemitones: number;
    roomCode: string;
}
export default function Player({ audio, videoRef, nowPlaying, queue, pitchSemitones, roomCode }: Props) {
    const nowPlayingRef = useRef(nowPlaying);
    nowPlayingRef.current = nowPlaying;
    const queueRef = useRef(queue);
    queueRef.current = queue;
    const [playbackError, setPlaybackError] = useState('');
    const [progress, setProgress] = useState({ position: 0, duration: 0 });
    const appliedRevision = useRef<string | null>(null);
    const waitingForNext = useRef(false);
    useEffect(() => {
        const abort = new AbortController();
        appliedRevision.current = null;
        waitingForNext.current = false;
        setPlaybackError('');
        void (async () => {
            await audio.load(nowPlaying.videoId);
            if (abort.signal.aborted)
                return;
            audio.setPitch(nowPlaying.pitchSemitones);
            if (nowPlaying.paused) {
                audio.pause();
                if (videoRef.current)
                    videoRef.current.currentTime = nowPlaying.positionSeconds;
            }
            else {
                await audio.play(nowPlaying.positionSeconds, abort.signal);
            }
            if (!abort.signal.aborted)
                appliedRevision.current = nowPlaying.revision;
        })().catch(err => { if (!abort.signal.aborted) {
            setPlaybackError(String(err));
            audio.pause();
            socket.emit('player:pause');
        } });
        return () => { abort.abort(); audio.pause(); };
    }, [nowPlaying.revision, audio, videoRef]);
    useEffect(() => { audio.setPitch(pitchSemitones); }, [pitchSemitones, audio]);
    useEffect(() => {
        const video = videoRef.current;
        if (!video)
            return;
        const report = () => {
            setProgress({ position: video.currentTime, duration: Number.isFinite(video.duration) ? video.duration : 0 });
            if (socket.connected && appliedRevision.current === nowPlayingRef.current.revision)
                socket.volatile.emit('playback:report', { revision: appliedRevision.current, positionSeconds: video.currentTime, paused: video.paused || video.readyState < 3 });
        };
        const ended = () => {
            waitingForNext.current = true;
            const next = queueRef.current.find(q => q.id !== nowPlayingRef.current.queueItemId);
            if (!next || next.audioReady) {
                waitingForNext.current = false;
                socket.emit('player:next', { revision: nowPlayingRef.current.revision });
            }
        };
        const disconnected = () => { appliedRevision.current = null; audio.pause(); };
        const timer = setInterval(report, 250);
        const events = ['play', 'pause', 'seeked', 'waiting', 'playing'];
        events.forEach(e => video.addEventListener(e, report));
        video.addEventListener('ended', ended);
        socket.on('disconnect', disconnected);
        return () => { clearInterval(timer); events.forEach(e => video.removeEventListener(e, report)); video.removeEventListener('ended', ended); socket.off('disconnect', disconnected); };
    }, [audio, videoRef]);
    useEffect(() => {
        if (!waitingForNext.current)
            return;
        const next = queue.find(q => q.id !== nowPlaying.queueItemId);
        if (!next || next.audioReady) {
            waitingForNext.current = false;
            socket.emit('player:next', { revision: nowPlaying.revision });
        }
    }, [queue, nowPlaying.queueItemId, nowPlaying.revision]);
    function handlePause() { socket.emit('player:pause'); }
    function handleResume() { socket.emit('player:resume'); }
    function handleNext() { socket.emit('player:next', { revision: nowPlaying.revision }); }
    function handleRestart() { socket.emit('player:restart'); }
    function handleOpenDisplay() {
        window.open(`${window.location.origin}/display/${roomCode}`, '_blank', 'noopener');
    }
    const currentItem = queue.find((q) => q.id === nowPlaying.queueItemId);
    return (<div className="flex flex-col bg-gray-900 rounded-xl overflow-hidden">
      {/* Native video element — audio routed through SoundTouchJS for pitch shift */}
      <video ref={videoRef} className="w-full" playsInline/>

      {playbackError && <p role="alert" className="p-3 text-red-300">{playbackError}. Click Play to retry.</p>}
      <input aria-label="Playback position" className="mx-4" type="range" min="0" max={progress.duration || 1} step="0.1" value={progress.position} disabled={!progress.duration} onChange={e => { const v = videoRef.current; if (v)
        v.currentTime = Number(e.target.value); }}/>
      {/* Song info */}
      <div className="px-4 pt-3 pb-1">
        <p className="font-semibold text-white truncate">{currentItem?.title ?? 'Unknown'}</p>
        <p className="text-xs text-gray-400">added by {currentItem?.addedBy}</p>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
        <button onClick={handleResume} disabled={!nowPlaying.paused} className="w-10 h-10 rounded-full bg-pink-600 hover:bg-pink-500 disabled:opacity-30 flex items-center justify-center text-xl transition-colors" aria-label="Play">
          ▶
        </button>
        <button onClick={handlePause} disabled={nowPlaying.paused} className="w-10 h-10 rounded-full bg-gray-700 hover:bg-gray-600 disabled:opacity-30 flex items-center justify-center text-xl transition-colors" aria-label="Pause">
          ⏸
        </button>
        <button onClick={handleRestart} className="w-10 h-10 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-xl transition-colors" aria-label="Restart song">
          ⏮
        </button>
        <button onClick={handleNext} className="w-10 h-10 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-xl transition-colors" aria-label="Next song">
          ⏭
        </button>
        <button onClick={handleOpenDisplay} className="ml-auto text-xs px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors" aria-label="Open display">
          Open Display
        </button>
      </div>

      {/* Pitch control */}
      <div className="px-4 pb-4">
        <PitchControl pitchSemitones={pitchSemitones} nowPlaying={nowPlaying}/>
      </div>
    </div>);
}
