import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import '@mantine/core/styles.css'
import '@mantine/tiptap/styles.css'
import './index.css'
import { theme } from './theme/index'
import { OrchestratorProvider } from './context/OrchestratorContext'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider defaultColorScheme="light" theme={theme}>
      <OrchestratorProvider>
        <App />
      </OrchestratorProvider>
    </MantineProvider>
  </StrictMode>,
)
