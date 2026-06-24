import { supabase } from '../api/client'
import { useEffect, useState } from 'react'

const ROLE_STYLES = {
  teacher: 'text-[#5B9BD5] bg-[#5B9BD5]/10 border-[#5B9BD5]/20',
  student: 'text-[#10D9A0] bg-[#10D9A0]/10 border-[#10D9A0]/20',
  admin:   'text-[#F5A623] bg-[#F5A623]/10 border-[#F5A623]/20',
}

export default function Layout({ children, email, role }) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="app-shell min-h-[100dvh] bg-[#050505] text-white" style={{ fontFamily: 'Syne, sans-serif' }}>

      {/* Fixed mesh gradient */}
      <div className="fixed inset-0 pointer-events-none z-0" aria-hidden>
        <div className="absolute top-0 left-0 w-[700px] h-[500px] rounded-full bg-[#1A9B8C] opacity-[0.035] blur-[140px] translate-x-[-30%] translate-y-[-30%]" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] rounded-full bg-[#1B2E4B] opacity-[0.07] blur-[120px] translate-x-[20%] translate-y-[20%]" />
      </div>

      {/* Floating nav island */}
      <div className="app-header-wrap sticky top-0 z-40">
        <header
          className="app-header flex items-center justify-between border transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
          style={{
            background: scrolled ? 'rgba(13,17,23,0.85)' : 'rgba(22,27,34,0.7)',
            borderColor: scrolled ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: scrolled ? '0 8px 32px rgba(0,0,0,0.4)' : 'none',
          }}
        >
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-[6px] bg-[#1A9B8C] flex items-center justify-center shadow-[0_0_10px_rgba(26,155,140,0.5)]">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="6" r="2" fill="#050505"/>
                <circle cx="6" cy="6" r="4.5" stroke="#050505" strokeWidth="1.2" fill="none"/>
                <circle cx="6" cy="6" r="7" stroke="#050505" strokeWidth="0.8" fill="none" opacity="0.5"/>
              </svg>
            </div>
            <span className="text-[0.78rem] font-bold tracking-[0.08em] uppercase text-white/90">
              AttendRFID
            </span>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2.5">
            {role && (
              <span className={`hidden sm:inline-flex text-[0.6rem] font-mono uppercase tracking-[0.12em] px-2 py-0.5 rounded-full border ${ROLE_STYLES[role]}`}>
                {role}
              </span>
            )}
            <span className="hidden md:block text-[0.72rem] font-mono text-white/30">{email}</span>
            <button
              onClick={() => supabase.auth.signOut()}
              className="text-[0.72rem] font-mono text-white/30 hover:text-white/70 border border-white/[0.06] hover:border-white/[0.12] px-3 py-1 rounded-lg transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/[0.03]"
            >
              sign out
            </button>
          </div>
        </header>
      </div>

      {/* Page content */}
      <main className="app-content relative z-10">
        {children}
      </main>
    </div>
  )
}
