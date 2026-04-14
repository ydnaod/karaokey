import { useRef, useCallback, useEffect, type RefObject } from 'react';
import { SoundTouchNode } from '@soundtouchjs/audio-worklet';
// @ts-expect-error — Vite ?url import not typed in TS
import processorUrl from '@soundtouchjs/audio-worklet/processor?url';

interface AudioEngine {
  unlock: () => void;
  load: (videoId: string) => Promise<void>;
  play: (offsetSeconds: number) => Promise<void>;
  pause: () => void;
  resume: () => void;
  setPitch: (semitones: number) => void;
  getCurrentTime: () => number;
  isLoaded: (videoId: string) => boolean;
  prefetch: (videoId: string) => void;
}

export type { AudioEngine };

export function useAudioEngine(videoRef: RefObject<HTMLVideoElement>): AudioEngine {
  const ctxRef = useRef<AudioContext | null>(null);
  const stNodeRef = useRef<SoundTouchNode | null>(null);
  const setupDoneRef = useRef(false);
  const loadedVideoIds = useRef<Set<string>>(new Set());
  const pitchRef = useRef<number>(0);

  // Create AudioContext — must be called synchronously from a user gesture
  // so the context starts in 'running' state, not 'suspended'.
  const ensureContext = useCallback((): AudioContext => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext({ latencyHint: 'playback' });
    }
    return ctxRef.current;
  }, []);

  // unlock() is called from the Play button click — creates the AudioContext
  // from a user gesture so the browser allows audio to play.
  const unlock = useCallback(() => {
    const ctx = ensureContext();
    ctx.resume().catch(() => {});
  }, [ensureContext]);

  // Wire video element → SoundTouchNode → destination.
  // Called lazily when the video element is available (after Player mounts).
  const setup = useCallback(async () => {
    if (setupDoneRef.current || !videoRef.current) return;
    setupDoneRef.current = true;

    try {
      const ctx = ensureContext();
      if (ctx.state === 'suspended') await ctx.resume();

      await SoundTouchNode.register(ctx, processorUrl as string);

      const stNode = new SoundTouchNode(ctx);
      stNode.pitchSemitones!.value = pitchRef.current;

      // Wire the graph BEFORE storing the node reference, so setPitch()
      // only ever operates on a fully-connected node.
      const mediaSource = ctx.createMediaElementSource(videoRef.current);
      mediaSource.connect(stNode);
      stNode.connect(ctx.destination);

      stNodeRef.current = stNode;
      console.log('[AudioEngine] setup complete — audio graph wired, ctx state:', ctxRef.current?.state);
    } catch (err) {
      console.error('[AudioEngine] setup failed:', err);
      setupDoneRef.current = false;
    }
  }, [videoRef, ensureContext]);

  const load = useCallback(async (videoId: string) => {
    await setup();
    if (!videoRef.current) return;
    videoRef.current.src = `/video/${videoId}.mp4`;
    videoRef.current.load();
    loadedVideoIds.current.add(videoId);
  }, [setup, videoRef]);

  const play = useCallback(async (offsetSeconds: number) => {
    await setup();
    const video = videoRef.current;
    const ctx = ctxRef.current;
    if (!video || !ctx) return;

    // Must resume before playing or audio will be silent
    if (ctx.state === 'suspended') await ctx.resume();

    // Wait for enough data before seeking + playing
    if (video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
      await new Promise<void>((resolve, reject) => {
        const onReady = () => { video.removeEventListener('canplay', onReady); video.removeEventListener('error', onError); resolve(); };
        const onError = () => { video.removeEventListener('canplay', onReady); video.removeEventListener('error', onError); reject(new Error('video error')); };
        video.addEventListener('canplay', onReady);
        video.addEventListener('error', onError);
      });
    }

    video.currentTime = Math.max(0, offsetSeconds);
    await video.play().catch((err) => console.error('[AudioEngine] video.play() failed:', err));
  }, [setup, videoRef]);

  const pause = useCallback(() => {
    videoRef.current?.pause();
  }, [videoRef]);

  const resume = useCallback(async () => {
    const ctx = ctxRef.current;
    if (ctx?.state === 'suspended') await ctx.resume();
    videoRef.current?.play().catch(() => {});
  }, [videoRef]);

  const setPitch = useCallback((semitones: number) => {
    pitchRef.current = semitones;
    if (stNodeRef.current) {
      stNodeRef.current.pitchSemitones!.value = semitones;
      console.log('[pitch] applied semitones:', semitones, '| param value:', stNodeRef.current.pitchSemitones?.value);
    } else {
      console.warn('[pitch] stNode not ready — deferred to setup');
    }
  }, []);

  const getCurrentTime = useCallback(() => {
    return videoRef.current?.currentTime ?? 0;
  }, [videoRef]);

  const isLoaded = useCallback((videoId: string) => {
    return loadedVideoIds.current.has(videoId);
  }, []);

  const prefetch = useCallback((_videoId: string) => {}, []);

  useEffect(() => {
    return () => { ctxRef.current?.close(); };
  }, []);

  return { unlock, load, play, pause, resume, setPitch, getCurrentTime, isLoaded, prefetch };
}
