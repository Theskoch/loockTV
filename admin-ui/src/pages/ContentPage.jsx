import { useEffect, useState, useRef, useCallback } from 'react'
import { api } from '../api'

const TYPE_LABELS = { image: 'Фото', video: 'Видео', url: 'Сайт' }
const TYPE_COLORS = { image: 'bg-blue-900/50 text-blue-300', video: 'bg-purple-900/50 text-purple-300', url: 'bg-green-900/50 text-green-300' }

function formatBytes(b) {
  if (!b) return ''
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} ГБ`
}

export default function ContentPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadName, setUploadName] = useState(null)
  const [uploadPercent, setUploadPercent] = useState(0)
  const [toast, setToast] = useState(null)
  const [urlName, setUrlName] = useState('')
  const [urlVal, setUrlVal] = useState('')
  const [tab, setTab] = useState('file')
  const [dropZoneActive, setDropZoneActive] = useState(false)
  const fileRef = useRef()
  const dragCounter = useRef(0)

  const load = useCallback(async () => {
    const data = await api.content.list()
    setItems(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  async function uploadFile(file) {
    if (!file) return
    setUploading(true)
    setUploadName(file.name)
    setUploadPercent(0)
    try {
      await api.content.uploadFile(file, file.name, (pct) => setUploadPercent(pct))
      await load()
      showToast(`Контент загружен: ${file.name}`)
    } catch (err) {
      showToast(`Ошибка загрузки: ${file.name}`)
    } finally {
      setUploading(false)
      setUploadName(null)
      setUploadPercent(0)
    }
  }

  async function uploadFiles(files) {
    for (const file of files) {
      await uploadFile(file)
    }
  }

  function handleFileInput(e) {
    const files = Array.from(e.target.files || [])
    if (files.length) uploadFiles(files)
    e.target.value = ''
  }

  // Global drag & drop handlers
  function onPageDragEnter(e) {
    e.preventDefault()
    dragCounter.current++
    if (dragCounter.current === 1) setDropZoneActive(true)
  }
  function onPageDragLeave(e) {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) setDropZoneActive(false)
  }
  function onPageDragOver(e) { e.preventDefault() }
  function onPageDrop(e) {
    e.preventDefault()
    dragCounter.current = 0
    setDropZoneActive(false)
    const files = Array.from(e.dataTransfer.files).filter(f => /^(image|video)\//.test(f.type))
    if (files.length) uploadFiles(files)
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
    <div
      onDragEnter={onPageDragEnter}
      onDragLeave={onPageDragLeave}
      onDragOver={onPageDragOver}
      onDrop={onPageDrop}
    >
      <h1 className="text-2xl font-bold mb-8">Контент</h1>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-green-600 text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}

      {/* Drop overlay */}
      {dropZoneActive && (
        <div className="fixed inset-0 z-50 bg-indigo-900/40 border-4 border-dashed border-indigo-500 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-16 h-16 text-indigo-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <div className="text-2xl font-bold text-indigo-200">Отпусти файлы здесь</div>
            <div className="text-sm text-indigo-400 mt-1">Изображения и видео до 10 ГБ</div>
          </div>
        </div>
      )}

      <div className="bg-gray-900 rounded-xl p-5 mb-6">
        {/* Upload area */}
        <div
          onClick={() => fileRef.current.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault()
            e.stopPropagation()
            dragCounter.current = 0
            setDropZoneActive(false)
            const files = Array.from(e.dataTransfer.files).filter(f => /^(image|video)\//.test(f.type))
            if (files.length) uploadFiles(files)
          }}
          className="border-2 border-dashed border-gray-700 hover:border-indigo-500 rounded-xl p-8 text-center cursor-pointer transition-colors mb-4 group"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-gray-600 group-hover:text-indigo-500 mx-auto mb-3 transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          {uploading ? (
            <div className="max-w-md mx-auto">
              <div className="text-sm text-indigo-400 mb-2 truncate">Загружается: {uploadName}</div>
              <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 transition-all duration-150"
                  style={{ width: `${uploadPercent}%` }}
                />
              </div>
              <div className="text-xs text-indigo-300 mt-1.5 font-medium">
                {uploadPercent}%{uploadPercent === 100 ? ' — обработка на сервере...' : ''}
              </div>
            </div>
          ) : (
            <>
              <div className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">
                Перетащи файлы сюда или нажми для выбора
              </div>
              <div className="text-xs text-gray-600 mt-1">Изображения и видео до 10 ГБ</div>
            </>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFileInput} />

        {/* URL tab */}
        <div className="border-t border-gray-800 pt-4">
          <div className="text-xs text-gray-500 mb-3">Или добавить сайт по URL</div>
          <form onSubmit={addUrl} className="flex gap-3">
            <input
              className="flex-1 bg-gray-800 rounded-lg px-4 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Название"
              value={urlName} onChange={e => setUrlName(e.target.value)}
            />
            <input
              className="flex-[2] bg-gray-800 rounded-lg px-4 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="https://example.com"
              value={urlVal} onChange={e => setUrlVal(e.target.value)}
            />
            <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap">
              Добавить
            </button>
          </form>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-center text-gray-600 py-20">Нет контента. Перетащи файлы или загрузи через форму.</div>
      ) : (
        <div className="grid gap-2">
          {items.map(item => (
            <div key={item.id} className="bg-gray-900 rounded-xl px-5 py-3.5 flex items-center gap-3">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${TYPE_COLORS[item.type]}`}>
                {TYPE_LABELS[item.type]}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">{item.name}</div>
                {item.url && <div className="text-xs text-gray-500 truncate">{item.url}</div>}
              </div>
              {item.size_bytes && <div className="text-xs text-gray-600 shrink-0">{formatBytes(item.size_bytes)}</div>}
              <button onClick={() => del(item.id)} className="text-xs text-red-500 hover:text-red-400 transition-colors shrink-0">Удалить</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
