import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    manifest: {
      name: 'Life Space（开发测试版）',
      short_name: 'Life Space',
      description: '个人生活空间的基础测试版本',
      theme_color: '#f8f7f3',
      background_color: '#f8f7f3',
      display: 'standalone',
      start_url: './',
      scope: './',
      icons: [
        { src: './icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: './icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
      ]
    },
    workbox: { navigateFallback: 'index.html', globPatterns: ['**/*.{js,css,html,png,svg,ico}'] }
  })],
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'] }
});
