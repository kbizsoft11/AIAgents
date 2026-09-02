import { FormEvent, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../services/authService'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (!supabase || !isSupabaseConfigured) {
      setError('Supabase is not configured. Add your project URL and anon key to .env.')
      return
    }
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }

    setIsSubmitting(true)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setIsSubmitting(false)
    if (signInError) setError('Unable to sign in. Check your email and password.')
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="auth-brand"><span className="auth-logo">ϟ</span><strong>ColixAI</strong></div>
        <div className="auth-heading">
          <h1>Welcome back</h1>
          <p>Sign in to manage your shortcuts.</p>
        </div>
        <form onSubmit={handleSubmit} className="auth-form">
          <label>Email<input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" /></label>
          <label>Password<input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" autoComplete="current-password" /></label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="button button-primary auth-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Signing in...' : 'Sign in'}</button>
        </form>
        <p className="auth-footer">Use the account created in Supabase Authentication.</p>
      </section>
    </main>
  )
}
