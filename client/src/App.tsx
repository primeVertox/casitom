import type { FormEvent } from 'react'
import { useState } from 'react'
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

type GameId =
  | 'home'
  | 'crash'
  | 'dice'
  | 'mines'
  | 'roulette'
  | 'stonks'
  | 'crossy'
  | 'tower'
  | 'blackjack'
  | 'case-battle'

type GameResult = {
  summary: string
}

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000'

function App() {
  const [mode, setMode] = useState<AuthMode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<UserPayload | null>(null)
  const [token, setToken] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('casitom_token') : null,
  )
  const [selectedGame, setSelectedGame] = useState<GameId>('home')
  const [wager, setWager] = useState<number>(10)
  const [gameError, setGameError] = useState<string | null>(null)
  const [gameLoading, setGameLoading] = useState(false)
  const [lastResult, setLastResult] = useState<GameResult | null>(null)

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
      setToken(data.token)
      setUser(data.user)
    } catch (err: any) {
      setError(err.message || 'Erreur réseau')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('casitom_token')
    setUser(null)
    setToken(null)
    setSelectedGame('home')
  }

  const handlePlay = async (game: GameId, extraBody: Record<string, unknown> = {}) => {
    if (!token || !user) {
      setGameError('Non connecté.')
      return
    }
    if (!wager || wager <= 0) {
      setGameError('Entre une mise valide.')
      return
    }

    setGameError(null)
    setGameLoading(true)

    try {
      const res = await fetch(`${API_BASE}/api/games/${game}/play`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ wager, ...extraBody }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || 'Erreur jeu')
      }

      const data = await res.json()
      setUser((prev) =>
        prev ? { ...prev, balance: data.balance ?? prev.balance } : prev,
      )
      if (data.summary) {
        setLastResult({ summary: data.summary })
      }
    } catch (err: any) {
      setGameError(err.message || 'Erreur jeu')
    } finally {
      setGameLoading(false)
    }
  }

  if (user) {
    return (
      <div className="app-root">
        <div className="app-shell">
          <div className="casino-layout">
            <aside className="sidebar">
              <div className="sidebar-header">
                <div className="brand-icon">CT</div>
                <div className="sidebar-brand-text">
                  <span className="brand-name">CasiTom</span>
                  <span className="brand-sub">Premium Casino</span>
                </div>
              </div>
              <nav className="nav">
                <button
                  className={`nav-item ${selectedGame === 'home' ? 'active' : ''}`}
                  onClick={() => setSelectedGame('home')}
                >
                  Home
                </button>
                <button
                  className={`nav-item ${selectedGame === 'crash' ? 'active' : ''}`}
                  onClick={() => setSelectedGame('crash')}
                >
                  Crash
                </button>
                <button
                  className={`nav-item ${selectedGame === 'dice' ? 'active' : ''}`}
                  onClick={() => setSelectedGame('dice')}
                >
                  Dice
                </button>
                <button
                  className={`nav-item ${selectedGame === 'mines' ? 'active' : ''}`}
                  onClick={() => setSelectedGame('mines')}
                >
                  Mines
                </button>
                <button
                  className={`nav-item ${selectedGame === 'roulette' ? 'active' : ''}`}
                  onClick={() => setSelectedGame('roulette')}
                >
                  Roulette
                </button>
                <button
                  className={`nav-item ${selectedGame === 'stonks' ? 'active' : ''}`}
                  onClick={() => setSelectedGame('stonks')}
                >
                  Stonks
                </button>
                <button
                  className={`nav-item ${selectedGame === 'crossy' ? 'active' : ''}`}
                  onClick={() => setSelectedGame('crossy')}
                >
                  Crossy
                </button>
                <button
                  className={`nav-item ${selectedGame === 'tower' ? 'active' : ''}`}
                  onClick={() => setSelectedGame('tower')}
                >
                  Tower
                </button>
                <button
                  className={`nav-item ${selectedGame === 'blackjack' ? 'active' : ''}`}
                  onClick={() => setSelectedGame('blackjack')}
                >
                  Blackjack
                </button>
                <button
                  className={`nav-item ${selectedGame === 'case-battle' ? 'active' : ''}`}
                  onClick={() => setSelectedGame('case-battle')}
                >
                  Case Battle
                </button>
              </nav>
              <button className="logout-button" onClick={handleLogout}>
                Sign Out
              </button>
            </aside>

            <main className="casino-main">
              <header className="casino-header">
                <div className="casino-welcome">
                  <div className="casino-title">
                    Bienvenue, {user.username}
                  </div>
                  <div className="casino-subtitle">
                    Choisis un mode de jeu et parie tes IchalaCoins.
                  </div>
                </div>
                <div className="balance-pill">
                  <span className="balance-label">Balance</span>
                  <span className="balance-value">
                    {user.balance.toFixed(2)} IC
                  </span>
                </div>
              </header>

              <section className="bet-panel">
                <div className="field">
                  <label>Mise (IC)</label>
                  <input
                    type="number"
                    min={1}
                    value={wager}
                    onChange={(e) => setWager(Number(e.target.value))}
                  />
                </div>
                {gameError && <div className="error-banner">{gameError}</div>}
              </section>

              <section className="game-panel">
                {selectedGame === 'home' && (
                  <div className="welcome-card">
                    <h1>Casino Games</h1>
                    <p>
                      Sélectionne un jeu dans la colonne de gauche pour commencer
                      à jouer avec tes IchalaCoins.
                    </p>
                  </div>
                )}
                {selectedGame === 'crash' && (
                  <div className="game-card">
                    <h2>Crash</h2>
                    <p>Fais décoller la fusée, encaisse avant le crash.</p>
                    <button
                      className="primary-button"
                      disabled={gameLoading}
                      onClick={() => handlePlay('crash')}
                    >
                      {gameLoading ? 'En cours...' : 'Lancer Crash'}
                    </button>
                  </div>
                )}
                {selectedGame === 'dice' && (
                  <div className="game-card">
                    <h2>Dice</h2>
                    <p>Lance le dé, plus de 50 pour gagner.</p>
                    <button
                      className="primary-button"
                      disabled={gameLoading}
                      onClick={() => handlePlay('dice')}
                    >
                      {gameLoading ? 'En cours...' : 'Lancer Dice'}
                    </button>
                  </div>
                )}
                {selectedGame === 'mines' && (
                  <div className="game-card">
                    <h2>Mines</h2>
                    <p>Évite les mines pour multiplier ta mise.</p>
                    <button
                      className="primary-button"
                      disabled={gameLoading}
                      onClick={() => handlePlay('mines')}
                    >
                      {gameLoading ? 'En cours...' : 'Jouer Mines'}
                    </button>
                  </div>
                )}
                {selectedGame === 'roulette' && (
                  <div className="game-card">
                    <h2>Roulette</h2>
                    <p>Mise par défaut sur le rouge.</p>
                    <button
                      className="primary-button"
                      disabled={gameLoading}
                      onClick={() => handlePlay('roulette', { bet: 'red' })}
                    >
                      {gameLoading ? 'En cours...' : 'Tourner la roue'}
                    </button>
                  </div>
                )}
                {selectedGame === 'stonks' && (
                  <div className="game-card">
                    <h2>Stonks</h2>
                    <p>Le marché monte ou descend, à toi de tenter.</p>
                    <button
                      className="primary-button"
                      disabled={gameLoading}
                      onClick={() => handlePlay('stonks')}
                    >
                      {gameLoading ? 'En cours...' : 'Trader'}
                    </button>
                  </div>
                )}
                {selectedGame === 'crossy' && (
                  <div className="game-card">
                    <h2>Crossy</h2>
                    <p>Traverse la route sans te faire écraser.</p>
                    <button
                      className="primary-button"
                      disabled={gameLoading}
                      onClick={() => handlePlay('crossy')}
                    >
                      {gameLoading ? 'En cours...' : 'Traverser'}
                    </button>
                  </div>
                )}
                {selectedGame === 'tower' && (
                  <div className="game-card">
                    <h2>Tower</h2>
                    <p>Monte le plus haut possible avant la chute.</p>
                    <button
                      className="primary-button"
                      disabled={gameLoading}
                      onClick={() => handlePlay('tower')}
                    >
                      {gameLoading ? 'En cours...' : 'Grimper'}
                    </button>
                  </div>
                )}
                {selectedGame === 'blackjack' && (
                  <div className="game-card">
                    <h2>Blackjack</h2>
                    <p>Round rapide avec résultat instantané.</p>
                    <button
                      className="primary-button"
                      disabled={gameLoading}
                      onClick={() => handlePlay('blackjack')}
                    >
                      {gameLoading ? 'En cours...' : 'Jouer Blackjack'}
                    </button>
                  </div>
                )}
                {selectedGame === 'case-battle' && (
                  <div className="game-card">
                    <h2>Case Battle</h2>
                    <p>Ouvre un case, chance de jackpot énorme.</p>
                    <button
                      className="primary-button"
                      disabled={gameLoading}
                      onClick={() => handlePlay('case-battle')}
                    >
                      {gameLoading ? 'En cours...' : 'Ouvrir un case'}
                    </button>
                  </div>
                )}

                {lastResult && (
                  <div className="result-banner">
                    {lastResult.summary}
                  </div>
                )}
              </section>
            </main>
          </div>
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

          </form>
        </div>
      </div>
    </div>
  )
}

export default App
