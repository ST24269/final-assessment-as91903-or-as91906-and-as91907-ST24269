import { useEffect, useRef, useState } from 'react'

export default function Card({ children, title, action, delay = 0 }) {
  const [visible, setVisible] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect() } },
      { threshold: 0.05 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className="rounded-[1.5rem] border p-[3px] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]"
      style={{
        background: 'rgba(255,255,255,0.02)',
        borderColor: 'rgba(255,255,255,0.06)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(16px)',
        transitionDelay: `${delay}ms`,
      }}
    >
      {/* Inner core */}
      <div
        className="rounded-[calc(1.5rem-3px)] px-6 py-5"
        style={{
          background: '#161b22',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        {(title || action) && (
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            {title && (
              <p className="text-[0.6rem] font-mono uppercase tracking-[0.16em] text-white/25">
                {title}
              </p>
            )}
            {action && <div>{action}</div>}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
