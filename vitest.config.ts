import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // `server-only` throws by design when resolved outside a React Server
      // Component graph, which would blow up any test that reaches the auth
      // DAL. Point it at the package's own no-op build instead. (The guard
      // that actually matters — no client module importing server code — is
      // tests/server-client-boundary.test.ts, which checks the import graph
      // statically and does not depend on this.)
      'server-only': path.resolve(__dirname, 'node_modules/server-only/empty.js'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
