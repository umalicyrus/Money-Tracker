import axios from 'axios'
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { api } from '../../../lib/api/client'
import { cacheProfile, readCachedProfile, type CachedProfile } from '../lib/profileCache'
import LogoutButton from '../../auth/components/LogoutButton'

type Profile = CachedProfile & { photoUrl: string | null }

type Props = { userId: string, onLogout: () => void }

const emptyProfile: Profile = { name: '', phone: null, email: '', hasPhoto: false, photoUrl: null }

function isOfflineError(error: unknown): boolean {
  return axios.isAxiosError(error) && !error.response
}

function messageFor(error: unknown, fallback: string): string {
  if (isOfflineError(error)) return 'This change needs an internet connection. Nothing was saved.'
  if (axios.isAxiosError(error) && error.response?.status === 422) {
    const fields = error.response.data?.errors as Record<string, string[]> | undefined
    return Object.values(fields ?? {})[0]?.[0] ?? 'Please correct the highlighted fields.'
  }
  return fallback
}

function initials(name: string): string {
  return name.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '?'
}

export default function ProfileSettingsPage({ userId, onLogout }: Props) {
  const [profile, setProfile] = useState<Profile>(() => {
    const cached = readCachedProfile(userId)
    return cached ? { ...cached, photoUrl: cached.hasPhoto ? '/api/v1/profile/photo' : null } : emptyProfile
  })
  const [name, setName] = useState(() => readCachedProfile(userId)?.name ?? '')
  const [phone, setPhone] = useState(() => readCachedProfile(userId)?.phone ?? '')
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileStatus, setProfileStatus] = useState('')
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState('')
  const [photoStatus, setPhotoStatus] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordStatus, setPasswordStatus] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPhoto, setSavingPhoto] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  function applyProfile(nextProfile: Profile): void {
    setProfile(nextProfile)
    setName(nextProfile.name)
    setPhone(nextProfile.phone ?? '')
    cacheProfile(userId, nextProfile)
  }

  useEffect(() => {
    let active = true
    async function loadProfile() {
      try {
        const response = await api.get('/api/v1/profile')
        if (!active) return
        const data = response.data.data
        const nextProfile = { name: data.name, phone: data.phone, email: data.email, hasPhoto: data.has_photo, photoUrl: data.photo_url }
        setProfile(nextProfile)
        setName(nextProfile.name)
        setPhone(nextProfile.phone ?? '')
        cacheProfile(userId, nextProfile)
        setOffline(false)
      } catch (error) {
        if (!active) return
        setOffline(isOfflineError(error))
        if (!readCachedProfile(userId)) setProfileError(isOfflineError(error) ? 'Connect to the internet to load your profile.' : 'Could not load your profile.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadProfile()
    return () => { active = false }
  }, [userId])

  useEffect(() => () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview)
  }, [photoPreview])

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setProfileError('')
    setProfileStatus('')
    setSavingProfile(true)
    try {
      const response = await api.patch('/api/v1/profile', { name, phone: phone || null })
      const data = response.data.data
      applyProfile({ name: data.name, phone: data.phone, email: data.email, hasPhoto: data.has_photo, photoUrl: data.photo_url })
      setOffline(false)
      setProfileStatus('Profile saved.')
    } catch (error) {
      if (isOfflineError(error)) setOffline(true)
      setProfileError(messageFor(error, 'Could not save your profile. Please try again.'))
    } finally {
      setSavingProfile(false)
    }
  }

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    setPhotoError('')
    setPhotoStatus('')
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setPhotoError('Choose a JPG, PNG, or WebP image no larger than 2 MB.')
      event.target.value = ''
      return
    }
    setPhotoPreview(URL.createObjectURL(file))
  }

  async function uploadPhoto() {
    const input = document.getElementById('profile-photo') as HTMLInputElement | null
    const file = input?.files?.[0]
    if (!file) {
      setPhotoError('Choose a photo before uploading.')
      return
    }
    setSavingPhoto(true)
    setPhotoError('')
    setPhotoStatus('')
    try {
      const form = new FormData()
      form.append('photo', file)
      const response = await api.post('/api/v1/profile/photo', form)
      const data = response.data.data
      applyProfile({ name: data.name, phone: data.phone, email: data.email, hasPhoto: data.has_photo, photoUrl: `${data.photo_url}?v=${Date.now()}` })
      setPhotoPreview(null)
      input.value = ''
      setOffline(false)
      setPhotoStatus('Profile photo saved.')
    } catch (error) {
      if (isOfflineError(error)) setOffline(true)
      setPhotoError(messageFor(error, 'Could not upload this photo. Please try again.'))
    } finally {
      setSavingPhoto(false)
    }
  }

  async function removePhoto() {
    setSavingPhoto(true)
    setPhotoError('')
    setPhotoStatus('')
    try {
      const response = await api.delete('/api/v1/profile/photo')
      const data = response.data.data
      applyProfile({ name: data.name, phone: data.phone, email: data.email, hasPhoto: data.has_photo, photoUrl: null })
      setPhotoPreview(null)
      setOffline(false)
      setPhotoStatus('Profile photo removed.')
    } catch (error) {
      if (isOfflineError(error)) setOffline(true)
      setPhotoError(messageFor(error, 'Could not remove your photo. Please try again.'))
    } finally {
      setSavingPhoto(false)
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPasswordError('')
    setPasswordStatus('')
    setSavingPassword(true)
    try {
      await api.put('/api/v1/profile/password', {
        current_password: form.get('currentPassword'),
        password: form.get('newPassword'),
        password_confirmation: form.get('confirmPassword'),
      })
      event.currentTarget.reset()
      setOffline(false)
      setPasswordStatus('Password changed.')
    } catch (error) {
      if (isOfflineError(error)) setOffline(true)
      setPasswordError(messageFor(error, 'Could not change your password. Please try again.'))
    } finally {
      setSavingPassword(false)
    }
  }

  const shownPhoto = photoPreview ?? (offline ? null : profile.photoUrl)

  return (
    <section className="profile-settings" aria-labelledby="profile-settings-heading">
      <div className="section-heading"><div><p className="eyebrow">Account</p><h2 id="profile-settings-heading">Profile &amp; settings</h2></div></div>
      {offline && <p className="offline-note" role="status">Offline: you can view cached profile details, but profile changes need an internet connection.</p>}
      {loading ? <p className="empty-copy">Loading profile…</p> : <>
        {profileError && <p className="form-error" role="alert">{profileError}</p>}
        <section className="profile-card" aria-label="Profile photo">
          <div className="profile-avatar">{shownPhoto ? <img src={shownPhoto} alt="Profile preview" /> : initials(profile.name)}</div>
          <div className="profile-photo-controls">
            <label className="file-button" htmlFor="profile-photo">Choose photo</label>
            <input id="profile-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} />
            <small>JPG, PNG, or WebP. Maximum 2 MB.</small>
            {photoPreview && <button type="button" className="primary-button" onClick={uploadPhoto} disabled={savingPhoto || offline}>{savingPhoto ? 'Uploading…' : 'Upload photo'}</button>}
            {profile.hasPhoto && !photoPreview && <button type="button" className="secondary-button" onClick={removePhoto} disabled={savingPhoto || offline}>{savingPhoto ? 'Removing…' : 'Remove photo'}</button>}
            {photoError && <p className="form-error" role="alert">{photoError}</p>}
            {photoStatus && <p className="form-success" role="status">{photoStatus}</p>}
          </div>
        </section>

        <form className="profile-form" onSubmit={saveProfile}>
          <h3>Personal details</h3>
          <label htmlFor="profile-name">Display name<input id="profile-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} autoComplete="name" /></label>
          <label htmlFor="profile-phone">Phone number <span className="optional">(optional)</span><input id="profile-phone" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={30} autoComplete="tel" /></label>
          <label htmlFor="profile-email">Account email<input id="profile-email" value={profile.email} readOnly aria-readonly="true" /></label>
          <p className="field-help">Email changes require a secure verification flow, which is not available in this app.</p>
          <button className="primary-button" disabled={savingProfile || offline}>{savingProfile ? 'Saving…' : 'Save profile'}</button>
          {profileStatus && <p className="form-success" role="status">{profileStatus}</p>}
        </form>

        <form className="profile-form" onSubmit={changePassword}>
          <h3>Change password</h3>
          <label htmlFor="current-password">Current password<input id="current-password" name="currentPassword" type="password" required autoComplete="current-password" /></label>
          <label htmlFor="new-password">New password<input id="new-password" name="newPassword" type="password" required minLength={8} autoComplete="new-password" /></label>
          <label htmlFor="confirm-password">Confirm new password<input id="confirm-password" name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" /></label>
          <button className="primary-button" disabled={savingPassword || offline}>{savingPassword ? 'Changing…' : 'Change password'}</button>
          {passwordError && <p className="form-error" role="alert">{passwordError}</p>}
          {passwordStatus && <p className="form-success" role="status">{passwordStatus}</p>}
        </form>
        <section className="profile-form profile-sign-out" aria-labelledby="profile-sign-out-heading">
          <h3 id="profile-sign-out-heading">Sign out</h3>
          <p className="field-help">Your finance records and any pending changes stay on this device.</p>
          <LogoutButton userId={userId} onLogout={onLogout} />
        </section>
      </>}
    </section>
  )
}
