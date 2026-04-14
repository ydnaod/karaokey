import type { RoomState } from '../types'

interface Props {
  room: RoomState
  onLeave: () => void
}

export default function RoomHeader({ room, onLeave }: Props) {
  function copyCode() {
    navigator.clipboard.writeText(room.code).catch(() => {})
  }

  return (
    <div className="flex items-center justify-between px-3 py-2 bg-gray-900 border-b border-gray-800 gap-2 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-pink-500 font-bold tracking-wide hidden sm:inline">karaokey</span>
        <button
          onClick={copyCode}
          title="Copy room code"
          className="flex items-center gap-1.5 px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded-lg font-mono font-bold tracking-widest transition-colors flex-shrink-0"
        >
          {room.code}
          <span className="text-xs text-gray-400 font-sans font-normal hidden sm:inline">copy</span>
        </button>
        <span className="text-gray-400 text-xs truncate min-w-0">
          {room.participants.length} {room.participants.length === 1 ? 'person' : 'people'}
        </span>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-xs text-gray-300">
          {room.myRole === 'host' ? '👑' : '🎤'}
        </span>
        <button
          onClick={onLeave}
          className="px-2 py-1 text-sm bg-gray-800 hover:bg-red-900 rounded-lg transition-colors"
        >
          Leave
        </button>
      </div>
    </div>
  )
}
