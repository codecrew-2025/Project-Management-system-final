import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Allow dev server to accept requests from ngrok public host(s)
    allowedHosts: [
      'cesspool-proxy-rind.ngrok-free.dev',
      'localhost'
    ],
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
