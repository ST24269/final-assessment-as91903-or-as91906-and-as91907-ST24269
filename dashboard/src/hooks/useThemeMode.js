import { useEffect, useState } from 'react'

const THEME_KEY = 'tago-theme'

function getStoredTheme() {
  if (typeof window === 'undefined') return 'light'

  try {
    return window.localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
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
        duration: 240,
        easing: 'ease-out',
        pseudoElement: '::view-transition-new(root)',
      },
    )
  })
}

export default function useThemeMode() {
  const [theme, setTheme] = useState(getStoredTheme)

  useEffect(() => {
    applyTheme(theme)

    try {
      window.localStorage.setItem(THEME_KEY, theme)
    } catch {
      // Theme still applies for this page load even when storage is blocked.
    }
  }, [theme])

  const toggleTheme = () => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }

  return { theme, setTheme, toggleTheme }
}

export { animateThemeChange }
