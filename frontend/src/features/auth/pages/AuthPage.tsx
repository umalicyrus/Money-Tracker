import axios from 'axios'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent, InputHTMLAttributes } from 'react'
import AppIcon from '../../../components/AppIcon'
import BrandLogo from '../../../components/BrandLogo'
import { api } from '../../../lib/api/client'
import { rememberVerifiedUser } from '../../../lib/offlineSession'
import '../auth.css'

export type AuthMode = 'login' | 'register'

type AuthPageProps = {
  mode: AuthMode
  onModeChange: (mode: AuthMode) => void
  onAuthenticated: (userId: string, registered: boolean) => void
  sessionError?: string
}

type FieldName = 'name' | 'email' | 'password' | 'password_confirmation'
type FieldErrors = Partial<Record<FieldName, string>>

type AuthFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  icon: 'person' | 'mail' | 'lock'
  error?: string
  passwordField?: boolean
}

function AuthField({ label, icon, error, passwordField = false, id, ...inputProps }: AuthFieldProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className={`auth-input-wrap${error ? ' auth-input-invalid' : ''}`}>
        <AppIcon name={icon} className="auth-field-icon" />
        <input
          {...inputProps}
          id={id}
          type={passwordField ? (visible ? 'text' : 'password') : inputProps.type}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        {passwordField && (
          <button
            className="auth-password-toggle"
            type="button"
            aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
            aria-pressed={visible}
            aria-controls={id}
            onClick={() => setVisible((current) => !current)}
          >
            <AppIcon name={visible ? 'eye-off' : 'eye'} />
          </button>
        )}
      </div>
      {error && <p className="auth-field-error" id={`${id}-error`}>{error}</p>}
    </div>
  )
}

function validationErrors(value: unknown): FieldErrors {
  if (!value || typeof value !== 'object') return {}

  const result: FieldErrors = {}
  const fields: FieldName[] = ['name', 'email', 'password', 'password_confirmation']
  for (const field of fields) {
    const messages = (value as Record<string, unknown>)[field]
    if (Array.isArray(messages) && typeof messages[0] === 'string') result[field] = messages[0]
  }
  return result
}

export default function AuthPage({ mode, onModeChange, onAuthenticated, sessionError }: AuthPageProps) {
  // A keyed form also clears passwords when the parent changes the view through browser history.
  return <AuthForm key={mode} mode={mode} onModeChange={onModeChange} onAuthenticated={onAuthenticated} sessionError={sessionError} />
}

