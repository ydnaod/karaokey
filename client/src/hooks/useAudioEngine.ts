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
    if (setupDoneRef.current || !videoRef.current) {
      console.log('[AudioEngine] setup skipped — done:', setupDoneRef.current, 'videoRef:', !!videoRef.current);
      return;
    }
    setupDoneRef.current = true;
    console.log('[AudioEngine] setup start');

    try {
      const ctx = ensureContext();
      console.log('[AudioEngine] ctx state:', ctx.state);
      if (ctx.state === 'suspended') await ctx.resume();

      await SoundTouchNode.register(ctx, processorUrl as string);
      console.log('[AudioEngine] SoundTouchNode registered');

      const stNode = new SoundTouchNode(ctx);
      stNode.pitchSemitones!.value = pitchRef.current;
      stNodeRef.current = stNode;

      const mediaSource = ctx.createMediaElementSource(videoRef.current);
      mediaSource.connect(stNode);
      stNode.connect(ctx.destination);
      console.log('[AudioEngine] audio graph wired');
    } catch (err) {
      console.error('[AudioEngine] setup failed:', err);
      setupDoneRef.current = false;
    }
  }, [videoRef, ensureContext]);

  const load = useCallback(async (videoId: string) => {
    console.log('[AudioEngine] load', videoId);
    await setup();
    if (!videoRef.current) return;
    videoRef.current.src = `/video/${videoId}.webm`;
    videoRef.current.load();
    loadedVideoIds.current.add(videoId);
    console.log('[AudioEngine] load done, src set');
  }, [setup, videoRef]);

  const play = useCallback(async (offsetSeconds: number) => {
    const video = videoRef.current;
    const ctx = ctxRef.current;
    console.log('[AudioEngine] play called, offset:', offsetSeconds, 'ctx:', ctx?.state, 'readyState:', video?.readyState);
    if (!video || !ctx) {
      console.warn('[AudioEngine] play aborted — video:', !!video, 'ctx:', !!ctx);
      return;
    }

    // Must resume before playing or audio will be silent
    if (ctx.state === 'suspended') await ctx.resume();

    // Wait for enough data before seeking + playing
    if (video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
      console.log('[AudioEngine] waiting for canplay, readyState:', video.readyState);
      await new Promise<void>((resolve, reject) => {
        const onReady = () => { video.removeEventListener('canplay', onReady); video.removeEventListener('error', onError); resolve(); };
        const onError = () => { video.removeEventListener('canplay', onReady); video.removeEventListener('error', onError); reject(new Error('video error')); };
        video.addEventListener('canplay', onReady);
        video.addEventListener('error', onError);
      });
      console.log('[AudioEngine] canplay fired');
    }

    video.currentTime = Math.max(0, offsetSeconds);
    console.log('[AudioEngine] calling video.play()');
    await video.play().catch((err) => console.error('[AudioEngine] video.play() failed:', err));
    console.log('[AudioEngine] video.play() resolved');
  }, [videoRef]);

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
