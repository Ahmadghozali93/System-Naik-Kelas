import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Crash tertangkap:', error, info);
  }

  render() {
    if (this.state.hasError) {
      const err = this.state.error;
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#fef2f2', padding: '1.5rem', boxSizing: 'border-box'
        }}>
          <div style={{
            background: '#fff', borderRadius: '1rem', padding: '2rem', maxWidth: 480, width: '100%',
            boxShadow: '0 4px 24px rgba(0,0,0,0.10)', border: '1px solid #fecaca'
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>⚠️</div>
            <h2 style={{ margin: '0 0 0.5rem', color: '#b91c1c', fontWeight: 700, fontSize: '1.15rem' }}>
              Aplikasi mengalami error
            </h2>
            <p style={{ color: '#374151', marginBottom: '1rem', fontSize: '0.9rem', lineHeight: 1.5 }}>
              Terjadi kesalahan tak terduga. Salin pesan di bawah ini dan kirimkan ke tim teknis.
            </p>

            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem',
              padding: '0.85rem 1rem', marginBottom: '1.25rem', wordBreak: 'break-word'
            }}>
              <div style={{ fontWeight: 700, color: '#b91c1c', fontSize: '0.82rem', marginBottom: '0.25rem' }}>
                {err?.name || 'Error'}
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#7f1d1d', lineHeight: 1.5 }}>
                {err?.message || String(err)}
              </div>
            </div>

            <button
              onClick={() => window.location.reload()}
              style={{
                width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: 'none',
                background: '#b91c1c', color: '#fff', fontWeight: 700, fontSize: '0.95rem',
                cursor: 'pointer', fontFamily: 'inherit'
              }}
            >
              🔄 Muat Ulang Halaman
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
