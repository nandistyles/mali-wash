import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        // Must match what actually exists in public/ — the previous list named a
        // favicon.ico that was never in the repo, and the manifest pointed at
        // icons that 404'd in production.
        includeAssets: ['favicon.svg', 'favicon-48x48.png', 'apple-touch-icon.png', 'masked-icon.svg'],
        manifest: {
          name: 'Mali Holdings · Wash',
          short_name: 'Mali Wash',
          description: 'Mali Holdings customer, loyalty and wash operations platform',
          theme_color: '#063e3d',
          background_color: '#f6f8f8',
          display: 'standalone',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg}']
        }
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) return 'firebase';
            if (id.includes('node_modules/react') || id.includes('node_modules/react-router')) return 'react';
            if (id.includes('node_modules/dexie')) return 'offline-db';
          }
        }
      }
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
