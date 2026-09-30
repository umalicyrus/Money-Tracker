import axios from 'axios'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../../../lib/api/client'
import { rememberVerifiedUser } from '../../../lib/offlineSession'

type LoginPageProps = {
  onLogin: (userId: string) => void
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      await api.get('/sanctum/csrf-cookie')

      await api.post('/login', {
        email,
        password,
      })

      // Confirm the session works on a protected API route.
      const response = await api.get('/api/user')
      const userId = response.data.id
      if (typeof userId !== 'string') throw new Error('Session did not include a user ID.')

      setPassword('')
      rememberVerifiedUser(userId)
      onLogin(userId)
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status

        if (status === 422) {
          setError('Check your email and password.')
        } else if (status === 429) {
          setError('Too many attempts. Wait a minute and try again.')
        } else if (status === 419) {
          setError('Your session expired. Please try again.')
        } else {
          setError('Unable to sign in. Check that both servers are running.')
        }
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="dashboard">
      <p className="app-name">Money Tracker</p>
      <h1>Welcome back</h1>
      <p>Sign in to manage your money.</p>

      <form className="login-form" onSubmit={handleSubmit}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />

        {error && <p role="alert">{error}</p>}

        <button type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}