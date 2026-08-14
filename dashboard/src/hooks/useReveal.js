import { useEffect, useRef } from 'react'

// One observer shared by every reveal on the page, instead of one each.
let observer = null

function getObserver() {
  if (observer) return observer

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.dataset.revealed = 'true'
        // Nothing re-hides, so stop watching straight away.
        observer.unobserve(entry.target)
      }
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.05 },
  )

  return observer
}

export default function useReveal() {
  const ref = useRef(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return undefined

    // Reduced motion (or no observer support): just show it.
    const reduced =
      typeof window.matchMedia !== 'function' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduced || typeof IntersectionObserver === 'undefined') {
      node.dataset.revealed = 'true'
      return undefined
    }

    const obs = getObserver()
    obs.observe(node)

    return () => obs.unobserve(node)
  }, [])

  return ref
}
