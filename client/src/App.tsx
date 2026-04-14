import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { RoomProvider } from './context/RoomContext'
import Home from './pages/Home'

const Room = lazy(() => import('./pages/Room'))
const Display = lazy(() => import('./pages/Display'))

export default function App() {
  return (
    <BrowserRouter>
      <RoomProvider>
        <Suspense fallback={<div className="min-h-full bg-gray-950" />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/room/:code" element={<Room />} />
            <Route path="/display/:code" element={<Display />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </RoomProvider>
    </BrowserRouter>
  )
}
