import { useState, FormEvent } from 'react'
import { socket } from '../socket'

export default function AddSong() {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function isYouTubeUrl(u: string) {
    return /youtube\.com\/watch|youtu\.be\//.test(u)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return
    if (!isYouTubeUrl(trimmed)) {
      setError('Please enter a YouTube URL')
      return
    }
    setError('')
    setLoading(true)
    socket.emit('queue:add', { url: trimmed })
    setUrl('')
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 p-3 border-t border-gray-800">
      <div className="flex gap-2">
        <input
          type="url"
          placeholder="Paste YouTube URL…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-pink-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-pink-600 hover:bg-pink-500 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </form>
  )
}
