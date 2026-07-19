import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import './index.css'
import App from './App.tsx'
import { GameStage } from './components/GameStage.tsx'

if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/service-worker.js').catch((error) => {
      console.warn('Maintenance fallback service worker was not registered:', error)
    })
  })
}

if (/SamsungBrowser/i.test(window.navigator.userAgent)) {
  document.documentElement.classList.add('samsung-internet')
}

const usesFullPageLayout =
  window.location.pathname.startsWith('/legal/') ||
  window.location.pathname === '/admin'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {usesFullPageLayout ? (
      <App />
    ) : (
      <GameStage>
        <App />
      </GameStage>
    )}
  </StrictMode>,
)
