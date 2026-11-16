import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { CrashScreen, ErrorBoundary } from './ui'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallback={(error, retry) => <CrashScreen error={error} onRetry={retry} />}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
