import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import LoginPage from './pages/LoginPage'
import ScreensPage from './pages/ScreensPage'
import ScreenDetailPage from './pages/ScreenDetailPage'
import PlaylistsPage from './pages/PlaylistsPage'
import ContentPage from './pages/ContentPage'
import { api } from './api'

function Layout({ children }) {
  const loc = useLocation()
  const nav = [
    { to: '/screens', label: 'Экраны' },
    { to: '/playlists', label: 'Плейлисты' },
    { to: '/content', label: 'Контент' },
  ]
  return (
    <div className="flex min-h-screen">
      <aside className="w-48 bg-gray-900 flex flex-col py-6 px-4 gap-2 shrink-0">
        <div className="text-xl font-bold text-white mb-6 px-2">LoockIT</div>
        {nav.map(n => (
          <Link
            key={n.to}
            to={n.to}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              loc.pathname.startsWith(n.to)
                ? 'bg-indigo-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            {n.label}
          </Link>
        ))}
        <div className="mt-auto">
          <button
            onClick={() => { localStorage.removeItem('token'); window.location.href = '/login' }}
            className="w-full px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-red-400 hover:bg-gray-800 text-left transition-colors"
          >
            Выйти
          </button>
        </div>
      </aside>
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  )
}

function ProtectedRoute({ children }) {
  const [auth, setAuth] = useState(null)
  useEffect(() => {
    api.me().then(() => setAuth(true)).catch(() => setAuth(false))
  }, [])
  if (auth === null) return <div className="flex items-center justify-center h-screen text-gray-500">Загрузка...</div>
  if (!auth) return <Navigate to="/login" replace />
  return <Layout>{children}</Layout>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/screens" element={<ProtectedRoute><ScreensPage /></ProtectedRoute>} />
      <Route path="/screens/:id" element={<ProtectedRoute><ScreenDetailPage /></ProtectedRoute>} />
      <Route path="/playlists" element={<ProtectedRoute><PlaylistsPage /></ProtectedRoute>} />
      <Route path="/content" element={<ProtectedRoute><ContentPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/screens" replace />} />
    </Routes>
  )
}
