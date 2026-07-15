import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            height: '100%',
            padding: 32,
            backgroundColor: '#1e1e1e',
            color: '#cccccc',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <h2 style={{ color: '#f87171', marginTop: 0 }}>エラーが発生しました</h2>
          <pre
            style={{
              padding: 16,
              backgroundColor: '#252526',
              borderRadius: 8,
              overflow: 'auto',
              fontSize: 13,
            }}
          >
            {this.state.error.message}
          </pre>
          <button
            type="button"
            style={{
              marginTop: 16,
              padding: '8px 16px',
              backgroundColor: '#0078d4',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
            }}
            onClick={() => this.setState({ error: null })}
          >
            再試行
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function hasCodexApi(): boolean {
  return typeof window !== 'undefined' && window.codex?.invoke != null
}

export { hasCodexApi }
