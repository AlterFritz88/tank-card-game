import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { GameStage } from './components/GameStage.tsx'

const isLegalRoute = window.location.pathname.startsWith('/legal/')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isLegalRoute ? (
      <App />
    ) : (
      <GameStage>
        <App />
      </GameStage>
    )}
  </StrictMode>,
)
