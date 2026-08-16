import { useState } from 'react'
import AppealsPanel from '../AppealsPanel'

export default function AppealsManager() {
  const [view, setView] = useState('open')

  return (
    <div className="appeals-manager">
      <div className="appeals-view-tabs" role="tablist" aria-label="Appeals view">
        <button type="button" className={view === 'open' ? 'is-active' : ''} onClick={() => setView('open')}>
          Today's appeals
        </button>
        <button type="button" className={view === 'history' ? 'is-active' : ''} onClick={() => setView('history')}>
          Appeal history
        </button>
      </div>

      {view === 'open' ? (
        <AppealsPanel mode="admin" compact hideResolved />
      ) : (
        <AppealsPanel mode="admin" compact historyOnly />
      )}
    </div>
  )
}
