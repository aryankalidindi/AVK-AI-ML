import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

// Ports are env-overridable so an isolated run can avoid colliding with a
// developer's already-running dev servers (RELAY_PORT / WEB_PORT).
const relayPort = process.env.RELAY_PORT ?? '8787'
const webPort = process.env.WEB_PORT ?? '5173'

export default defineConfig({
  testDir: '.',
  use: { baseURL: `http://localhost:${webPort}` },
  webServer: [
    {
      command: 'npm run dev:server',
      port: Number(relayPort),
      cwd: repoRoot,
      reuseExistingServer: true,
      env: { PORT: relayPort },
    },
    {
      command: 'npm run dev:web',
      port: Number(webPort),
      cwd: repoRoot,
      reuseExistingServer: true,
      env: {
        WEB_PORT: webPort,
        VITE_API_URL: `http://localhost:${relayPort}`,
        VITE_RELAY_URL: `ws://localhost:${relayPort}`,
      },
    },
  ],
})
