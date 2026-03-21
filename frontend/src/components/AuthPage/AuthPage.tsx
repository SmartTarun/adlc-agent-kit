// Agent: Rohan | Sprint: 01 | Date: 2026-03-16
import { useState, FormEvent } from 'react'
import { useAuth } from '../../context/AuthContext'
import { Lock, User, Zap } from 'lucide-react'
import styles from './AuthPage.module.css'

export default function AuthPage() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const ok = await login(username.trim(), password)
      if (!ok) setError('Invalid username or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <Zap size={28} color="var(--color-primary-400)" aria-hidden="true" />
          <span className={styles.wordmark}>Infraviz</span>
        </div>

        <h1 className={styles.title}>Sign in</h1>
        <p className={styles.subtitle}>AI-powered IaC generation &amp; cost anomaly detection</p>

        <form onSubmit={(e) => void handleSubmit(e)} className={styles.form} noValidate>
          <div className={styles.field}>
            <label htmlFor="username" className={styles.label}>Username</label>
            <div className={styles.inputWrap}>
              <User size={14} className={styles.inputIcon} aria-hidden="true" />
              <input
                id="username"
                type="text"
                className={styles.input}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                autoComplete="username"
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="password" className={styles.label}>Password</label>
            <div className={styles.inputWrap}>
              <Lock size={14} className={styles.inputIcon} aria-hidden="true" />
              <input
                id="password"
                type="password"
                className={styles.input}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={loading}
                required
              />
            </div>
          </div>

          {error && (
            <p className={styles.error} role="alert">{error}</p>
          )}

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={loading || !username || !password}
            aria-busy={loading}
          >
            {loading ? <span className={styles.spinner} aria-hidden="true" /> : null}
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className={styles.hint}>
          Sprint-01 credentials: <code>admin / infraviz2026</code>
        </p>
      </div>
    </div>
  )
}
