import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

function StatusDot({ online }) {
  return <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${online ? 'bg-green-400' : 'bg-gray-600'}`} />
}

export default function ScreensPage() {
  const [screens, setScreens] = useState([])
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)
  const [keyModal, setKeyModal] = useState(null)
  const [copied, setCopied] = useState(false)
  const [latestVersion, setLatestVersion] = useState(null)
  const nav = useNavigate()

  const load = useCallback(async () => {
    const s = await api.screens.list()
    setScreens(s)
    setLoading(false)
  }, [])

  function compareVersions(a, b) {
    if (!a || !b) return 0
    const pa = a.split('.').map(Number), pb = b.split('.').map(Number)
    for (let i = 0; i < 3; i++) {
      if ((pa[i] || 0) < (pb[i] || 0)) return -1
      if ((pa[i] || 0) > (pb[i] || 0)) return 1
    }
    return 0
  }

  useEffect(() => {
    load()
    api.getLatestVersion().then(d => setLatestVersion(d.version)).catch(() => {})
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [load])

  async function createScreen(e) {
    e.preventDefault()
    if (!newName.trim()) return
    const s = await api.screens.create(newName.trim())
    setNewName('')
    setKeyModal(s)
    load()
  }

  function copy(text) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return <div className="text-gray-500">Загрузка...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Экраны</h1>
        <form onSubmit={createScreen} className="flex gap-2">
          <input
            className="bg-gray-800 rounded-lg px-4 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500 w-48"
            placeholder="Название экрана"
            value={newName} onChange={e => setNewName(e.target.value)}
          />
          <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            Добавить
          </button>
        </form>
      </div>

      {screens.length === 0 ? (
        <div className="text-center text-gray-600 py-20">Нет экранов. Добавь первый.</div>
      ) : (
        <div className="grid gap-3">
          {screens.map(screen => (
            <div
              key={screen.id}
              onClick={() => nav(`/screens/${screen.id}`)}
              className={`bg-gray-900 hover:bg-gray-800 rounded-xl px-5 py-4 flex items-center gap-4 cursor-pointer transition-colors ${!screen.online ? 'opacity-60' : ''}`}
            >
              <div className="w-28 aspect-video rounded-lg overflow-hidden bg-black shrink-0 flex items-center justify-center">
                {screen.last_screenshot_at ? (
                  <img src={api.screens.screenshotUrl(screen.id, screen.last_screenshot_at)} className="w-full h-full object-cover" alt="" />
                ) : (
                  <span className="text-[10px] text-gray-600 px-1 text-center">нет превью</span>
                )}
              </div>
              <StatusDot online={screen.online} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-white">{screen.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {screen.online ? 'В сети' : screen.last_seen ? `Последний раз в сети ${new Date(screen.last_seen).toLocaleString('ru')}` : 'Никогда не подключался'}
                </div>
              </div>
              {screen.app_version && (
                <span className={`text-xs font-mono shrink-0 ${compareVersions(screen.app_version, latestVersion) < 0 ? 'text-yellow-500' : 'text-gray-600'}`}>
                  v{screen.app_version}{compareVersions(screen.app_version, latestVersion) < 0 ? ' ↑' : ''}
                </span>
              )}
              {screen.playlist_name && (
                <span className="text-xs text-gray-500 bg-gray-800 px-2.5 py-1 rounded-lg shrink-0">
                  {screen.playlist_name}
                </span>
              )}
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-600 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          ))}
        </div>
      )}

      {/* API key modal shown right after creating a screen */}
      {keyModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setKeyModal(null)}>
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-1">{keyModal.name} — создан</h2>
            <p className="text-sm text-gray-400 mb-4">Скопируй API ключ и введи в приложении на Windows ПК.</p>
            <div className="bg-gray-800 rounded-lg px-4 py-3 font-mono text-sm break-all text-green-300 mb-4">
              {keyModal.api_key}
            </div>
            <div className="flex gap-3">
              <button onClick={() => copy(keyModal.api_key)} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg py-2 text-sm font-medium transition-colors">
                {copied ? 'Скопировано!' : 'Копировать'}
              </button>
              <button onClick={() => { setKeyModal(null); nav(`/screens/${keyModal.id}`) }} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2 text-sm font-medium transition-colors">
                Открыть экран
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
