import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { GameStage } from './components/GameStage.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GameStage>
      <App />
    </GameStage>
  </StrictMode>,
)
