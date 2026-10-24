import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Served from https://<user>.github.io/minecraft-notes/
export default defineConfig({
  base: '/minecraft-notes/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Rebadam Coords',
        short_name: 'Coords',
        description: 'Shared Minecraft coordinates, notes and links',
        theme_color: '#1d2a1a',
        background_color: '#151a14',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Firebase traffic must always go to the network; the app shell is cached.
        navigateFallbackDenylist: [/^\/__\//],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
