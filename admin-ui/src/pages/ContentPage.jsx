import { useEffect, useState, useRef } from 'react'
import { api } from '../api'

const TYPE_LABELS = { image: 'Изображение', video: 'Видео', url: 'Сайт' }
const TYPE_COLORS = { image: 'bg-blue-900/50 text-blue-300', video: 'bg-purple-900/50 text-purple-300', url: 'bg-green-900/50 text-green-300' }

function formatBytes(b) {
  if (!b) return ''
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

export default function ContentPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [urlName, setUrlName] = useState('')
  const [urlVal, setUrlVal] = useState('')
  const [tab, setTab] = useState('file')
  const fileRef = useRef()

  async function load() {
    const data = await api.content.list()
    setItems(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function uploadFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await api.content.uploadFile(file, file.name)
      load()
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function addUrl(e) {
    e.preventDefault()
    if (!urlName.trim() || !urlVal.trim()) return
    await api.content.addUrl(urlName.trim(), urlVal.trim())
    setUrlName('')
    setUrlVal('')
    load()
  }

  async function del(id) {
    if (!confirm('Удалить?')) return
    await api.content.delete(id)
    load()
  }

  if (loading) return <div className="text-gray-500">Загрузка...</div>

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Контент</h1>

      <div className="bg-gray-900 rounded-xl p-5 mb-6">
        <div className="flex gap-2 mb-4">
          {['file', 'url'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
              {t === 'file' ? 'Загрузить файл' : 'Добавить URL'}
            </button>
          ))}
        </div>

        {tab === 'file' && (
          <div>
            <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={uploadFile} />
            <button
              onClick={() => fileRef.current.click()}
              disabled={uploading}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              {uploading ? 'Загрузка...' : 'Выбрать файл'}
            </button>
            <p className="text-xs text-gray-500 mt-2">Поддерживаются изображения и видео до 500 МБ</p>
          </div>
        )}

        {tab === 'url' && (
          <form onSubmit={addUrl} className="flex gap-3">
            <input
              className="flex-1 bg-gray-800 rounded-lg px-4 py-2.5 text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Название"
              value={urlName} onChange={e => setUrlName(e.target.value)}
            />
            <input
              className="flex-[2] bg-gray-800 rounded-lg px-4 py-2.5 text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="https://example.com"
              value={urlVal} onChange={e => setUrlVal(e.target.value)}
            />
            <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
              Добавить
            </button>
          </form>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-center text-gray-600 py-20">Нет контента. Загрузи первый файл.</div>
      ) : (
        <div className="grid gap-2">
          {items.map(item => (
            <div key={item.id} className="bg-gray-900 rounded-xl px-5 py-4 flex items-center gap-4">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[item.type]}`}>
                {TYPE_LABELS[item.type]}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">{item.name}</div>
                {item.url && <div className="text-xs text-gray-500 truncate">{item.url}</div>}
                {item.size_bytes && <div className="text-xs text-gray-600">{formatBytes(item.size_bytes)}</div>}
              </div>
              <button onClick={() => del(item.id)} className="text-xs text-red-500 hover:text-red-400 transition-colors">Удалить</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
