import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

interface Props {
  roomCode: string
}

export default function RoomQRCode({ roomCode }: Props) {
  const [joinUrl, setJoinUrl] = useState<string | null>(null)

  useEffect(() => {
    const origin = window.location.origin
    if (!origin.includes('localhost') && !origin.includes('127.0.0.1')) {
      setJoinUrl(`${origin}/?room=${roomCode}`)
    } else {
      fetch('/api/info')
        .then((r) => r.json())
        .then((d: { clientUrl: string | null }) => {
          if (d.clientUrl) setJoinUrl(`${d.clientUrl}/?room=${roomCode}`)
        })
        .catch(() => {})
    }
  }, [roomCode])

  if (!joinUrl) return null

  return (
    <div className="mt-4 flex flex-col items-center gap-2 p-4 bg-gray-900 rounded-xl">
      <p className="text-xs text-gray-400 font-medium">Scan to join</p>
      <div className="bg-white p-2 rounded-lg">
        <QRCodeSVG value={joinUrl} size={120} />
      </div>
      <p className="text-xs text-gray-500 font-mono">{roomCode}</p>
    </div>
  )
}
