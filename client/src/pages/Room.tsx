import { useEffect, lazy, Suspense } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useRoomContext } from '../context/RoomContext'
import { socket } from '../socket'
import type { QueueItem } from '../types'
import RoomHeader from '../components/RoomHeader'
import Queue from '../components/Queue'
import AddSong from '../components/AddSong'

const HostPanel = lazy(() => import('../components/HostPanel'))

export default function Room() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { room, joinRoom, leaveRoom } = useRoomContext()

  useEffect(() => {
    if (room || !code) return
    // Socket already connected = we just navigated here from create/join, room:joined is in flight
    if (socket.connected) return
    const name = localStorage.getItem('karaokey:name')
    if (name) {
      const upperCode = code.toUpperCase()
      const hostToken = localStorage.getItem(`karaokey:host:${upperCode}`) ?? undefined
      joinRoom(upperCode, name, hostToken)
    } else {
      navigate(`/?room=${code}`)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleLeave() {
    leaveRoom()
    navigate('/')
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
    <div className="h-full bg-gray-950 text-white flex flex-col overflow-hidden">
      <RoomHeader room={room} onLeave={handleLeave} />

      <div className="flex-1 flex overflow-hidden">
        {isHost && (
          <Suspense fallback={<div className="w-96 flex-shrink-0 border-r border-gray-800" />}>
            <HostPanel
              nowPlaying={room.nowPlaying}
              queue={room.queue}
              roomCode={room.code}
            />
          </Suspense>
        )}

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
            onPlay={(item: QueueItem) => socket.emit('player:play', { queueItemId: item.id })}
          />

          <AddSong />
        </div>
      </div>
    </div>
  )
}
