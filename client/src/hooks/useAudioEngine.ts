import { useRef, useCallback, useEffect, useMemo, type RefObject } from 'react';
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
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const setupDoneRef = useRef(false);
  const wiredVideoRef = useRef<HTMLVideoElement | null>(null);
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
    const video = videoRef.current;
    if (!video) return;

    // If the video element changed (Player remounted), reset so we re-wire.
    // Also reset the mediaSource since it's bound to the old element.
    if (wiredVideoRef.current && wiredVideoRef.current !== video) {
      setupDoneRef.current = false;
      stNodeRef.current = null;
      mediaSourceRef.current = null;
    }

    if (setupDoneRef.current) return;
    setupDoneRef.current = true;

    try {
      const ctx = ensureContext();
      // Don't await resume here — it requires a user gesture and will hang on
      // a fresh page load. play() already calls resume() before playing.
      ctx.resume().catch(() => {});

      await SoundTouchNode.register(ctx, processorUrl as string);

      const stNode = new SoundTouchNode(ctx);
      stNode.pitchSemitones!.value = pitchRef.current;

      // Reuse the existing mediaSource if already created — calling
      // createMediaElementSource twice on the same element throws.
      if (!mediaSourceRef.current) {
        mediaSourceRef.current = ctx.createMediaElementSource(video);
      }
      mediaSourceRef.current.connect(stNode);
      stNode.connect(ctx.destination);

      wiredVideoRef.current = video;
      stNodeRef.current = stNode;
    } catch (err) {
      console.error('[AudioEngine] setup failed:', err);
      setupDoneRef.current = false;
      // Don't clear mediaSourceRef — if createMediaElementSource already ran,
      // we must reuse it on the next attempt.
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

  return useMemo(
    () => ({ unlock, load, play, pause, resume, setPitch, getCurrentTime, isLoaded, prefetch }),
    [unlock, load, play, pause, resume, setPitch, getCurrentTime, isLoaded, prefetch]
  );
}
