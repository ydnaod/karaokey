import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import type { NowPlaying } from '../types';
// TV follows measured host media time; it never independently advances the queue.
export default function Display() {
    const { code } = useParams<{
        code: string;
    }>();
    const videoRef = useRef<HTMLVideoElement>(null);
    const [status, setStatus] = useState('Connecting to host…');
    useEffect(() => {
        const sock = io({ transports: ['websocket'] });
        let sample: {
            np: NowPlaying;
            received: number;
        } | null = null;
        let videoId: string | null = null;
        const sync = () => {
            const v = videoRef.current;
            if (!v || !sample)
                return;
            const { np, received } = sample;
            const age = (performance.now() - received) / 1000;
            if (age > 2) {
                v.pause();
                setStatus('Waiting for host playback…');
                return;
            }
            const target = np.positionSeconds + (np.paused ? 0 : age);
            if (v.readyState < 2)
                return;
            const drift = target - v.currentTime;
            if (Math.abs(drift) > (np.paused ? 0.02 : 0.15))
                v.currentTime = Math.max(0, target);
            v.playbackRate = np.paused ? 1 : Math.max(0.97, Math.min(1.03, 1 + drift * 0.1));
            if (np.paused)
                v.pause();
            else
                void v.play().catch(() => setStatus('Tap display to enable video'));
        };
        const onState = ({ nowPlaying: np }: {
            nowPlaying: NowPlaying | null;
        }) => {
            const v = videoRef.current;
            if (!v)
                return;
            if (!np) {
                sample = null;
                videoId = null;
                v.pause();
                v.removeAttribute('src');
                v.load();
                setStatus('Waiting for a song…');
                return;
            }
            sample = { np, received: performance.now() };
            setStatus(np.paused ? 'Paused' : '');
            if (videoId !== np.videoId) {
                videoId = np.videoId;
                v.src = `/video/${np.videoId}.mp4`;
                v.load();
            }
            sync();
        };
        sock.on('connect', () => sock.emit('room:watch', { roomCode: code }));
        sock.on('playback:state', onState);
        sock.on('disconnect', () => { videoRef.current?.pause(); sample = null; setStatus('Reconnecting…'); });
        sock.on('room:error', ({ message }: {
            message: string;
        }) => setStatus(message));
        videoRef.current?.addEventListener('canplay', sync);
        const timer = setInterval(sync, 100);
        return () => { clearInterval(timer); videoRef.current?.removeEventListener('canplay', sync); sock.disconnect(); };
    }, [code]);
    return <div className="w-screen h-screen bg-black flex items-center justify-center" onClick={() => void videoRef.current?.play().catch(() => { })}>
    <video ref={videoRef} className="w-full h-full object-contain" playsInline muted/>
    {status && <p className="absolute top-4 text-white bg-black/70 p-2">{status}</p>}
    <button className="absolute bottom-4 right-4 text-white bg-black/60 p-2" onClick={() => { if (document.fullscreenElement)
        void document.exitFullscreen();
    else
        void document.documentElement.requestFullscreen(); }}>Fullscreen</button>
  </div>;
}
