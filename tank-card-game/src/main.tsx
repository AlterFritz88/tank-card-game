import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { GameStage } from './components/GameStage.tsx'

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
