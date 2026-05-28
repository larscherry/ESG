import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-white">
          <div className="max-w-md text-center p-8">
            <div className="text-6xl mb-4">⚠</div>
            <h1 className="text-xl font-bold text-[#1a1a1a] mb-2">Something went wrong</h1>
            <p className="text-sm text-[#6b7280] mb-6">{this.state.error.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 text-sm font-medium bg-[#1ea97c] text-white rounded-lg hover:bg-[#178f69] transition-colors"
            >
              Reload page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
