import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api'

function StatusDot({ online }) {
  return <span className={`inline-block w-3 h-3 rounded-full ${online ? 'bg-green-400' : 'bg-gray-600'}`} />
}

function ApiKeySection({ screen, onRegenerate }) {
  const [copied, setCopied] = useState(false)
  const [show, setShow] = useState(false)
  const [confirming, setConfirming] = useState(false)

  function copy() {
    navigator.clipboard.writeText(screen.api_key)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-gray-900 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-white">API ключ</h3>
        <button onClick={() => setShow(v => !v)} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
          {show ? 'Скрыть' : 'Показать'}
        </button>
      </div>
      {show && (
        <div className="bg-gray-800 rounded-lg px-4 py-3 font-mono text-xs break-all text-green-300 mb-3">
          {screen.api_key}
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={copy} className="flex-1 text-xs bg-gray-800 hover:bg-gray-700 text-white rounded-lg py-2 transition-colors">
          {copied ? 'Скопировано!' : 'Копировать ключ'}
        </button>
        {!confirming ? (
          <button onClick={() => setConfirming(true)} className="flex-1 text-xs bg-yellow-800/60 hover:bg-yellow-700/70 text-yellow-200 rounded-lg py-2 transition-colors">
            Перепривязать
          </button>
        ) : (
          <div className="flex-1 flex gap-1">
            <button onClick={() => { onRegenerate(); setConfirming(false); setShow(true) }} className="flex-1 text-xs bg-yellow-600 text-white rounded-lg py-2 transition-colors">
              Да, сменить
            </button>
            <button onClick={() => setConfirming(false)} className="flex-1 text-xs bg-gray-700 text-white rounded-lg py-2 transition-colors">
              Отмена
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function OverrideSection({ screenId, content, onChanged }) {
  const [overrides, setOverrides] = useState([])
  const [dropped, setDropped] = useState(null)
  const [startAt, setStartAt] = useState(() => new Date().toISOString().slice(0, 16))
  const [endAt, setEndAt] = useState(() => { const d = new Date(); d.setHours(d.getHours() + 1); return d.toISOString().slice(0, 16) })
  const [dragOver, setDragOver] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadOverrides = useCallback(async () => {
    const data = await api.screens.getOverrides(screenId)
    setOverrides(data)
  }, [screenId])

  useEffect(() => { loadOverrides() }, [loadOverrides])

  function onDragOver(e) { e.preventDefault(); setDragOver(true) }
  function onDragLeave() { setDragOver(false) }
  function onDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const id = e.dataTransfer.getData('content_id')
    const name = e.dataTransfer.getData('content_name')
    const type = e.dataTransfer.getData('content_type')
    if (id) setDropped({ id, name, type })
  }

  async function applyOverride() {
    if (!dropped) return
    setSaving(true)
    try {
      await api.screens.setOverride(screenId, {
        content_id: dropped.id,
        start_at: new Date(startAt).toISOString(),
        end_at: new Date(endAt).toISOString(),
      })
      setDropped(null)
      await loadOverrides()
      onChanged()
    } finally { setSaving(false) }
  }

  async function deleteOverride(oid) {
    await api.screens.deleteOverride(screenId, oid)
    loadOverrides()
    onChanged()
  }

  const now = new Date()

  return (
    <div className="bg-gray-900 rounded-xl p-5">
      <h3 className="font-medium text-white mb-4">Прерывание плейлиста</h3>
      <div className="flex gap-4">
        {/* Content list to drag from */}
        <div className="w-48 shrink-0">
          <div className="text-xs text-gray-500 mb-2">Перетащи контент →</div>
          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {content.map(c => (
              <div
                key={c.id}
                draggable
                onDragStart={e => {
                  e.dataTransfer.setData('content_id', c.id)
                  e.dataTransfer.setData('content_name', c.name)
                  e.dataTransfer.setData('content_type', c.type)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                className="bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 cursor-grab truncate select-none"
                title={c.name}
              >
                {c.name}
              </div>
            ))}
          </div>
        </div>

        {/* Drop zone + time */}
        <div className="flex-1">
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`rounded-xl border-2 border-dashed p-4 mb-3 flex items-center justify-center min-h-[72px] transition-colors ${
              dragOver ? 'border-indigo-500 bg-indigo-900/20' : 'border-gray-700 bg-gray-800/30'
            }`}
          >
            {dropped ? (
              <div className="flex items-center gap-3 w-full">
                <span className="text-sm text-white font-medium truncate">{dropped.name}</span>
                <button onClick={() => setDropped(null)} className="ml-auto text-gray-500 hover:text-red-400 shrink-0">✕</button>
              </div>
            ) : (
              <span className="text-sm text-gray-600">Перетащи сюда</span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">С</label>
              <input type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)}
                className="w-full bg-gray-800 text-white text-xs rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">До</label>
              <input type="datetime-local" value={endAt} onChange={e => setEndAt(e.target.value)}
                className="w-full bg-gray-800 text-white text-xs rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>

          <button
            onClick={applyOverride}
            disabled={!dropped || saving}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm rounded-lg py-2 font-medium transition-colors"
          >
            {saving ? 'Применяется...' : 'Применить'}
          </button>
        </div>
      </div>

      {overrides.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="text-xs text-gray-500 mb-2">Запланированные прерывания</div>
          {overrides.map(ov => {
            const active = new Date(ov.start_at) <= now && now <= new Date(ov.end_at)
            const past = new Date(ov.end_at) < now
            return (
              <div key={ov.id} className={`flex items-center gap-3 bg-gray-800 rounded-lg px-3 py-2 ${past ? 'opacity-40' : ''}`}>
                {active && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-white font-medium truncate">{ov.name}</div>
                  <div className="text-xs text-gray-500">
                    {new Date(ov.start_at).toLocaleString('ru', { dateStyle: 'short', timeStyle: 'short' })} — {new Date(ov.end_at).toLocaleString('ru', { dateStyle: 'short', timeStyle: 'short' })}
                  </div>
                </div>
                <button onClick={() => deleteOverride(ov.id)} className="text-xs text-red-500 hover:text-red-400 shrink-0 transition-colors">Удалить</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function ScreenDetailPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const [screen, setScreen] = useState(null)
  const [playlists, setPlaylists] = useState([])
  const [content, setContent] = useState([])
  const [loading, setLoading] = useState(true)
  const [rebooting, setRebooting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    const [s, p, c] = await Promise.all([api.screens.get(id), api.playlists.list(), api.content.list()])
    setScreen(s)
    setPlaylists(p)
    setContent(c)
    setLoading(false)
  }, [id])

  useEffect(() => {
    load()
    const t = setInterval(() => api.screens.get(id).then(setScreen).catch(() => {}), 15000)
    return () => clearInterval(t)
  }, [load, id])

  async function assignPlaylist(playlistId) {
    await api.screens.update(id, { current_playlist_id: playlistId || null })
    setScreen(s => ({ ...s, current_playlist_id: playlistId || null }))
  }

  async function reboot() {
    setRebooting(true)
    await api.screens.reboot(id).catch(() => {})
    setTimeout(() => setRebooting(false), 3000)
  }

  async function regenerateKey() {
    const updated = await api.screens.regenerateKey(id)
    setScreen(updated)
  }

  async function deleteScreen() {
    if (!confirm(`Удалить экран "${screen.name}"?`)) return
    setDeleting(true)
    await api.screens.delete(id)
    nav('/screens')
  }

  if (loading) return <div className="text-gray-500">Загрузка...</div>
  if (!screen) return <div className="text-red-400">Экран не найден</div>

  const uptimeText = screen.online && screen.last_seen
    ? `В сети с ${new Date(screen.last_seen).toLocaleString('ru')}`
    : screen.last_seen
    ? `Последний раз в сети ${new Date(screen.last_seen).toLocaleString('ru')}`
    : 'Никогда не подключался'

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <button onClick={() => nav('/screens')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-300 mb-6 transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Все экраны
      </button>

      <div className="flex items-center gap-3 mb-8">
        <span className={`w-3 h-3 rounded-full shrink-0 ${screen.online ? 'bg-green-400' : 'bg-gray-600'}`} />
        <h1 className="text-2xl font-bold">{screen.name}</h1>
        <span className={`text-xs px-2 py-0.5 rounded-full ${screen.online ? 'bg-green-900/40 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
          {screen.online ? 'В сети' : 'Не в сети'}
        </span>
      </div>

      <div className="grid gap-4">
        {/* Status & uptime */}
        <div className="bg-gray-900 rounded-xl p-5">
          <div className="flex items-start justify-between mb-3">
            <h3 className="font-medium text-white">Статус</h3>
            {screen.app_version && (
              <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full font-mono">
                v{screen.app_version}
              </span>
            )}
          </div>
          <div className="text-sm text-gray-400">{uptimeText}</div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={reboot}
              disabled={!screen.online || rebooting}
              className="bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-white text-sm rounded-lg px-4 py-2 transition-colors"
            >
              {rebooting ? 'Перезагружается...' : 'Перезагрузить'}
            </button>
          </div>
        </div>

        {/* Playlist */}
        <div className="bg-gray-900 rounded-xl p-5">
          <h3 className="font-medium text-white mb-3">Плейлист</h3>
          <select
            className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            value={screen.current_playlist_id || ''}
            onChange={e => assignPlaylist(e.target.value)}
          >
            <option value="">— не назначен —</option>
            {playlists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {/* Override */}
        <OverrideSection screenId={id} content={content} onChanged={load} />

        {/* API key */}
        <ApiKeySection screen={screen} onRegenerate={regenerateKey} />

        {/* Danger zone */}
        <div className="bg-gray-900 rounded-xl p-5">
          <h3 className="font-medium text-red-400 mb-3">Удалить экран</h3>
          <button
            onClick={deleteScreen}
            disabled={deleting}
            className="bg-red-900/40 hover:bg-red-800/60 text-red-300 text-sm rounded-lg px-4 py-2 transition-colors"
          >
            {deleting ? 'Удаление...' : `Удалить "${screen.name}"`}
          </button>
        </div>
      </div>
    </div>
  )
}
