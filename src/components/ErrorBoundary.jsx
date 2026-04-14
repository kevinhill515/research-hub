import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, border: '1px solid #fee2e2', borderRadius: 8, background: '#fff5f5', margin: 8 }}>
          <div style={{ fontWeight: 600, color: '#991b1b', marginBottom: 8 }}>Something went wrong</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>{this.state.error?.message}</div>
          <button onClick={() => this.setState({ hasError: false, error: null })} style={{ fontSize: 12, padding: '6px 14px' }}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
