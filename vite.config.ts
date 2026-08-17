import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],

  server: {
    watch: {
      /**
       * Watching costs real money on Windows.
       *
       * File change events do not cross from the Windows filesystem into the
       * container, so hot reload needs polling: without it, edits are simply
       * never noticed. Polling, though, means stat-ing every watched file on a
       * timer, across a bind mount that is slow by nature.
       *
       * Left unbounded that watcher polled the Flutter build output, Laravel's
       * vendor directory and node_modules as well as the app. The container sat
       * at 45% CPU doing nothing, and the dev server took over twenty seconds
       * to return the first byte of a page because it was too busy to answer.
       *
       * Only src/ and the config files actually need watching. Everything below
       * either has its own build or never changes while the server runs.
       */
      usePolling: true,
      interval: 1000,
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/mobile/**',
        '**/api/**',
        '**/supabase/**',
        '**/docs/**',
        '**/build/**',
      ],
    },
  },
})
