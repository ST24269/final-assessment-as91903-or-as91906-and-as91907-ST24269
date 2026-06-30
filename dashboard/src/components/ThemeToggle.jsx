import { useRef } from 'react'
import { Moon, Sun } from 'lucide-react'
import useThemeMode, { animateThemeChange } from '../hooks/useThemeMode'

export function ThemeTogglerButton({
  modes = ['light', 'dark'],
  direction = 'ltr',
  onImmediateChange,
  className = '',
  ...props
}) {
  const buttonRef = useRef(null)
  const { theme, setTheme } = useThemeMode()
  const currentIndex = Math.max(0, modes.indexOf(theme))
  const nextTheme = modes[(currentIndex + 1) % modes.length] || 'dark'
  const isDark = theme === 'dark'

  const handleClick = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    const origin = rect
      ? { x: rect.left + (rect.width / 2), y: rect.top + (rect.height / 2) }
      : { x: window.innerWidth / 2, y: window.innerHeight / 2 }

    animateThemeChange(nextTheme, origin)
    setTheme(nextTheme)
    onImmediateChange?.(nextTheme)
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      className={`theme-toggle theme-toggle-${direction} ${className}`.trim()}
      onClick={handleClick}
      aria-label={`Switch to ${nextTheme} mode`}
      title={`Switch to ${nextTheme} mode`}
      data-theme-state={theme}
      {...props}
    >
      <Moon className="theme-icon theme-icon-moon" size={18} strokeWidth={2.3} />
      <Sun className="theme-icon theme-icon-sun" size={18} strokeWidth={2.3} />
      <span className="sr-only">{isDark ? 'Dark mode' : 'Light mode'}</span>
    </button>
  )
}

export default ThemeTogglerButton
