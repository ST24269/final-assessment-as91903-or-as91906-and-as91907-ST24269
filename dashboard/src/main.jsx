import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import AppErrorBoundary from './components/AppErrorBoundary.jsx'
import './index.css'

function getStoredTheme() {
  try {
    return window.localStorage.getItem('tago-theme')
  } catch {
    return null
  }
}

function getInitialTheme() {
  const stored = getStoredTheme()
  if (stored === 'dark' || stored === 'light') return stored

  // No explicit choice saved yet — follow the OS/browser preference instead
  // of always forcing light mode.
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

const initialTheme = getInitialTheme()
document.documentElement.dataset.theme = initialTheme
document.documentElement.style.colorScheme = initialTheme

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
)