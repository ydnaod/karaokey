import { useRef, useCallback, useEffect, useMemo, type RefObject } from 'react';
import { SoundTouchNode } from '@soundtouchjs/audio-worklet';
// @ts-expect-error — Vite URL import
import processorUrl from '@soundtouchjs/audio-worklet/processor?url';
export function useAudioEngine(videoRef: RefObject<HTMLVideoElement>) {
    const ctx = useRef<AudioContext | null>(null);
    const node = useRef<SoundTouchNode | null>(null);
    const source = useRef<MediaElementAudioSourceNode | null>(null);
    const wired = useRef<HTMLVideoElement | null>(null);
    const setupPromise = useRef<Promise<void> | null>(null);
    const currentId = useRef<string | null>(null);
    const pitch = useRef(0);
    const ensure = useCallback(() => ctx.current ?? (ctx.current = new AudioContext({ latencyHint: 'playback' })), []);
    const unlock = useCallback(() => { void ensure().resume().catch(() => { }); }, [ensure]);
    const setup = useCallback(async () => {
        const video = videoRef.current;
        if (!video)
            return;
        if (wired.current === video && node.current)
            return;
        if (setupPromise.current)
            return setupPromise.current;
        setupPromise.current = (async () => {
            const context = ensure();
            await SoundTouchNode.register(context, processorUrl as string);
            node.current?.disconnect();
            source.current?.disconnect();
            if (wired.current !== video) {
                source.current = context.createMediaElementSource(video);
                wired.current = video;
            }
            node.current = new SoundTouchNode(context);
            node.current.pitchSemitones!.value = pitch.current;
            source.current!.connect(node.current);
            node.current.connect(context.destination);
        })();
        try {
            await setupPromise.current;
        }
        finally {
            setupPromise.current = null;
        }
    }, [ensure, videoRef]);
    const load = useCallback(async (id: string) => {
        const v = videoRef.current;
        if (!v)
            return;
        if (currentId.current !== id || !v.getAttribute('src')) {
            v.src = `/video/${id}.mp4`;
            v.load();
            currentId.current = id;
        }
    }, [videoRef]);
    const play = useCallback(async (position: number, signal?: AbortSignal) => {
        await setup();
        const v = videoRef.current;
        if (!v || signal?.aborted)
            return;
        const context = ensure();
        if (context.state === 'suspended')
            await context.resume();
        if (signal?.aborted)
            return;
        if (v.readyState < HTMLMediaElement.HAVE_FUTURE_DATA)
            await new Promise<void>((resolve, reject) => {
                const cleanup = () => { clearTimeout(timer); v.removeEventListener('canplay', ready); v.removeEventListener('error', failed); signal?.removeEventListener('abort', failed); };
                const ready = () => { cleanup(); resolve(); };
                const failed = () => { cleanup(); reject(new Error('Media load interrupted or failed')); };
                const timer = setTimeout(failed, 15000);
                v.addEventListener('canplay', ready);
                v.addEventListener('error', failed);
                signal?.addEventListener('abort', failed, { once: true });
            });
        if (signal?.aborted)
            return;
        v.currentTime = Math.max(0, position);
        await v.play();
    }, [setup, ensure, videoRef]);
    const pause = useCallback(() => { videoRef.current?.pause(); }, [videoRef]);
    const setPitch = useCallback((n: number) => { pitch.current = n; if (node.current)
        node.current.pitchSemitones!.value = n; }, []);
    const isLoaded = useCallback((id: string) => currentId.current === id && !!videoRef.current?.getAttribute('src'), [videoRef]);
    const getCurrentTime = useCallback(() => videoRef.current?.currentTime ?? 0, [videoRef]);
    const prefetch = useCallback((_id: string) => { }, []);
    useEffect(() => () => { videoRef.current?.pause(); node.current?.disconnect(); source.current?.disconnect(); void ctx.current?.close(); ctx.current = null; node.current = null; source.current = null; wired.current = null; currentId.current = null; }, [videoRef]);
    return useMemo(() => ({ unlock, load, play, pause, setPitch, isLoaded, getCurrentTime, prefetch }), [unlock, load, play, pause, setPitch, isLoaded, getCurrentTime, prefetch]);
}
export type AudioEngine = ReturnType<typeof useAudioEngine>;
