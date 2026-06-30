import { useEffect, useState } from 'react'

const THEME_KEY = 'attendrfid-theme'

function getStoredTheme() {
  if (typeof window === 'undefined') return 'dark'
  return window.localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

function animateThemeChange(theme, origin) {
  if (typeof document === 'undefined') return

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  if (!document.startViewTransition || !origin || reduceMotion) {
    applyTheme(theme)
    return
  }

  const transition = document.startViewTransition(() => {
    applyTheme(theme)
  })

  transition.ready.then(() => {
    const endRadius = Math.hypot(
      Math.max(origin.x, window.innerWidth - origin.x),
      Math.max(origin.y, window.innerHeight - origin.y),
    )

    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${origin.x}px ${origin.y}px)`,
          `circle(${endRadius}px at ${origin.x}px ${origin.y}px)`,
        ],
      },
      {
        duration: 500,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        pseudoElement: '::view-transition-new(root)',
      },
    )
  })
}

export default function useThemeMode() {
  const [theme, setTheme] = useState(getStoredTheme)

  useEffect(() => {
    applyTheme(theme)
    window.localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }

  return { theme, setTheme, toggleTheme }
}

export { animateThemeChange }
