'use client'

import { useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'

type Mode = 'login' | 'signup'

export function AuthForm({ mode }: { mode: Mode }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setLoading(true)
    const supabase = createClient()
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) setError(error.message)
        else window.location.href = '/'
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) setError(error.message)
        else setMessage('Check your email to confirm your account.')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleOAuth(provider: 'google' | 'github') {
    setError(null)
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <div className="auth-form">
      <form onSubmit={handleSubmit} className="auth-form__fields">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="auth-form__input"
          aria-label="Email"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="auth-form__input"
          aria-label="Password"
        />
        {error && <p className="auth-form__error">{error}</p>}
        {message && <p className="auth-form__message">{message}</p>}
        <button type="submit" disabled={loading} className="auth-form__btn auth-form__btn--primary">
          {loading ? 'Loading…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <div className="auth-form__divider">or</div>

      <div className="auth-form__oauth">
        <button type="button" className="auth-form__btn auth-form__btn--oauth" onClick={() => handleOAuth('google')}>
          Continue with Google
        </button>
        <button type="button" className="auth-form__btn auth-form__btn--oauth" onClick={() => handleOAuth('github')}>
          Continue with GitHub
        </button>
      </div>

      <p className="auth-form__switch">
        {mode === 'login' ? (
          <>No account? <a href="/auth/signup">Sign up</a></>
        ) : (
          <>Have an account? <a href="/auth/login">Sign in</a></>
        )}
      </p>
    </div>
  )
}
