import { useEffect, useRef, useCallback } from 'react'
import { socket } from '../socket'
import type { AudioEngine } from '../hooks/useAudioEngine'
import PitchControl from './PitchControl'
import type { NowPlaying, QueueItem } from '../types'

interface Props {
  audio: AudioEngine
  videoRef: React.RefObject<HTMLVideoElement>
  nowPlaying: NowPlaying
  queue: QueueItem[]
  pitchSemitones: number
  roomCode: string
}

export default function Player({ audio, videoRef, nowPlaying, queue, pitchSemitones, roomCode }: Props) {
  const nowPlayingRef = useRef(nowPlaying)
  nowPlayingRef.current = nowPlaying
  const queueRef = useRef(queue)
  queueRef.current = queue
  const waitingForNext = useRef(false)

  function computeOffset(np: NowPlaying): number {
    if (np.paused && np.pausedAt !== null) {
      return (np.pausedAt - np.startedAt) / 1000
    }
    return (Date.now() - np.startedAt) / 1000
  }

  const startPlayback = useCallback(async (np: NowPlaying) => {
    if (!audio.isLoaded(np.videoId)) {
      await audio.load(np.videoId)
    }
    // Recompute offset after load to account for fetch time
    const offset = computeOffset(np)
    audio.setPitch(np.pitchSemitones)
    await audio.play(offset)
  }, [audio])

  // Song change — reset waiting flag so it doesn't carry over to a new song
  useEffect(() => {
    waitingForNext.current = false
    if (!nowPlaying.paused) {
      startPlayback(nowPlaying)
    } else {
      if (!audio.isLoaded(nowPlaying.videoId)) {
        audio.load(nowPlaying.videoId)
      }
      audio.setPitch(nowPlaying.pitchSemitones)
    }

    // Prefetch is a no-op for video streaming, but kept for interface compat
    queue
      .filter((q) => q.id !== nowPlaying.queueItemId && q.audioReady)
      .slice(0, 4)
      .forEach((q) => audio.prefetch(q.videoId))
  }, [nowPlaying.queueItemId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pitch changes
  useEffect(() => {
    audio.setPitch(pitchSemitones)
  }, [pitchSemitones, audio])

  // Auto-advance when song ends
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const handleEnded = () => {
      const q = queueRef.current
      const np = nowPlayingRef.current
      const idx = q.findIndex((item) => item.id === np.queueItemId)
      const next = q[idx + 1]
      if (next?.audioReady) {
        socket.emit('player:next')
      } else {
        waitingForNext.current = true
      }
    }
    video.addEventListener('ended', handleEnded)
    return () => video.removeEventListener('ended', handleEnded)
  }, [videoRef])

  // Auto-advance when we were waiting for a song to become ready
  useEffect(() => {
    if (!waitingForNext.current) return
    const idx = queue.findIndex((item) => item.id === nowPlaying.queueItemId)
    const next = queue[idx + 1]
    if (next?.audioReady) {
      waitingForNext.current = false
      socket.emit('player:next')
    }
  }, [queue, nowPlaying.queueItemId])

  // Pause/resume/restart from socket
  useEffect(() => {
    const onPaused = () => { audio.pause() }
    const onResumed = ({ nowPlaying: np }: { nowPlaying: NowPlaying }) => {
      audio.setPitch(np.pitchSemitones)
      audio.play(computeOffset(np))
    }
    const onStarted = ({ nowPlaying: np }: { nowPlaying: NowPlaying }) => {
      // Same song restarted — seek to beginning immediately.
      // A different song starting is handled by the song-change effect below.
      if (np.queueItemId === nowPlayingRef.current.queueItemId) {
        audio.setPitch(np.pitchSemitones)
        audio.play(0)
      }
    }
    socket.on('player:paused', onPaused)
    socket.on('player:resumed', onResumed)
    socket.on('player:started', onStarted)
    return () => {
      socket.off('player:paused', onPaused)
      socket.off('player:resumed', onResumed)
      socket.off('player:started', onStarted)
    }
  }, [audio])

  function handlePause() { socket.emit('player:pause') }
  function handleResume() { socket.emit('player:resume') }
  function handleNext() { socket.emit('player:next') }
  function handleRestart() { socket.emit('player:restart') }

  function handleOpenDisplay() {
    window.open(`${window.location.origin}/display/${roomCode}`, '_blank', 'noopener')
  }

  const currentItem = queue.find((q) => q.id === nowPlaying.queueItemId)

  return (
    <div className="flex flex-col bg-gray-900 rounded-xl overflow-hidden">
      {/* Native video element — audio routed through SoundTouchJS for pitch shift */}
      <video
        ref={videoRef}
        className="w-full"
        playsInline
      />

      {/* Song info */}
      <div className="px-4 pt-3 pb-1">
        <p className="font-semibold text-white truncate">{currentItem?.title ?? 'Unknown'}</p>
        <p className="text-xs text-gray-400">added by {currentItem?.addedBy}</p>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
        <button
          onClick={handleResume}
          disabled={!nowPlaying.paused}
          className="w-10 h-10 rounded-full bg-pink-600 hover:bg-pink-500 disabled:opacity-30 flex items-center justify-center text-xl transition-colors"
          aria-label="Play"
        >
          ▶
        </button>
        <button
          onClick={handlePause}
          disabled={nowPlaying.paused}
          className="w-10 h-10 rounded-full bg-gray-700 hover:bg-gray-600 disabled:opacity-30 flex items-center justify-center text-xl transition-colors"
          aria-label="Pause"
        >
          ⏸
        </button>
        <button
          onClick={handleRestart}
          className="w-10 h-10 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-xl transition-colors"
          aria-label="Restart song"
        >
          ⏮
        </button>
        <button
          onClick={handleNext}
          className="w-10 h-10 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-xl transition-colors"
          aria-label="Next song"
        >
          ⏭
        </button>
        <button
          onClick={handleOpenDisplay}
          className="ml-auto text-xs px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
          aria-label="Open display"
        >
          Open Display
        </button>
      </div>

      {/* Pitch control */}
      <div className="px-4 pb-4">
        <PitchControl pitchSemitones={pitchSemitones} />
      </div>
    </div>
  )
}
