import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  server: {
    port: 5173,
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
