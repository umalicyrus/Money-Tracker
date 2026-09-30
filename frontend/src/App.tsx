import axios from 'axios'
import { useEffect, useState } from 'react'
import LoginPage from './features/auth/pages/LoginPage'
import DashboardPage from './features/dashboard/pages/DashboardPage'
import { hasLocalWorkspace } from './features/wallets/lib/walletSync'
import { api } from './lib/api/client'
import { clearVerifiedUser, getLastVerifiedUser, rememberVerifiedUser } from './lib/offlineSession'

export default function App() {
  const [signedIn, setSignedIn] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')

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
          setError('Unable to connect. Check the servers, then refresh.')
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

  if (error) {
    return <main className="dashboard" role="alert">{error}</main>
  }

  return signedIn
    ? <>
        {userId && <DashboardPage userId={userId} onViewChange={() => undefined} onLogout={() => {
          setUserId(null)
          setSignedIn(false)
        }} />}
      </>
    : <LoginPage onLogin={(nextUserId) => {
        setUserId(nextUserId)
        setSignedIn(true)
      }} />
}
