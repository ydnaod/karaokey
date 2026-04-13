import { useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useRoomContext } from '../context/RoomContext'
import { useAudioEngine } from '../hooks/useAudioEngine'
import { socket } from '../socket'
import RoomHeader from '../components/RoomHeader'
import Player from '../components/Player'
import Queue from '../components/Queue'
import AddSong from '../components/AddSong'
import type { QueueItem } from '../types'

export default function Room() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { room, leaveRoom } = useRoomContext()
  const videoRef = useRef<HTMLVideoElement>(null)
  const audio = useAudioEngine(videoRef)

  // If socket connects but we have no room state (e.g. page refresh), kick back to home
  useEffect(() => {
    if (!socket.connected) {
      navigate('/')
    }
  }, [navigate])

  function handleLeave() {
    leaveRoom()
    navigate('/')
  }

  function handlePlay(item: QueueItem) {
    audio.unlock() // must be called synchronously from click to unblock AudioContext
    socket.emit('player:play', { queueItemId: item.id })
  }

  if (!room) {
    return (
      <div className="min-h-full bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">Connecting to room {code}…</p>
      </div>
    )
  }

  const isHost = room.myRole === 'host'

  return (
    <div className="min-h-full bg-gray-950 text-white flex flex-col">
      <RoomHeader room={room} onLeave={handleLeave} />

      <div className="flex-1 flex overflow-hidden">
        {/* Left: player (host only) */}
        {isHost && (
          <div className="w-96 flex-shrink-0 p-4 overflow-y-auto border-r border-gray-800">
            {room.nowPlaying ? (
              <Player
                audio={audio}
                videoRef={videoRef}
                nowPlaying={room.nowPlaying}
                queue={room.queue}
                pitchSemitones={room.nowPlaying.pitchSemitones}
                roomCode={room.code}
              />
            ) : (
              <div className="rounded-xl bg-gray-900 p-6 text-center text-gray-500 text-sm">
                <p className="text-3xl mb-2">🎤</p>
                <p>No song playing</p>
                <p className="text-xs mt-1">Press Play on a queue item to start</p>
              </div>
            )}
          </div>
        )}

        {/* Right: queue */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-800 flex items-center justify-between">
            <h2 className="font-semibold text-sm text-gray-300">
              Queue · {room.queue.length} {room.queue.length === 1 ? 'song' : 'songs'}
            </h2>
            {!isHost && room.nowPlaying && (
              <div className="text-xs text-gray-400">
                Now playing: <span className="text-white">
                  {room.queue.find((q) => q.id === room.nowPlaying?.queueItemId)?.title ?? '…'}
                </span>
              </div>
            )}
          </div>

          <Queue
            queue={room.queue}
            nowPlaying={room.nowPlaying}
            myRole={room.myRole}
            onPlay={handlePlay}
          />

          <AddSong />
        </div>
      </div>
    </div>
  )
}
