import { useRef, useEffect } from 'react'
import { useAudioEngine } from '../hooks/useAudioEngine'
import Player from './Player'
import RoomQRCode from './RoomQRCode'
import type { NowPlaying, QueueItem } from '../types'


interface Props {
  nowPlaying: NowPlaying | null
  queue: QueueItem[]
  roomCode: string
}

export default function HostPanel({ nowPlaying, queue, roomCode }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const audio = useAudioEngine(videoRef)

  // Unlock AudioContext on first interaction anywhere on the page
  useEffect(() => {
    const unlock = () => audio.unlock()
    document.addEventListener('pointerdown', unlock, { once: true })
    return () => document.removeEventListener('pointerdown', unlock)
  }, [audio])

  return (
    <div className="w-96 flex-shrink-0 p-4 overflow-y-auto border-r border-gray-800 flex flex-col">
      {nowPlaying ? (
        <Player
          audio={audio}
          videoRef={videoRef}
          nowPlaying={nowPlaying}
          queue={queue}
          pitchSemitones={nowPlaying.pitchSemitones}
          roomCode={roomCode}
        />
      ) : (
        <div className="rounded-xl bg-gray-900 p-6 text-center text-gray-500 text-sm">
          <p className="text-3xl mb-2">🎤</p>
          <p>No song playing</p>
          <p className="text-xs mt-1">Press Play on a queue item to start</p>
        </div>
      )}
      <RoomQRCode roomCode={roomCode} />
    </div>
  )
}
