import axios from 'axios'
import { useEffect, useState } from 'react'
import AuthPage from './features/auth/pages/AuthPage'
import DashboardPage from './features/dashboard/pages/DashboardPage'
import { hasLocalWorkspace } from './features/wallets/lib/walletSync'
import { api } from './lib/api/client'
import { clearVerifiedUser, getLastVerifiedUser, rememberVerifiedUser } from './lib/offlineSession'

export default function App() {
  const [signedIn, setSignedIn] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')
  const [authMode, setAuthMode] = useState<'login' | 'register'>(() => window.location.pathname === '/sign-up' ? 'register' : 'login')
  const [registrationNotice, setRegistrationNotice] = useState(false)

  useEffect(() => {
    const onPopState = () => setAuthMode(window.location.pathname === '/sign-up' ? 'register' : 'login')
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    if (!registrationNotice) return
    const timeout = window.setTimeout(() => setRegistrationNotice(false), 6000)
    return () => window.clearTimeout(timeout)
  }, [registrationNotice])

  useEffect(() => {
    let active = true

    async function checkSession() {
      try {
        const response = await api.get('/api/user')
        const nextUserId = response.data.id

        if (typeof nextUserId !== 'string') throw new Error('Session did not include a user ID.')

        if (active) {
          rememberVerifiedUser(nextUserId)
          setUserId(nextUserId)
          setSignedIn(true)
        }
      } catch (error) {
        if (!active) return

        if (axios.isAxiosError(error) && error.response?.status === 401) {
          clearVerifiedUser()
          if (active) {
            setUserId(null)
            setSignedIn(false)
          }
        } else if (!axios.isAxiosError(error) || error.response) {
          setError('Unable to verify your session. Please try signing in again.')
        } else if (window.location.pathname === '/sign-up') {
          setError('Creating an account requires an internet connection. Reconnect to continue.')
        } else {
          const cachedUserId = getLastVerifiedUser()
          if (cachedUserId) {
            try {
              if (await hasLocalWorkspace(cachedUserId) && active) {
                setUserId(cachedUserId)
                setSignedIn(true)
              } else if (active) {
                setError('You are offline and no local workspace is available.')
              }
            } catch {
              if (active) setError('Unable to open your local workspace.')
            }
          } else if (active) {
            setError('Sign in once while online before using the app offline.')
          }
        }
      } finally {
        if (active) setChecking(false)
      }
    }

    void checkSession()

    return () => {
      active = false
    }
  }, [])

  if (checking) {
    return <main className="dashboard">Checking your session…</main>
  }

  return signedIn
    ? <>
        {userId && <DashboardPage userId={userId} registrationNotice={registrationNotice} onViewChange={() => undefined} onLogout={() => {
          setUserId(null)
          setSignedIn(false)
          setRegistrationNotice(false)
          setError('')
          setAuthMode('login')
          window.history.replaceState(null, '', '/sign-in')
        }} />}
      </>
    : <AuthPage key={authMode} mode={authMode} sessionError={error} onModeChange={(mode) => {
        setAuthMode(mode)
        setError('')
        window.history.pushState(null, '', mode === 'register' ? '/sign-up' : '/sign-in')
      }} onAuthenticated={(nextUserId, registered) => {
        setUserId(nextUserId)
        setSignedIn(true)
        setError('')
        setRegistrationNotice(registered)
        window.history.replaceState(null, '', '/')
      }} />
}
