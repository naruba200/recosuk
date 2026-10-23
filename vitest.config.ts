import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    setupFiles: ['./src/lib/__tests__/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
