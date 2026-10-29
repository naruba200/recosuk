import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyTheme, resolveInitialTheme } from './lib/themes'

// Apply the persisted theme before first paint so the first frame
// already uses the chosen palette (:root defaults to Dark Stage if
// nothing is stored — see src/index.css).
applyTheme(resolveInitialTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
