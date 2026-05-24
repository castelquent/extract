import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import electronRenderer from 'vite-plugin-electron-renderer'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { resolve } from 'path'
import { readFileSync } from 'fs'

// Force Electron to run as a real Electron process when vite-plugin-electron
// spawns it. Some agent / IDE shells set ELECTRON_RUN_AS_NODE=1 globally to
// avoid stray GUI windows; that flag makes `require('electron')` in our main
// bundle return the binary path string instead of the API, and the process
// crashes with `Cannot read properties of undefined (reading 'app')`. We
// clear it only for the vite process; the user's shell env is untouched.
delete process.env.ELECTRON_RUN_AS_NODE

// Read package version once so the Sentry release name matches the value
// passed to Sentry.init at runtime (`extract@${app.getVersion()}`).
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'))
const releaseName = `extract@${pkg.version}`

// Sentry sourcemap upload runs at production build time, only when a token
// is present in the env. Local dev builds skip it cleanly so we don't
// publish bogus releases or fail without credentials.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN

const sentryPlugins = sentryAuthToken
  ? [
      sentryVitePlugin({
        org: 'na-9v7',
        project: 'extract',
        authToken: sentryAuthToken,
        release: { name: releaseName },
        // Don't fail the build if upload errors out (e.g. offline build).
        // The build artefact is still valid; we just lose symbolication
        // for that release.
        errorHandler: (err) => console.warn('[sentry-vite-plugin]', err.message),
      }),
    ]
  : []

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'main/index.ts',
        onstart(options) {
          options.startup()
        },
        vite: {
          resolve: {
            alias: {
              '@main': resolve(__dirname, 'main'),
              '@shared': resolve(__dirname, 'shared')
            }
          },
          build: {
            outDir: 'dist-electron/main',
            sourcemap: true,
            rollupOptions: {
              external: ['electron']
            }
          },
          plugins: sentryPlugins,
        }
      },
      {
        entry: 'preload/index.ts',
        onstart(options) {
          options.reload()
        },
        vite: {
          resolve: {
            alias: {
              '@shared': resolve(__dirname, 'shared')
            }
          },
          build: {
            outDir: 'dist-electron/preload',
            sourcemap: true,
          }
        }
      }
    ]),
    electronRenderer(),
    // Sentry plugin for the renderer build (Vite's own pipeline). Has to
    // come AFTER all other plugins so it sees the final bundle output.
    ...sentryPlugins,
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'renderer'),
      '@main': resolve(__dirname, 'main'),
      '@shared': resolve(__dirname, 'shared')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  }
})
