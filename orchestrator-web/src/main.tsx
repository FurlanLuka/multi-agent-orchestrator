import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import '@mantine/core/styles.css'
import '@mantine/tiptap/styles.css'
import './index.css'
import { OrchestratorProvider } from './context/OrchestratorContext'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider defaultColorScheme="light">
      <OrchestratorProvider>
        <App />
      </OrchestratorProvider>
    </MantineProvider>
  </StrictMode>,
)
