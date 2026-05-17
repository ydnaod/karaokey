import { useState, useEffect, useRef } from 'react'
import { socket } from '../socket'
import type { NowPlaying } from '../types'

interface Props {
  pitchSemitones: number
  nowPlaying: NowPlaying
}

const MAX = 12
const STORAGE_KEY = 'karaokey:resetKeyOnNext'

export default function PitchControl({ pitchSemitones, nowPlaying }: Props) {
  const [resetOnNext, setResetOnNext] = useState(
    () => localStorage.getItem(STORAGE_KEY) === 'true'
  )
  const prevQueueItemId = useRef(nowPlaying.queueItemId)

  function setKey(semitones: number) {
    socket.emit('pitch:set', { semitones: Math.max(-MAX, Math.min(MAX, semitones)) })
  }

  function toggleResetOnNext() {
    setResetOnNext((prev) => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, String(next))
      return next
    })
  }

  // Reset pitch when a new song starts
  useEffect(() => {
    if (!resetOnNext) return
    if (nowPlaying.queueItemId === prevQueueItemId.current) return
    prevQueueItemId.current = nowPlaying.queueItemId
    socket.emit('pitch:set', { semitones: 0 })
  }, [nowPlaying.queueItemId, resetOnNext])

  const label =
    pitchSemitones === 0
      ? 'original key'
      : `${pitchSemitones > 0 ? '+' : ''}${pitchSemitones} semitones`

  return (
    <div className="flex flex-col gap-2">
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

      <label className="flex items-center gap-2 px-1 cursor-pointer select-none">
        <div
          onClick={toggleResetOnNext}
          className={`relative w-8 h-4 rounded-full transition-colors ${
            resetOnNext ? 'bg-pink-600' : 'bg-gray-600'
          }`}
        >
          <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
            resetOnNext ? 'translate-x-4' : 'translate-x-0.5'
          }`} />
        </div>
        <span className="text-xs text-gray-400">Reset key after each song</span>
      </label>
    </div>
  )
}
