import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { APP_NAME } from '@codex/shared'
import './monaco-setup'
import { App } from './App'
import './styles/globals.css'

document.title = APP_NAME

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
