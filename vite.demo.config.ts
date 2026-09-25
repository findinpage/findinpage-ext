import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@fontsource-variable/inter': path.resolve(import.meta.dirname, 'demo/empty.css'),
      '@': path.resolve(import.meta.dirname),
    },
  },
  build: {
    emptyOutDir: true,
    outDir: 'dist/demo',
    lib: {
      entry: path.resolve(import.meta.dirname, 'demo/index.tsx'),
      formats: ['iife'],
      name: 'FindInPageDemoBundle',
      fileName: () => 'findinpage-demo.js',
    },
  },
});
