import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { socket } from '../socket'
import { useRoomContext } from '../context/RoomContext'

type Mode = 'idle' | 'create' | 'join'

export default function Home() {
  const navigate = useNavigate()
  const { joinRoom } = useRoomContext()
  const [mode, setMode] = useState<Mode>('idle')
  const [displayName, setDisplayName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    const name = displayName.trim()
    if (!name) { setError('Enter your name'); return }
    setError('')
    setLoading(true)

    try {
      if (!socket.connected) socket.connect()

      // Wait for connection then ask server to create room
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve)
        socket.once('connect_error', reject)
        if (socket.connected) resolve()
      })

      socket.emit('room:create', { displayName: name })

      socket.once('room:created', ({ roomCode: code }: { roomCode: string }) => {
        navigate(`/room/${code}`)
      })

      socket.once('room:error', ({ message }: { message: string }) => {
        setError(message)
        setLoading(false)
      })
    } catch {
      setError('Connection failed')
      setLoading(false)
    }
  }

  async function handleJoin(e: FormEvent) {
    e.preventDefault()
    const name = displayName.trim()
    const code = roomCode.trim().toUpperCase()
    if (!name) { setError('Enter your name'); return }
    if (code.length !== 4) { setError('Enter a 4-letter room code'); return }
    setError('')
    setLoading(true)

    // Verify room exists first
    try {
      const res = await fetch(`/api/rooms/${code}`)
      const data = await res.json() as { exists: boolean }
      if (!data.exists) {
        setError('Room not found')
        setLoading(false)
        return
      }
    } catch {
      setError('Network error')
      setLoading(false)
      return
    }

    joinRoom(code, name)

    socket.once('room:joined', () => {
      navigate(`/room/${code}`)
    })

    socket.once('room:error', ({ message }: { message: string }) => {
      setError(message)
      setLoading(false)
    })
  }

  return (
    <div className="min-h-full bg-gray-950 text-white flex flex-col items-center justify-center p-4">
      <h1 className="text-5xl font-bold tracking-tight mb-2">
        karao<span className="text-pink-500">key</span>
      </h1>
      <p className="text-gray-400 mb-10 text-sm">pitch-perfect karaoke, anywhere</p>

      {mode === 'idle' && (
        <div className="flex gap-4">
          <button
            onClick={() => setMode('create')}
            className="px-6 py-3 bg-pink-600 hover:bg-pink-500 rounded-xl font-semibold transition-colors"
          >
            Create Room
          </button>
          <button
            onClick={() => setMode('join')}
            className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl font-semibold transition-colors"
          >
            Join Room
          </button>
        </div>
      )}

      {mode === 'create' && (
        <form onSubmit={handleCreate} className="flex flex-col gap-4 w-full max-w-sm">
          <h2 className="text-xl font-semibold">Create a room</h2>
          <input
            type="text"
            placeholder="Your name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={32}
            className="px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 focus:outline-none focus:border-pink-500"
            autoFocus
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setMode('idle'); setError('') }}
              className="flex-1 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 font-semibold transition-colors"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 rounded-xl bg-pink-600 hover:bg-pink-500 font-semibold transition-colors disabled:opacity-50"
            >
              {loading ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      )}

      {mode === 'join' && (
        <form onSubmit={handleJoin} className="flex flex-col gap-4 w-full max-w-sm">
          <h2 className="text-xl font-semibold">Join a room</h2>
          <input
            type="text"
            placeholder="Your name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={32}
            className="px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 focus:outline-none focus:border-pink-500"
            autoFocus
          />
          <input
            type="text"
            placeholder="Room code (e.g. KFZQ)"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            maxLength={4}
            className="px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 focus:outline-none focus:border-pink-500 tracking-widest font-mono text-lg uppercase"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setMode('idle'); setError('') }}
              className="flex-1 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 font-semibold transition-colors"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 rounded-xl bg-pink-600 hover:bg-pink-500 font-semibold transition-colors disabled:opacity-50"
            >
              {loading ? 'Joining…' : 'Join'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
