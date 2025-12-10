import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        table: path.resolve(__dirname, 'table.html'),
        tableConfig: path.resolve(__dirname, 'tableConfig.html'),
      },
      output: {
        entryFileNames: '[name].js',      // -> table.js / tableConfig.js
        chunkFileNames: 'client.js',      // vendor/runtime bundle，固定名方便 Worker 引用
        assetFileNames: '[name].[ext]',   // css -> client.css
      },
    },
  },
});
