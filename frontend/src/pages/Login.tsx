import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

export default function Login({ onLogin }: { onLogin: (user: { id: number; username: string }) => void }) {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await api.login(username, password)
      onLogin(res.user)
      navigate('/')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="max-w-sm w-full mx-4">
        <div className="text-center mb-8">
          <div className="h-12 w-12 rounded-xl bg-[#1ea97c] flex items-center justify-center text-white font-bold text-xl mx-auto mb-4">▷</div>
          <h1 className="text-2xl font-bold text-[#1a1a1a]">Breathe ESG</h1>
          <p className="text-sm text-[#6b7280] mt-1">Sign in to your account</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#6b7280] uppercase tracking-wider mb-1.5">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border border-[#d1d5db] rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#1ea97c]/20 focus:border-[#1ea97c] outline-none transition-all"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#6b7280] uppercase tracking-wider mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-[#d1d5db] rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#1ea97c]/20 focus:border-[#1ea97c] outline-none transition-all"
              required
            />
          </div>
          {error && (
            <div className="bg-[#fde8e1] border border-[#f5c6b3] text-[#c2410c] px-4 py-3 rounded-xl text-sm">{error}</div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#1ea97c] text-white px-6 py-2.5 rounded-xl font-medium hover:bg-[#178f69] disabled:opacity-50 transition-all shadow-sm"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
