import { useState, useEffect } from 'react'
import { supabase } from '../api/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setTimeout(() => setMounted(true), 50) }, [])

  const handleLogin = async () => {
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  const handleKey = (e) => { if (e.key === 'Enter') handleLogin() }

  return (
    <div className="min-h-[100dvh] bg-[#050505] flex items-center justify-center p-6 overflow-hidden" style={{ fontFamily: 'Syne, sans-serif' }}>

      {/* Mesh gradient */}
      <div className="fixed inset-0 pointer-events-none z-0" aria-hidden>
        <div className="absolute top-0 left-0 w-[700px] h-[500px] rounded-full bg-[#1A9B8C] opacity-[0.035] blur-[140px] translate-x-[-30%] translate-y-[-30%]" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] rounded-full bg-[#1B2E4B] opacity-[0.07] blur-[120px] translate-x-[20%] translate-y-[20%]" />
      </div>

      {/* Card */}
      <div
        className="relative z-10 w-full max-w-[400px]"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(24px)',
          transition: 'opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1)'
        }}
      >
        {/* Outer bezel */}
        <div className="rounded-[1.75rem] bg-white/2 border border-white/6 p-[3px] shadow-[0_32px_80px_rgba(0,0,0,0.6),0_0_60px_rgba(26,155,140,0.08)]">
          {/* Inner core */}
          <div className="rounded-[calc(1.75rem-3px)] bg-[#161b22] p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] flex flex-col gap-5">

            {/* Eyebrow */}
            <div className="flex items-center gap-2 w-fit bg-[#1A9B8C]/10 border border-[#1A9B8C]/20 rounded-full px-3 py-1">
              <span className="w-[5px] h-[5px] rounded-full bg-[#1A9B8C] animate-pulse" />
              <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-[#1A9B8C]">AttendRFID</span>
            </div>

            {/* Heading */}
            <div className="flex flex-col gap-1">
              <h1 className="text-[1.75rem] font-extrabold tracking-tight text-white leading-none">
                Sign in
              </h1>
              <p className="text-[0.8rem] font-mono text-white/30">Access your dashboard</p>
            </div>

            {/* Fields */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[0.6rem] font-mono uppercase tracking-[0.14em] text-white/25">Email</label>
                <input
                  type="email"
                  placeholder="you@school.nz"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={handleKey}
                  className="w-full px-4 py-3 rounded-[10px] bg-[#1c2330] border border-white/6 text-white text-sm font-mono placeholder-white/20 outline-none transition-all duration-300 focus:border-[#1A9B8C]/40 focus:shadow-[0_0_0_3px_rgba(26,155,140,0.08)]"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[0.6rem] font-mono uppercase tracking-[0.14em] text-white/25">Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={handleKey}
                  className="w-full px-4 py-3 rounded-[10px] bg-[#1c2330] border border-white/6 text-white text-sm font-mono placeholder-white/20 outline-none transition-all duration-300 focus:border-[#1A9B8C]/40 focus:shadow-[0_0_0_3px_rgba(26,155,140,0.08)]"
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[0.78rem] font-mono">
                {error}
              </div>
            )}

            {/* Button */}
            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-[#1A9B8C] text-[#050505] text-sm font-bold tracking-wide transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#22B5A4] hover:shadow-[0_8px_24px_rgba(26,155,140,0.3)] active:scale-[0.98]"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>

          </div>
        </div>
      </div>
    </div>
  )
}