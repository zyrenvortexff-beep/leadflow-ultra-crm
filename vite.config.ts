import { defineConfig } from 'vite';
import viteReact from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { nitro } from 'nitro/vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      '@tanstack/react-query',
      '@tanstack/query-core',
    ],
  },
  plugins: [
    tanstackStart(),
    nitro({
      preset: 'cloudflare-module',
      handlers: [
        { route: '/api/webhook/whatsapp', handler: path.resolve(__dirname, './server/routes/api/webhook/whatsapp.ts') },
        { route: '/functions/v1/whatsapp-webhook', handler: path.resolve(__dirname, './server/routes/api/webhook/whatsapp.ts') },
      ],
    }),
    viteReact(),
    tailwindcss(),
    tsconfigPaths(),
  ],
});
