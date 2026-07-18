import { Component } from 'react'

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ui] Unhandled render error:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main className="app-failure" role="alert">
        <section className="app-failure-panel">
          <p className="app-failure-kicker">Something went wrong</p>
          <h1>Tago could not finish loading this screen.</h1>
          <p>
            Refresh the page and try again. If it keeps happening, sign in again
            or ask an administrator to check the server logs.
          </p>

          {import.meta.env.DEV && (
            <pre className="app-failure-details">{this.state.error.message}</pre>
          )}

          <div className="app-failure-actions">
            <button type="button" onClick={() => window.location.reload()}>
              Refresh
            </button>
            <a className="secondary-button" href="/login/student">
              Go to sign in
            </a>
          </div>
        </section>
      </main>
    )
  }
}
