import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import AppIcon from './AppIcon'
import './RecordActionsMenu.css'

type Props = {
  label: string
  editLabel: string
  editDisabled?: boolean
  onEdit: (trigger: HTMLButtonElement) => void
  dangerLabel?: string
  dangerAriaLabel?: string
  dangerDisabled?: boolean
  onDanger?: (trigger: HTMLButtonElement) => void
}

type MenuPosition = { left: number; top: number; maxHeight: number }

export default function RecordActionsMenu({ label, editLabel, editDisabled = false, onEdit, dangerLabel, dangerAriaLabel, dangerDisabled = false, onDanger }: Props) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<MenuPosition>({ left: 8, top: 8, maxHeight: 148 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  function closeAndRestoreFocus(): void {
    setOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  function toggleMenu(): void {
    if (open) {
      closeAndRestoreFocus()
      return
    }

    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const viewportLeft = window.visualViewport?.offsetLeft ?? 0
    const viewportTop = window.visualViewport?.offsetTop ?? 0
    const viewportRight = viewportLeft + (window.visualViewport?.width ?? document.documentElement.clientWidth)
    const viewportBottom = viewportTop + (window.visualViewport?.height ?? window.innerHeight)
    const menuWidth = 184
    const menuHeight = Math.min(dangerLabel && onDanger ? 148 : 104, Math.max(44, viewportBottom - viewportTop - 16))
    const left = Math.max(viewportLeft + 8, Math.min(rect.right - menuWidth, viewportRight - menuWidth - 8))
    const top = rect.bottom + 6 + menuHeight <= viewportBottom - 8
      ? rect.bottom + 6
      : Math.max(viewportTop + 8, Math.min(rect.top - menuHeight - 6, viewportBottom - menuHeight - 8))

    setPosition({ left, top, maxHeight: menuHeight })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return

    const focusMenu = requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    })
    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeAndRestoreFocus()
    }
    const closeOnViewportChange = () => setOpen(false)

    document.addEventListener('pointerdown', closeOnPointerDown)
    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', closeOnViewportChange)
    window.addEventListener('scroll', closeOnViewportChange, true)
    window.visualViewport?.addEventListener('resize', closeOnViewportChange)

    return () => {
      cancelAnimationFrame(focusMenu)
      document.removeEventListener('pointerdown', closeOnPointerDown)
      document.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', closeOnViewportChange)
      window.removeEventListener('scroll', closeOnViewportChange, true)
      window.visualViewport?.removeEventListener('resize', closeOnViewportChange)
    }
  }, [open])

  return <>
    <button
      ref={triggerRef}
      type="button"
      className="record-actions-trigger"
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? menuId : undefined}
      onClick={toggleMenu}
    >
      <AppIcon name="more-vertical" />
    </button>
    {open && createPortal(
      <div
        ref={menuRef}
        id={menuId}
        className="record-actions-menu"
        role="menu"
        aria-label={label}
        style={position}
      >
        <button
          type="button"
          role="menuitem"
          disabled={editDisabled}
          onClick={() => {
            const trigger = triggerRef.current
            setOpen(false)
            if (trigger) onEdit(trigger)
          }}
        >
          <AppIcon name="edit" />
          {editLabel}
        </button>
        {dangerLabel && onDanger && <button
          type="button"
          role="menuitem"
          className="record-actions-danger"
          aria-label={dangerAriaLabel ?? dangerLabel}
          disabled={dangerDisabled}
          onClick={() => {
            const trigger = triggerRef.current
            setOpen(false)
            if (trigger) onDanger(trigger)
          }}
        >
          <AppIcon name="trash" />
          {dangerLabel}
        </button>}
        <button type="button" role="menuitem" className="record-actions-cancel" onClick={closeAndRestoreFocus}>Cancel</button>
      </div>,
      document.body,
    )}
  </>
}
