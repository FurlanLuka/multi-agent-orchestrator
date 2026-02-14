import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import obfuscatorPlugin from 'rollup-plugin-obfuscator'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    ...(command === 'build' ? [obfuscatorPlugin({
      options: {
        compact: true,
        controlFlowFlattening: false,
        deadCodeInjection: false,
        debugProtection: false,
        disableConsoleOutput: true,
        identifierNamesGenerator: 'hexadecimal',
        log: false,
        numbersToExpressions: false,
        renameGlobals: false,
        selfDefending: false,
        simplify: true,
        stringArray: false,
        transformObjectKeys: false,
        unicodeEscapeSequence: false,
      },
    })] : []),
  ],
  server: {
    port: 3555,  // Use unique port to avoid conflicts with project dev servers
    proxy: {
      // Proxy API requests to the backend
      '/api': {
        target: 'http://localhost:3456',
        changeOrigin: true,
      },
      // Proxy Socket.IO WebSocket connections to the backend
      '/socket.io': {
        target: 'http://localhost:3456',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  // Only set port override in dev mode - production uses window.location.port
  define: command === 'serve' ? {
    'import.meta.env.VITE_ORCHESTRATOR_PORT': JSON.stringify('3456'),
  } : {},
}))