function AuthForm({ mode, onModeChange, onAuthenticated, sessionError }: AuthPageProps) {
  const registering = mode === 'register'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [loading, setLoading] = useState(false)
  const [mustSignIn, setMustSignIn] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const submitting = useRef(false)
  const mounted = useRef(true)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    mounted.current = true
    const updateOnline = () => setOnline(navigator.onLine)
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    return () => {
      mounted.current = false
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
    }
  }, [])

  function clearFieldError(field: FieldName) {
    setFieldErrors((previous) => ({ ...previous, [field]: undefined }))
  }

  function showFieldErrors(errors: FieldErrors) {
    setFieldErrors(errors)
    const firstField = (['name', 'email', 'password', 'password_confirmation'] as const).find((field) => errors[field])
    if (firstField) {
      requestAnimationFrame(() => {
        if (mounted.current) formRef.current?.querySelector<HTMLInputElement>(`[name="${firstField}"]`)?.focus()
      })
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current || mustSignIn) return
    setError('')
    setFieldErrors({})

    if (!navigator.onLine) {
      setError(registering
        ? 'You are offline. Connect to the internet to create and save your account. Your form is still available.'
        : 'You are offline. Connect to the internet to sign in.')
      return
    }

    if (registering && password !== confirmation) {
      showFieldErrors({ password_confirmation: 'The password confirmation does not match.' })
      return
    }

    submitting.current = true
    setLoading(true)
    let stage: 'csrf' | 'submit' | 'verify' | 'remember' = 'csrf'

    try {
      await api.get('/sanctum/csrf-cookie')
      if (!mounted.current) return

      stage = 'submit'
      const result = registering
        ? await api.post('/register', { name, email, password, password_confirmation: confirmation })
        : await api.post('/login', { email, password })
      if (!mounted.current) return

      stage = 'verify'
      const registeredUserId: unknown = registering ? result.data?.user?.id : undefined
      if (registering && (typeof registeredUserId !== 'string' || !registeredUserId)) {
        throw new Error('Registration did not include the new user ID.')
      }

      const session = await api.get('/api/user')
      if (!mounted.current) return
      const verifiedUserId: unknown = session.data?.id
      if (typeof verifiedUserId !== 'string' || !verifiedUserId || (registering && verifiedUserId !== registeredUserId)) {
        throw new Error('The authenticated session did not match the registered account.')
      }

      stage = 'remember'
      rememberVerifiedUser(verifiedUserId)
      setPassword('')
      setConfirmation('')
      onAuthenticated(verifiedUserId, registering)
    } catch (caught) {
      if (!mounted.current) return
      const status = axios.isAxiosError(caught) ? caught.response?.status : undefined
      const registrationUncertain = registering && (
        stage === 'verify' || stage === 'remember' || (stage === 'submit' && (status === undefined || status >= 500))
      )

      if (registrationUncertain) {
        // The POST may already have saved the account. Never silently post it a second time.
        setMustSignIn(true)
        setPassword('')
        setConfirmation('')
        setError(stage === 'remember'
          ? 'Your account was created, but this browser could not save your verified session. Allow browser storage, then sign in to continue.'
          : stage === 'verify'
            ? 'Your account may have been created, but we could not verify its session. Sign in to continue.'
            : 'The connection was interrupted and your account may have been created. Connect to the internet, then try signing in before creating another account.')
      } else if (stage === 'verify') {
        setError('Your sign-in was accepted, but we could not verify your session. Check your connection and allow cookies, then try again.')
      } else if (stage === 'remember') {
        setError('Your session was verified, but this browser could not save it. Allow browser storage, then try again.')
      } else if (status === 422 && axios.isAxiosError(caught)) {
        const errors = validationErrors(caught.response?.data?.errors)
        showFieldErrors(errors)
        setError(registering ? 'Please check the highlighted fields.' : 'Check your email and password.')
      } else if (status === 429) {
        setError('Too many attempts. Wait a minute and try again.')
      } else if (status === 419) {
        setError('Your session expired. Please try again.')
      } else if (axios.isAxiosError(caught) && !caught.response) {
        setError(`Unable to connect. Check your internet connection, then try ${registering ? 'creating your account' : 'signing in'} again.`)
      } else {
        setError(`Unable to ${registering ? 'create your account' : 'sign in'} right now. Please try again shortly.`)
      }
    } finally {
      submitting.current = false
      if (mounted.current) setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-heading">
        <div className="auth-brand">
          <BrandLogo size={48} />
          <span>Money Tracker</span>
        </div>

        <header className="auth-heading">
          <h1 id="auth-heading">{registering ? 'Create account' : 'Welcome back'}</h1>
          <p>{registering ? 'Start tracking your money.' : 'Sign in to manage your money.'}</p>
        </header>

        {sessionError && <p className="auth-notice auth-error" role="alert">{sessionError}</p>}
        {registering && !online && (
          <p className="auth-notice" role="status">Connect to the internet to create and save your account. You can fill in the form while offline.</p>
        )}

        <form className="auth-form" ref={formRef} onSubmit={handleSubmit} aria-busy={loading}>
          {registering && (
            <AuthField
              id="auth-name" name="name" label="Full name" icon="person"
              type="text" autoComplete="name" placeholder="Your name" value={name}
              required maxLength={100} disabled={loading || mustSignIn} error={fieldErrors.name}
              onChange={(event) => { setName(event.target.value); clearFieldError('name') }}
            />
          )}
          <AuthField
            id="auth-email" name="email" label="Email" icon="mail"
            type="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
            placeholder="you@example.com" value={email} required maxLength={255}
            disabled={loading || mustSignIn} error={fieldErrors.email}
            onChange={(event) => { setEmail(event.target.value); clearFieldError('email') }}
          />
          <AuthField
            id="auth-password" name="password" label="Password" icon="lock" passwordField
            autoComplete={registering ? 'new-password' : 'current-password'}
            placeholder="••••••••" value={password} required minLength={registering ? 8 : undefined}
            disabled={loading || mustSignIn} error={fieldErrors.password}
            onChange={(event) => { setPassword(event.target.value); clearFieldError('password') }}
          />
          {registering && (
            <AuthField
              id="auth-confirmation" name="password_confirmation" label="Confirm password" icon="lock" passwordField
              autoComplete="new-password" placeholder="••••••••" value={confirmation} required minLength={8}
              disabled={loading || mustSignIn} error={fieldErrors.password_confirmation}
              onChange={(event) => { setConfirmation(event.target.value); clearFieldError('password_confirmation') }}
            />
          )}

          {error && <p className="auth-notice auth-error" role="alert">{error}</p>}

          <button className="auth-submit" type="submit" disabled={loading || mustSignIn}>
            <span>{loading ? (registering ? 'Creating account…' : 'Signing in…') : (registering ? 'Create account' : 'Sign in')}</span>
            {!loading && <AppIcon name="arrow-right" />}
          </button>
          <span className="sr-only" role="status">{loading ? (registering ? 'Creating your account. Please wait.' : 'Signing in. Please wait.') : ''}</span>
        </form>

        <p className="auth-switch">
          <span>{registering ? 'Already have an account?' : "Don't have an account?"}</span>{' '}
          <a
            href={registering ? '/sign-in' : '/sign-up'}
            aria-disabled={loading || undefined}
            onClick={(event) => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
              event.preventDefault()
              if (!submitting.current) onModeChange(registering ? 'login' : 'register')
            }}
          >{registering ? 'Sign in' : 'Create account'}</a>
        </p>
      </section>
    </main>
  )
}
