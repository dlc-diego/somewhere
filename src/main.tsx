import React, { Component, type ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { PlayerProvider } from './lib/PlayerProvider'
import './styles.css'

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (this.state.failed)
      return (
        <main className="fatal-error">
          <h1>A little detour.</h1>
          <p>Something interrupted the game. Your saved round is safe.</p>
          <button className="primary" onClick={() => window.location.reload()}>
            Reload the game
          </button>
        </main>
      )
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <PlayerProvider>
        <App />
      </PlayerProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
