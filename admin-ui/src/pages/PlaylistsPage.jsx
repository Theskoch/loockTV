import { useEffect, useState } from 'react'
import { api } from '../api'

function PlaylistEditor({ playlist, content, onSave, onClose }) {
  const [name, setName] = useState(playlist?.name || '')
  const [items, setItems] = useState(playlist?.items?.map(i => ({ content_id: i.content_id, duration_seconds: i.duration_seconds, _name: i.name })) || [])
  const [loading, setLoading] = useState(false)

  function addItem(contentId) {
    const c = content.find(x => x.id === contentId)
    if (!c) return
    setItems(prev => [...prev, { content_id: contentId, duration_seconds: 10, _name: c.name }])
  }

  function removeItem(idx) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  function moveItem(idx, dir) {
    const arr = [...items]
    const to = idx + dir
    if (to < 0 || to >= arr.length) return
    ;[arr[idx], arr[to]] = [arr[to], arr[idx]]
    setItems(arr)
  }

  async function submit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      const payload = { name: name.trim(), items: items.map(({ content_id, duration_seconds }) => ({ content_id, duration_seconds })) }
      if (playlist?.id) await api.playlists.update(playlist.id, payload)
      else await api.playlists.create(payload)
      onSave()
    } finally {
      setLoading(false)
    }
  }

  const availableContent = content.filter(c => c.type !== 'url' ? true : true)

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <form className="bg-gray-900 rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <h2 className="text-lg font-semibold mb-4">{playlist ? 'Редактировать' : 'Новый'} плейлист</h2>

        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-1">Название</label>
          <input
            className="w-full bg-gray-800 rounded-lg px-4 py-2.5 text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            value={name} onChange={e => setName(e.target.value)} required
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-1">Добавить элемент</label>
          <select
            className="w-full bg-gray-800 rounded-lg px-4 py-2.5 text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            onChange={e => { if (e.target.value) { addItem(e.target.value); e.target.value = '' } }}
          >
            <option value="">— выбрать контент —</option>
            {availableContent.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="flex-1 overflow-auto mb-4">
          {items.length === 0 ? (
            <div className="text-center text-gray-600 py-8 text-sm">Плейлист пуст</div>
          ) : (
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="bg-gray-800 rounded-lg px-4 py-3 flex items-center gap-3">
                  <span className="text-gray-400 text-xs w-5 text-center">{idx + 1}</span>
                  <span className="flex-1 text-sm text-white truncate">{item._name}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="number" min="1" max="3600"
                      className="w-16 bg-gray-700 rounded px-2 py-1 text-xs text-white text-center outline-none"
                      value={item.duration_seconds}
                      onChange={e => setItems(prev => prev.map((x, i) => i === idx ? { ...x, duration_seconds: parseInt(e.target.value) || 10 } : x))}
                    />
                    <span className="text-xs text-gray-500">с</span>
                    <button type="button" onClick={() => moveItem(idx, -1)} className="text-gray-400 hover:text-white px-1">↑</button>
                    <button type="button" onClick={() => moveItem(idx, 1)} className="text-gray-400 hover:text-white px-1">↓</button>
                    <button type="button" onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-400 px-1">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white rounded-lg py-2 text-sm font-medium transition-colors">Отмена</button>
          <button type="submit" disabled={loading} className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium transition-colors">
            {loading ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState([])
  const [content, setContent] = useState([])
  const [loading, setLoading] = useState(true)
  const [editor, setEditor] = useState(null) // null | 'new' | playlist object

  async function load() {
    const [p, c] = await Promise.all([api.playlists.list(), api.content.list()])
    setPlaylists(p)
    setContent(c)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function openEditor(pl) {
    if (pl) {
      const full = await api.playlists.get(pl.id)
      setEditor(full)
    } else {
      setEditor('new')
    }
  }

  async function del(id) {
    if (!confirm('Удалить плейлист?')) return
    await api.playlists.delete(id)
    load()
  }

  if (loading) return <div className="text-gray-500">Загрузка...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Плейлисты</h1>
        <button
          onClick={() => openEditor(null)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Создать
        </button>
      </div>

      {playlists.length === 0 ? (
        <div className="text-center text-gray-600 py-20">Нет плейлистов. Создай первый.</div>
      ) : (
        <div className="grid gap-3">
          {playlists.map(pl => (
            <div key={pl.id} className="bg-gray-900 rounded-xl px-5 py-4 flex items-center gap-4">
              <div className="flex-1">
                <div className="font-medium text-white">{pl.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{new Date(pl.created_at).toLocaleDateString('ru')}</div>
              </div>
              <button onClick={() => openEditor(pl)} className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg transition-colors">Изменить</button>
              <button onClick={() => del(pl.id)} className="text-xs text-red-500 hover:text-red-400 transition-colors">Удалить</button>
            </div>
          ))}
        </div>
      )}

      {editor !== null && (
        <PlaylistEditor
          playlist={editor === 'new' ? null : editor}
          content={content}
          onSave={() => { setEditor(null); load() }}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  )
}
