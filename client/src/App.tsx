import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { RoomProvider } from './context/RoomContext'
import Home from './pages/Home'
import Room from './pages/Room'
import Display from './pages/Display'

export default function App() {
  return (
    <BrowserRouter>
      <RoomProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/room/:code" element={<Room />} />
          <Route path="/display/:code" element={<Display />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </RoomProvider>
    </BrowserRouter>
  )
}
