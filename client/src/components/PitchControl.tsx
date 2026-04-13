import { socket } from '../socket'

interface Props {
  pitchSemitones: number
}

const MAX = 12

export default function PitchControl({ pitchSemitones }: Props) {
  function setKey(semitones: number) {
    socket.emit('pitch:set', { semitones: Math.max(-MAX, Math.min(MAX, semitones)) })
  }

  const label =
    pitchSemitones === 0
      ? 'original key'
      : `${pitchSemitones > 0 ? '+' : ''}${pitchSemitones} semitones`

  return (
    <div className="flex items-center gap-3 bg-gray-800 rounded-xl px-4 py-3">
      <span className="text-gray-400 text-sm">Key</span>

      <button
        onClick={() => setKey(pitchSemitones - 1)}
        disabled={pitchSemitones <= -MAX}
        className="w-9 h-9 rounded-full bg-gray-700 hover:bg-gray-600 disabled:opacity-30 font-bold text-lg flex items-center justify-center transition-colors"
        aria-label="Lower key"
      >
        ♭
      </button>

      <span className="w-32 text-center font-mono text-sm">
        {label}
      </span>

      <button
        onClick={() => setKey(pitchSemitones + 1)}
        disabled={pitchSemitones >= MAX}
        className="w-9 h-9 rounded-full bg-gray-700 hover:bg-gray-600 disabled:opacity-30 font-bold text-lg flex items-center justify-center transition-colors"
        aria-label="Raise key"
      >
        ♯
      </button>

      {pitchSemitones !== 0 && (
        <button
          onClick={() => setKey(0)}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors ml-1"
        >
          reset
        </button>
      )}
    </div>
  )
}
