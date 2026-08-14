import { Link } from 'react-router-dom'

// Used on the public site, the login pages and the dashboard.
export default function AppFooter({ className = '', variant = 'app' }) {
  const year = new Date().getFullYear()
  const base = variant === 'vivid' ? 'vivid-footer' : 'app-footer'

  return (
    <footer className={`${base} ${className}`.trim()}>
      <span>Tago</span>
      <nav className="app-footer-links" aria-label="Footer">
        <Link to="/privacy">Privacy Policy</Link>
        <Link to="/documentation">Documentation</Link>
      </nav>
      <span>&copy; {year} Tago. Secure attendance tracking for schools.</span>
    </footer>
  )
}
