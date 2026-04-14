import { useState, FormEvent, useRef } from 'react'
import { socket } from '../socket'

interface SearchResult {
  videoId: string
  title: string
  thumbnail: string
  duration: number | null
  channelName: string
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return ''
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function AddSong() {
  const [mode, setMode] = useState<'search' | 'url'>('search')

  // Search state
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  // URL state
  const [url, setUrl] = useState('')
  const [urlError, setUrlError] = useState('')

  async function handleSearch(e: FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return

    abortRef.current?.abort()
    abortRef.current = new AbortController()

    setSearching(true)
    setSearchError('')
    setResults([])

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        signal: abortRef.current.signal,
      })
      const data = await res.json() as { results?: SearchResult[]; error?: string }
      if (data.error) throw new Error(data.error)
      setResults(data.results ?? [])
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setSearchError('Search failed — try again')
    } finally {
      setSearching(false)
    }
  }

  function queueFromSearch(result: SearchResult) {
    socket.emit('queue:add', {
      url: `https://www.youtube.com/watch?v=${result.videoId}`,
      title: result.title,
      thumbnailUrl: result.thumbnail,
    })
  }

  function handleUrlSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return
    if (!/youtube\.com\/watch|youtu\.be\//.test(trimmed)) {
      setUrlError('Please enter a YouTube URL')
      return
    }
    setUrlError('')
    socket.emit('queue:add', { url: trimmed })
    setUrl('')
  }

  return (
    <div className="border-t border-gray-800">
      {/* Mode tabs */}
      <div className="flex border-b border-gray-800">
        <button
          onClick={() => setMode('search')}
          className={`flex-1 py-2 text-xs font-semibold transition-colors ${
            mode === 'search'
              ? 'text-pink-400 border-b-2 border-pink-500'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Search YouTube
        </button>
        <button
          onClick={() => setMode('url')}
          className={`flex-1 py-2 text-xs font-semibold transition-colors ${
            mode === 'url'
              ? 'text-pink-400 border-b-2 border-pink-500'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Paste URL
        </button>
      </div>

      {mode === 'search' && (
        <div className="flex flex-col">
          <form onSubmit={handleSearch} className="flex gap-2 p-3">
            <input
              type="text"
              placeholder="Search for a song…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-base focus:outline-none focus:border-pink-500"
            />
            <button
              type="submit"
              disabled={searching}
              className="px-4 py-2 bg-pink-600 hover:bg-pink-500 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {searching ? '…' : 'Search'}
            </button>
          </form>

          {searchError && <p className="px-3 pb-2 text-red-400 text-xs">{searchError}</p>}

          {searching && (
            <div className="px-3 pb-3 text-gray-500 text-xs">Searching…</div>
          )}

          {results.length > 0 && (
            <div className="overflow-y-auto max-h-64 flex flex-col divide-y divide-gray-800">
              {results.map((r) => (
                <div key={r.videoId} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-800 transition-colors">
                  <img
                    src={r.thumbnail}
                    alt=""
                    className="w-16 h-10 object-cover rounded flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.title}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {r.channelName}{r.duration ? ` · ${formatDuration(r.duration)}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => queueFromSearch(r)}
                    className="w-7 h-7 rounded-full bg-pink-600 hover:bg-pink-500 flex items-center justify-center text-sm font-bold flex-shrink-0 transition-colors"
                    aria-label="Add to queue"
                  >
                    +
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === 'url' && (
        <form onSubmit={handleUrlSubmit} className="flex flex-col gap-2 p-3">
          <div className="flex gap-2">
            <input
              type="url"
              placeholder="Paste YouTube URL…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-base focus:outline-none focus:border-pink-500"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-pink-600 hover:bg-pink-500 rounded-lg text-sm font-semibold transition-colors"
            >
              Add
            </button>
          </div>
          {urlError && <p className="text-red-400 text-xs">{urlError}</p>}
        </form>
      )}
    </div>
  )
}
