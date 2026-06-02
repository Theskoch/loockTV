import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const nav = useNavigate()

  async function submit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { token } = await api.login(username, password)
      localStorage.setItem('token', token)
      nav('/screens')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <form onSubmit={submit} className="bg-gray-900 rounded-2xl p-8 w-full max-w-sm shadow-xl">
        <h1 className="text-2xl font-bold mb-6 text-center">LoockIT</h1>
        {error && <div className="mb-4 p-3 bg-red-900/50 text-red-300 rounded-lg text-sm">{error}</div>}
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-1">Логин</label>
          <input
            className="w-full bg-gray-800 rounded-lg px-4 py-2.5 text-white outline-none focus:ring-2 focus:ring-indigo-500"
            value={username} onChange={e => setUsername(e.target.value)} autoFocus
          />
        </div>
        <div className="mb-6">
          <label className="block text-sm text-gray-400 mb-1">Пароль</label>
          <input
            type="password"
            className="w-full bg-gray-800 rounded-lg px-4 py-2.5 text-white outline-none focus:ring-2 focus:ring-indigo-500"
            value={password} onChange={e => setPassword(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-lg py-2.5 transition-colors"
        >
          {loading ? 'Вход...' : 'Войти'}
        </button>
      </form>

      <a
        href="https://github.com/Theskoch/loockTV/releases/latest/download/LoockIT-Setup.exe"
        className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 hover:border-gray-600 rounded-xl text-sm text-gray-300 hover:text-white transition-all shadow-lg"
        download
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
        Скачать приложение для экрана (Windows)
      </a>
    </div>
  )
}
