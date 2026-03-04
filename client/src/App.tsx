import type { FormEvent } from 'react'
import { useState } from 'react'
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google'
import './App.css'

type AuthMode = 'signin' | 'signup'

type UserPayload = {
  id: string
  email: string
  username: string
  balance: number
}

type AuthResponse = {
  token: string
  user: UserPayload
}

const API_BASE = 'http://localhost:4000'
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

function AppInner() {
  const [mode, setMode] = useState<AuthMode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<UserPayload | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const endpoint =
        mode === 'signup' ? '/api/auth/register' : '/api/auth/login'
      const body =
        mode === 'signup'
          ? { email, password, username }
          : { email, password }

      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || 'Erreur inconnue')
      }

      const data: AuthResponse = await res.json()
      localStorage.setItem('casitom_token', data.token)
      setUser(data.user)
    } catch (err: any) {
      setError(err.message || 'Erreur réseau')
    } finally {
      setLoading(false)
    }
  }

  if (user) {
    return (
      <div className="app-root">
        <div className="app-shell">
          <header className="app-header">
            <div className="brand">
              <div className="brand-icon">CT</div>
              <div className="brand-text">
                <span className="brand-name">CasiTom</span>
                <span className="brand-sub">Premium Casino</span>
              </div>
            </div>
            <div className="balance-pill">
              <span className="balance-label">Balance</span>
              <span className="balance-value">
                {user.balance.toFixed(2)} IC
              </span>
            </div>
          </header>
          <main className="app-main">
            <div className="welcome-card">
              <h1>Bienvenue, {user.username}</h1>
              <p>La vraie page casino arrivera juste après cette étape.</p>
            </div>
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="app-root">
      <div className="glow-orb" />
      <div className="auth-shell">
        <div className="auth-brand">
          <div className="brand-icon">CT</div>
          <div className="brand-title">CasiTom</div>
          <div className="brand-subtitle">Premium Casino Experience</div>
        </div>

        <div className="auth-card">
          <div className="auth-tabs">
            <button
              className={`auth-tab ${mode === 'signin' ? 'active' : ''}`}
              onClick={() => setMode('signin')}
            >
              Sign In
            </button>
            <button
              className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
              onClick={() => setMode('signup')}
            >
              Sign Up
            </button>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <div className="field">
                <label>Pseudo</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="primeVertox"
                  required
                />
              </div>
            )}
            <div className="field">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <div className="field">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {error && <div className="error-banner">{error}</div>}

            <button className="primary-button" type="submit" disabled={loading}>
              {loading
                ? 'Chargement...'
                : mode === 'signup'
                ? 'Create account'
                : 'Sign In'}
            </button>

            <div className="divider">
              <span>OR CONTINUE WITH</span>
            </div>

            {GOOGLE_CLIENT_ID ? (
              <div className="google-wrapper">
                <GoogleLogin
                  onSuccess={async (credentialResponse) => {
                    try {
                      const idToken = credentialResponse.credential
                      if (!idToken) throw new Error('Token Google manquant')
                      const res = await fetch(`${API_BASE}/api/auth/google`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ idToken }),
                      })
                      if (!res.ok) {
                        const data = await res.json().catch(() => ({}))
                        throw new Error(data.message || 'Erreur Google')
                      }
                      const data: AuthResponse = await res.json()
                      localStorage.setItem('casitom_token', data.token)
                      setUser(data.user)
                    } catch (err: any) {
                      setError(err.message || 'Erreur Google')
                    }
                  }}
                  onError={() => {
                    setError('Connexion Google échouée.')
                  }}
                />
              </div>
            ) : (
              <button
                className="google-button"
                type="button"
                onClick={() =>
                  alert(
                    'Configure VITE_GOOGLE_CLIENT_ID pour activer Google Login.'
                  )
                }
              >
                Continue with Google
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}

function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID || 'placeholder'}>
      <AppInner />
    </GoogleOAuthProvider>
  )
}

export default App
