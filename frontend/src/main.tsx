import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// sw.js is generated during the production build; it is absent in Vite dev.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  let reloadedForController = false

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadedForController) return
    reloadedForController = true
    window.location.reload()
  })

  const registerWorker = async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        updateViaCache: 'none',
      })
      // Check for a newer worker when the app opens online.
      if (navigator.onLine) await registration.update()
    } catch (error) {
      console.warn('Offline app setup/update failed:', error)
    }
  }

  if (document.readyState === 'complete') {
    void registerWorker()
  } else {
    window.addEventListener('load', () => { void registerWorker() }, { once: true })
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
