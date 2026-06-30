import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

const storedTheme = window.localStorage.getItem('attendrfid-theme')
document.documentElement.dataset.theme = storedTheme === 'light' ? 'light' : 'dark'
document.documentElement.style.colorScheme = document.documentElement.dataset.theme

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
