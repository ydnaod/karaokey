import { useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { io } from 'socket.io-client'
import type { NowPlaying, RoomState, Role } from '../types'

function computeOffset(np: NowPlaying): number {
  if (np.paused && np.pausedAt !== null) {
    return (np.pausedAt - np.startedAt) / 1000
  }
  return (Date.now() - np.startedAt) / 1000
}

export default function Display() {
  const { code } = useParams<{ code: string }>()
  const videoRef = useRef<HTMLVideoElement>(null)
  const nowPlayingRef = useRef<NowPlaying | null>(null)

  useEffect(() => {
    const sock = io()
    let abortController: AbortController | null = null

    function loadAndPlay(np: NowPlaying) {
      nowPlayingRef.current = np
      const video = videoRef.current
      if (!video) return

      // Cancel any pending canplay from the previous song
      abortController?.abort()
      abortController = new AbortController()
      const { signal } = abortController

      video.src = `/video/${np.videoId}.webm`
      video.load()

      video.addEventListener('canplay', () => {
        if (signal.aborted) return
        video.currentTime = Math.max(0, computeOffset(np))
        if (!np.paused) video.play().catch(() => {})
      }, { once: true, signal })
    }

    function resync() {
      const np = nowPlayingRef.current
      const video = videoRef.current
      if (!np || !video || np.paused) return
      video.currentTime = Math.max(0, computeOffset(np))
      video.play().catch(() => {})
    }

    sock.on('room:joined', ({ room, myRole }: { room: Omit<RoomState, 'myRole'>; myRole: Role }) => {
      if (myRole !== 'viewer') return
      if (room.nowPlaying) loadAndPlay(room.nowPlaying)
    })

    sock.on('player:started', ({ nowPlaying }: { nowPlaying: NowPlaying }) => {
      loadAndPlay(nowPlaying)
    })

    sock.on('player:paused', () => {
      nowPlayingRef.current && (nowPlayingRef.current = { ...nowPlayingRef.current, paused: true })
      videoRef.current?.pause()
    })

    sock.on('player:resumed', ({ nowPlaying }: { nowPlaying: NowPlaying }) => {
      nowPlayingRef.current = nowPlaying
      const video = videoRef.current
      if (!video) return
      video.currentTime = Math.max(0, computeOffset(nowPlaying))
      video.play().catch(() => {})
    })

    // Resync when tab becomes visible again (browser may have throttled it)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') resync()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    sock.emit('room:watch', { roomCode: code })

    return () => {
      abortController?.abort()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      sock.disconnect()
    }
  }, [code])

  return (
    <div className="w-screen h-screen bg-black flex items-center justify-center">
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        muted
        x-webkit-airplay="allow"
      />
    </div>
  )
}
