import { useState } from 'react'
import AuthPage from './AuthPage'
import type { AuthMode } from './AuthPage'

type LoginPageProps = {
  onLogin: (userId: string) => void
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [mode, setMode] = useState<AuthMode>('login')
  return <AuthPage mode={mode} onModeChange={setMode} onAuthenticated={onLogin} />
}
