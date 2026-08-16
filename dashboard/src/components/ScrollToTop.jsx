import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// Navigating between routes keeps the previous scroll position by default,
// which reads as broken on long pages like documentation/privacy. Hash
// links (in-page anchors) are left alone so PublicHomePage's own
// scrollIntoView still works.
export default function ScrollToTop() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (hash) return
    window.scrollTo(0, 0)
  }, [pathname, hash])

  return null
}
