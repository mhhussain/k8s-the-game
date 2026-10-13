import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Single-file build: dist/index.html contains all JS + CSS inlined so the game
// opens directly from the filesystem (file://) or any static host.
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2020',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
