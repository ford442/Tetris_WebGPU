import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/tetris-webgpu/' : '/',
  server: {
    allowedHosts: ['code.noahcohn.com', 'localhost'],
  },
});
