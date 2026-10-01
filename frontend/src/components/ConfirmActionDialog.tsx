import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './ConfirmActionDialog.css'

type Props = {
  title: string
  description: ReactNode
  confirmLabel: string
  confirmFirst?: boolean
  processing: boolean
  error?: string
  returnFocus: HTMLButtonElement | null
  onCancel: () => void
  onConfirm: () => void
}

export default function ConfirmActionDialog({ title, description, confirmLabel, confirmFirst = false, processing, error, returnFocus, onCancel, onConfirm }: Props) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [viewport, setViewport] = useState(() => ({
    top: window.visualViewport?.offsetTop ?? 0,
    left: window.visualViewport?.offsetLeft ?? 0,
    width: window.visualViewport?.width ?? window.innerWidth,
    height: window.visualViewport?.height ?? window.innerHeight,
  }))

  function cancel(): void {
    if (processing) return
    onCancel()
    requestAnimationFrame(() => returnFocus?.focus())
  }

  useEffect(() => {
    cancelRef.current?.focus()
    const app = document.querySelector<HTMLElement>('.app-shell')
    const wasInert = app?.inert ?? false
    if (app) app.inert = true
    const updateViewport = () => setViewport({
      top: window.visualViewport?.offsetTop ?? 0,
      left: window.visualViewport?.offsetLeft ?? 0,
      width: window.visualViewport?.width ?? window.innerWidth,
      height: window.visualViewport?.height ?? window.innerHeight,
    })
    window.addEventListener('resize', updateViewport)
    window.visualViewport?.addEventListener('resize', updateViewport)
    window.visualViewport?.addEventListener('scroll', updateViewport)
    return () => {
      if (app) app.inert = wasInert
      window.removeEventListener('resize', updateViewport)
      window.visualViewport?.removeEventListener('resize', updateViewport)
      window.visualViewport?.removeEventListener('scroll', updateViewport)
    }
  }, [])

  useEffect(() => {
    if (processing) dialogRef.current?.focus()
  }, [processing])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        cancel()
        return
      }
      if (event.key !== 'Tab') return
      const controls = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
      if (!controls?.length) {
        event.preventDefault()
        dialogRef.current?.focus()
        return
      }
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  const cancelButton = <button ref={cancelRef} type="button" className="confirm-action-cancel" disabled={processing} onClick={cancel}>Cancel</button>
  const confirmButton = <button type="button" className="confirm-action-danger" disabled={processing} onClick={onConfirm}>{processing ? 'Processing…' : confirmLabel}</button>

  return createPortal(
    <div className="confirm-action-backdrop" style={viewport} onMouseDown={(event) => { if (event.target === event.currentTarget) cancel() }}>
      <div ref={dialogRef} className="confirm-action-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1}>
        <h2 id={titleId}>{title}</h2>
        <div id={descriptionId} className="confirm-action-description">{description}</div>
        {error && <p className="confirm-action-error" role="alert">{error}</p>}
        <div className="confirm-action-buttons">
          {confirmFirst ? confirmButton : cancelButton}
          {confirmFirst ? cancelButton : confirmButton}
        </div>
      </div>
    </div>,
    document.body,
  )
}
