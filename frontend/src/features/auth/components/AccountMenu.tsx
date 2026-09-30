import { useEffect, useRef, useState } from 'react'
import { readCachedProfile } from '../../profile/lib/profileCache'
import LogoutButton from './LogoutButton'

type AccountMenuProps = { userId: string, onOpenProfile: () => void, onLogout: () => void }

function initials(name: string): string {
  return name.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '?'
}

export default function AccountMenu({ userId, onOpenProfile, onLogout }: AccountMenuProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const sheetRef = useRef<HTMLElement>(null)
  const profile = readCachedProfile(userId)
  const name = profile?.name || 'Account'

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    if (open) window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  function openProfile(): void { setOpen(false); onOpenProfile() }
  function closeMenu(): void { setOpen(false); triggerRef.current?.focus() }

  useEffect(() => {
    if (open) sheetRef.current?.focus()
  }, [open])

  return <div className="account-menu">
    <button ref={triggerRef} className="account-trigger" type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls="account-menu-sheet" onClick={() => setOpen(true)}>
      <span className="account-avatar" aria-hidden="true">{profile?.hasPhoto ? <img src="/api/v1/profile/photo" alt="" /> : initials(name)}</span><span className="sr-only">Open account menu</span>
    </button>
    {open && <>
      <button className="account-menu-backdrop" type="button" aria-label="Close account menu" onClick={closeMenu} />
      <section ref={sheetRef} className="account-menu-sheet" id="account-menu-sheet" role="dialog" aria-modal="true" aria-labelledby="account-menu-heading" tabIndex={-1}>
        <div className="account-sheet-handle" aria-hidden="true" />
        <div className="account-summary"><span className="account-avatar account-avatar-large" aria-hidden="true">{profile?.hasPhoto ? <img src="/api/v1/profile/photo" alt="" /> : initials(name)}</span><div><h2 id="account-menu-heading">{name}</h2>{profile?.email && <p>{profile.email}</p>}</div></div>
        <button className="account-menu-link" type="button" onClick={openProfile}>Profile &amp; settings</button>
        <LogoutButton userId={userId} onLogout={onLogout} className="account-menu-logout" />
      </section>
    </>}
  </div>
}
