import type { RoomState } from '../types'

interface Props {
  room: RoomState
  onLeave: () => void
}

export default function RoomHeader({ room, onLeave }: Props) {
  const hostName = room.participants.find((p) => p.role === 'host')?.displayName ?? 'Unknown'

  function copyCode() {
    navigator.clipboard.writeText(room.code).catch(() => {})
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800">
      <div className="flex items-center gap-4">
        <span className="text-pink-500 font-bold text-lg tracking-wide">karaokey</span>
        <button
          onClick={copyCode}
          title="Copy room code"
          className="flex items-center gap-2 px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded-lg font-mono font-bold text-lg tracking-widest transition-colors"
        >
          {room.code}
          <span className="text-xs text-gray-400 font-sans font-normal">copy</span>
        </button>
        <span className="text-gray-400 text-sm">
          {room.participants.length} {room.participants.length === 1 ? 'person' : 'people'} · host: {hostName}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-300 capitalize">
          {room.myRole === 'host' ? '👑 host' : '🎤 participant'}
        </span>
        <button
          onClick={onLeave}
          className="px-3 py-1 text-sm bg-gray-800 hover:bg-red-900 rounded-lg transition-colors"
        >
          Leave
        </button>
      </div>
    </div>
  )
}
