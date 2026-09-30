import axios from 'axios'
import { useState } from 'react'
import { api } from '../../../lib/api/client'
import { pendingOperationCount } from '../../wallets/lib/walletSync'
import { clearVerifiedUser } from '../../../lib/offlineSession'

type LogoutButtonProps = {
  userId: string
  onLogout: () => void
  className?: string
}

export default function LogoutButton({ userId, onLogout, className = '' }: LogoutButtonProps) {
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleLogout() {
    setError('')

    try {
      const pendingCount = await pendingOperationCount(userId)
      if (pendingCount > 0 && !window.confirm(`${pendingCount} change${pendingCount === 1 ? '' : 's'} still need to sync. Sign out and keep them on this device?`)) {
        return
      }
    } catch {
      setError('Unable to check pending changes. Please try again.')
      return
    }

    setSubmitting(true)

    try {
      await api.get('/sanctum/csrf-cookie')
      await api.post('/logout')
      clearVerifiedUser()
      onLogout()
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        clearVerifiedUser()
        onLogout()
      } else {
        setError('Unable to sign out. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={className}>
      <button
        className="logout-button"
        type="button"
        onClick={handleLogout}
        disabled={submitting}
      >
        {submitting ? 'Signing out…' : 'Sign out'}
      </button>

      {error && <p className="logout-error" role="alert">{error}</p>}
    </div>
  )
}
