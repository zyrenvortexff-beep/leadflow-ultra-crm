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
        { route: '/api/whatsapp-handler', handler: path.resolve(__dirname, './server/routes/api/whatsapp-handler.ts') },
        { route: '/functions/v1/whatsapp-handler', handler: path.resolve(__dirname, './server/routes/api/whatsapp-handler.ts') },
        { route: '/api/campaigns-dispatch', handler: path.resolve(__dirname, './server/routes/api/campaigns-dispatch.ts') },
        { route: '/functions/v1/campaigns-dispatch', handler: path.resolve(__dirname, './server/routes/api/campaigns-dispatch.ts') },
        { route: '/api/meta-test', handler: path.resolve(__dirname, './server/routes/api/meta-test.ts') },
        { route: '/functions/v1/meta-test', handler: path.resolve(__dirname, './server/routes/api/meta-test.ts') },
        { route: '/api/admin-users', handler: path.resolve(__dirname, './server/routes/api/admin-users.ts') },
        { route: '/functions/v1/admin-users', handler: path.resolve(__dirname, './server/routes/api/admin-users.ts') },
      ],
    }),
    viteReact(),
    tailwindcss(),
    tsconfigPaths(),
  ],
});
