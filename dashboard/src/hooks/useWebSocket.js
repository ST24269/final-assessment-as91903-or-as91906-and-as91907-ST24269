import { useEffect, useState } from 'react'

export function useWebSocket(url) {
  const [lastScan, setLastScan] = useState(null)

  useEffect(() => {
    const ws = new WebSocket(url)
    ws.onmessage = (e) => setLastScan(JSON.parse(e.data))
    return () => ws.close()
  }, [url])

  return lastScan
}