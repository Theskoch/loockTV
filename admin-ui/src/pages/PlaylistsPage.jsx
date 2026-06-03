import { useEffect, useState, useRef } from 'react'
import { api } from '../api'

const TYPE_COLORS = { image: 'text-blue-400', video: 'text-purple-400', url: 'text-green-400' }
const TYPE_ICONS = {
  image: '🖼',
  video: '🎬',
  url: '🌐',
}

// Drop zone between playlist items
function DropLine({ onDrop, active }) {
  return (
    <div
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); onDrop() }}
      className={`h-1.5 rounded-full mx-2 transition-all ${active ? 'bg-indigo-500 h-2' : 'bg-transparent hover:bg-gray-700'}`}
    />
  )
}

function PlaylistEditor({ playlist, content, onSave, onClose }) {
  const [name, setName] = useState(playlist?.name || '')
  const [items, setItems] = useState(
    playlist?.items?.map(i => ({ content_id: i.content_id, duration_seconds: i.duration_seconds, _name: i.name, _type: i.type, _key: Math.random() })) || []
  )
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [dragSrc, setDragSrc] = useState(null) // { from: 'content'|'playlist', idx?, item? }
  const [dropLineIdx, setDropLineIdx] = useState(null) // index of drop line to highlight

  const filteredContent = content.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))

  // ---- Drag from content library ----
  function onContentDragStart(e, c) {
    setDragSrc({ from: 'content', item: c })
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('text/plain', c.id)
  }

  // ---- Drag playlist item (reorder) ----
  function onItemDragStart(e, idx) {
    setDragSrc({ from: 'playlist', idx })
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(idx))
  }

  function onItemDragEnd() { setDragSrc(null); setDropLineIdx(null) }

  // Drop on a drop-line (insert before index `lineIdx`, or append if lineIdx === items.length)
  function onDropAtLine(lineIdx) {
    if (!dragSrc) return
    setDropLineIdx(null)
    setDragSrc(null)

    if (dragSrc.from === 'content') {
      const c = dragSrc.item
      const newItem = { content_id: c.id, duration_seconds: 10, _name: c.name, _type: c.type, _key: Math.random() }
      setItems(prev => {
        const arr = [...prev]
        arr.splice(lineIdx, 0, newItem)
        return arr
      })
    } else if (dragSrc.from === 'playlist') {
      const fromIdx = dragSrc.idx
      setItems(prev => {
        const arr = [...prev]
        const [moved] = arr.splice(fromIdx, 1)
        const insertAt = fromIdx < lineIdx ? lineIdx - 1 : lineIdx
        arr.splice(insertAt, 0, moved)
        return arr
      })
    }
  }

  // Drop directly on the playlist area (append)
  function onDropOnPlaylistArea(e) {
    e.preventDefault()
    if (!dragSrc) return
    if (dragSrc.from === 'content') {
      const c = dragSrc.item
      setItems(prev => [...prev, { content_id: c.id, duration_seconds: 10, _name: c.name, _type: c.type, _key: Math.random() }])
    }
    setDragSrc(null)
    setDropLineIdx(null)
  }

  function removeItem(idx) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  function moveItem(idx, dir) {
    const to = idx + dir
    if (to < 0 || to >= items.length) return
    setItems(prev => {
      const arr = [...prev]
      ;[arr[idx], arr[to]] = [arr[to], arr[idx]]
      return arr
    })
  }

  function addFromContent(c) {
    setItems(prev => [...prev, { content_id: c.id, duration_seconds: 10, _name: c.name, _type: c.type, _key: Math.random() }])
  }

  function updateDuration(idx, val) {
    setItems(prev => prev.map((x, i) => i === idx ? { ...x, duration_seconds: parseInt(val) || 10 } : x))
  }

  async function submit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      const payload = {
        name: name.trim(),
        items: items.map(({ content_id, duration_seconds }) => ({ content_id, duration_seconds })),
      }
      if (playlist?.id) await api.playlists.update(playlist.id, payload)
      else await api.playlists.create(payload)
      onSave()
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col"
        style={{ height: 'min(90vh, 700px)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-800 shrink-0">
          <input
            className="flex-1 bg-gray-800 rounded-lg px-4 py-2 text-white font-medium outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Название плейлиста"
            value={name} onChange={e => setName(e.target.value)}
            autoFocus
          />
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-white px-3 py-2 transition-colors">Отмена</button>
          <button
            onClick={submit}
            disabled={loading || !name.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>

        {/* Body: two panels */}
        <div className="flex flex-1 min-h-0">
          {/* Left: Playlist queue */}
          <div className="flex-1 flex flex-col border-r border-gray-800">
            <div className="px-5 py-3 text-xs text-gray-500 font-medium uppercase tracking-wide shrink-0 flex items-center justify-between">
              <span>Плейлист · {items.length} элем.</span>
              <span className="text-gray-700 normal-case font-normal">Перетаскивай для перестановки</span>
            </div>

            <div
              className="flex-1 overflow-y-auto px-3 py-2"
              onDragOver={e => e.preventDefault()}
              onDrop={onDropOnPlaylistArea}
            >
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-700 select-none">
                  <div className="text-4xl mb-3">←</div>
                  <div className="text-sm">Перетащи контент из правой панели</div>
                </div>
              ) : (
                <>
                  <DropLine
                    active={dropLineIdx === 0}
                    onDrop={() => onDropAtLine(0)}
                  />
                  {items.map((item, idx) => (
                    <div
                      key={item._key}
                      onDragEnter={() => setDropLineIdx(idx + 1)}
                    >
                      <div
                        draggable
                        onDragStart={e => onItemDragStart(e, idx)}
                        onDragEnd={onItemDragEnd}
                        className={`flex items-center gap-2 bg-gray-900 hover:bg-gray-800 rounded-lg px-3 py-2.5 group cursor-grab select-none transition-colors ${dragSrc?.from === 'playlist' && dragSrc.idx === idx ? 'opacity-40' : ''}`}
                      >
                        <span className="text-gray-600 text-xs w-5 text-center shrink-0">{idx + 1}</span>
                        <span className="text-base shrink-0">{TYPE_ICONS[item._type] || '📄'}</span>
                        <span className="flex-1 text-sm text-white truncate">{item._name}</span>
                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <input
                            type="number" min="1" max="3600"
                            value={item.duration_seconds}
                            onChange={e => updateDuration(idx, e.target.value)}
                            onClick={e => e.stopPropagation()}
                            onDragStart={e => e.stopPropagation()}
                            className="w-14 bg-gray-800 rounded px-2 py-1 text-xs text-white text-center outline-none cursor-text"
                          />
                          <span className="text-xs text-gray-600">с</span>
                          <button type="button" onClick={() => moveItem(idx, -1)} className="text-gray-500 hover:text-white px-1 text-sm">↑</button>
                          <button type="button" onClick={() => moveItem(idx, 1)} className="text-gray-500 hover:text-white px-1 text-sm">↓</button>
                          <button type="button" onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-400 px-1 text-sm ml-1">✕</button>
                        </div>
                      </div>
                      <DropLine
                        active={dropLineIdx === idx + 1}
                        onDrop={() => onDropAtLine(idx + 1)}
                      />
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Right: Content library */}
          <div className="w-72 shrink-0 flex flex-col">
            <div className="px-4 py-3 shrink-0">
              <div className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Библиотека контента</div>
              <input
                className="w-full bg-gray-800 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Поиск..."
                value={search} onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
              {filteredContent.length === 0 && (
                <div className="text-xs text-gray-600 text-center py-8">Нет контента</div>
              )}
              {filteredContent.map(c => (
                <div
                  key={c.id}
                  draggable
                  onDragStart={e => onContentDragStart(e, c)}
                  onDragEnd={() => setDragSrc(null)}
                  className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 rounded-lg px-3 py-2.5 cursor-grab select-none group transition-colors"
                >
                  <span className="text-sm shrink-0">{TYPE_ICONS[c.type] || '📄'}</span>
                  <span className="flex-1 text-sm text-gray-300 truncate">{c.name}</span>
                  <button
                    type="button"
                    onClick={() => addFromContent(c)}
                    className="text-gray-600 hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-all shrink-0 text-lg leading-none"
                    title="Добавить в плейлист"
                  >+</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState([])
  const [content, setContent] = useState([])
  const [loading, setLoading] = useState(true)
  const [editor, setEditor] = useState(null)

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
        <button onClick={() => openEditor(null)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
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
              <button onClick={() => openEditor(pl)} className="text-xs bg-gray-800 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg transition-colors">Изменить</button>
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
