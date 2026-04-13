import { useRef, useEffect, useCallback } from 'react';

declare global {
  interface Window {
    YT: typeof globalThis.YT;
    onYouTubeIframeAPIReady: () => void;
  }
}

export function useYouTubePlayer(containerId: string) {
  const playerRef = useRef<YT.Player | null>(null);
  const readyRef = useRef(false);
  const pendingVideoId = useRef<string | null>(null);

  useEffect(() => {
    function initPlayer() {
      playerRef.current = new window.YT.Player(containerId, {
        height: '100%',
        width: '100%',
        playerVars: {
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          rel: 0,
          mute: 1,
          autoplay: 0,
        },
        events: {
          onReady: () => {
            readyRef.current = true;
            if (pendingVideoId.current) {
              loadVideo(pendingVideoId.current);
              pendingVideoId.current = null;
            }
          },
        },
      });
    }

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prev) prev();
        initPlayer();
      };
    }

    return () => {
      playerRef.current?.destroy();
      playerRef.current = null;
      readyRef.current = false;
    };
  }, [containerId]);

  const loadVideo = useCallback((videoId: string) => {
    if (!readyRef.current || !playerRef.current) {
      pendingVideoId.current = videoId;
      return;
    }
    playerRef.current.cueVideoById({ videoId });
  }, []);

  const seekAndPlay = useCallback((videoId: string, offsetSeconds: number) => {
    if (!readyRef.current || !playerRef.current) {
      pendingVideoId.current = videoId;
      return;
    }
    playerRef.current.loadVideoById({ videoId, startSeconds: offsetSeconds });
    playerRef.current.mute();
  }, []);

  const pauseVideo = useCallback(() => {
    playerRef.current?.pauseVideo();
  }, []);

  const resumeVideo = useCallback((offsetSeconds: number) => {
    playerRef.current?.seekTo(offsetSeconds, true);
    playerRef.current?.playVideo();
    playerRef.current?.mute();
  }, []);

  const getCurrentTime = useCallback((): number => {
    return playerRef.current?.getCurrentTime() ?? 0;
  }, []);

  return { loadVideo, seekAndPlay, pauseVideo, resumeVideo, getCurrentTime };
}
