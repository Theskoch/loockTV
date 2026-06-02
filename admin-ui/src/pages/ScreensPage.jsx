import { useEffect, useState, useCallback } from 'react'
import { api } from '../api'

function StatusDot({ online }) {
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full ${online ? 'bg-green-400' : 'bg-gray-600'}`} />
  )
}

function ApiKeyModal({ screen, onClose, onRegenerate }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(screen.api_key)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-1">{screen.name}</h2>
        <p className="text-sm text-gray-400 mb-4">API ключ экрана. Введи его в приложении на Windows ПК.</p>
        <div className="bg-gray-800 rounded-lg px-4 py-3 font-mono text-sm break-all text-green-300 mb-4">
          {screen.api_key}
        </div>
        <div className="flex gap-3">
          <button onClick={copy} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg py-2 text-sm font-medium transition-colors">
            {copied ? 'Скопировано!' : 'Копировать'}
          </button>
          <button
            onClick={async () => { await onRegenerate(screen.id); onClose() }}
            className="flex-1 bg-yellow-700 hover:bg-yellow-600 text-white rounded-lg py-2 text-sm font-medium transition-colors"
          >
            Перепривязать
          </button>
        </div>
      </div>
    </div>
  )
}

function OverrideModal({ screen, content, onClose, onSave }) {
  const [contentId, setContentId] = useState('')
  const [startAt, setStartAt] = useState(() => new Date().toISOString().slice(0, 16))
  const [endAt, setEndAt] = useState(() => {
    const d = new Date(); d.setHours(d.getHours() + 1)
    return d.toISOString().slice(0, 16)
  })
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!contentId) return
    setLoading(true)
    try {
      await onSave(screen.id, { content_id: contentId, start_at: new Date(startAt).toISOString(), end_at: new Date(endAt).toISOString() })
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <form className="bg-gray-900 rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <h2 className="text-lg font-semibold mb-4">Временное прерывание — {screen.name}</h2>
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-1">Контент</label>
          <select
            className="w-full bg-gray-800 rounded-lg px-4 py-2.5 text-white outline-none focus:ring-2 focus:ring-indigo-500"
            value={contentId} onChange={e => setContentId(e.target.value)} required
          >
            <option value="">— выбрать —</option>
            {content.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div>
            <label className="block text-sm text-gray-400 mb-1">С</label>
            <input type="datetime-local" className="w-full bg-gray-800 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              value={startAt} onChange={e => setStartAt(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">До</label>
            <input type="datetime-local" className="w-full bg-gray-800 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              value={endAt} onChange={e => setEndAt(e.target.value)} required />
          </div>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white rounded-lg py-2 text-sm font-medium transition-colors">Отмена</button>
          <button type="submit" disabled={loading} className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium transition-colors">Применить</button>
        </div>
      </form>
    </div>
  )
}

export default function ScreensPage() {
  const [screens, setScreens] = useState([])
  const [playlists, setPlaylists] = useState([])
  const [content, setContent] = useState([])
  const [newName, setNewName] = useState('')
  const [keyModal, setKeyModal] = useState(null)
  const [overrideModal, setOverrideModal] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [s, p, c] = await Promise.all([api.screens.list(), api.playlists.list(), api.content.list()])
    setScreens(s)
    setPlaylists(p)
    setContent(c)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
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

  async function assignPlaylist(screenId, playlistId) {
    await api.screens.update(screenId, { current_playlist_id: playlistId || null })
    load()
  }

  async function regenKey(id) {
    const updated = await api.screens.regenerateKey(id)
    load()
    return updated
  }

  async function deleteScreen(id) {
    if (!confirm('Удалить экран?')) return
    await api.screens.delete(id)
    load()
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
        <div className="grid gap-4">
          {screens.map(screen => (
            <div key={screen.id} className={`bg-gray-900 rounded-xl p-5 flex items-center gap-4 ${!screen.online ? 'opacity-60' : ''}`}>
              <StatusDot online={screen.online} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-white">{screen.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {screen.online ? 'В сети' : screen.last_seen ? `Был в сети ${new Date(screen.last_seen).toLocaleString('ru')}` : 'Никогда не подключался'}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  className="bg-gray-800 text-sm text-white rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500"
                  value={screen.current_playlist_id || ''}
                  onChange={e => assignPlaylist(screen.id, e.target.value)}
                >
                  <option value="">— нет плейлиста —</option>
                  {playlists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button
                  onClick={() => setOverrideModal(screen)}
                  className="text-xs bg-yellow-700/50 hover:bg-yellow-600/70 text-yellow-200 px-3 py-1.5 rounded-lg transition-colors"
                  title="Временное прерывание"
                >
                  Прервать
                </button>
                <button
                  onClick={() => setKeyModal(screen)}
                  className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 px-3 py-1.5 rounded-lg transition-colors"
                  title="Показать/перегенерировать ключ"
                >
                  Ключ
                </button>
                <button
                  onClick={() => deleteScreen(screen.id)}
                  className="text-xs text-red-500 hover:text-red-400 px-2 py-1.5 transition-colors"
                >
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {keyModal && (
        <ApiKeyModal
          screen={keyModal}
          onClose={() => { setKeyModal(null); load() }}
          onRegenerate={async (id) => {
            const updated = await regenKey(id)
            setKeyModal(updated)
          }}
        />
      )}
      {overrideModal && (
        <OverrideModal
          screen={overrideModal}
          content={content}
          onClose={() => setOverrideModal(null)}
          onSave={api.screens.setOverride}
        />
      )}
    </div>
  )
}
