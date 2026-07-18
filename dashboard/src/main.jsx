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

const storedTheme = getStoredTheme()
document.documentElement.dataset.theme = storedTheme === 'dark' ? 'dark' : 'light'
document.documentElement.style.colorScheme = document.documentElement.dataset.theme

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
)
