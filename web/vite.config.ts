import react from '@vitejs/plugin-react';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const htmlInputs = {
  table: path.resolve(__dirname, 'table.html'),
  tableConfig: path.resolve(__dirname, 'tableConfig.html'),
};

export default {
  plugins: [react(), tailwindcss(), viteSingleFile({ useRecommendedBuildConfig: false })],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    cssCodeSplit: false,
    minify: false,
    rollupOptions: {
      input: htmlInputs,
      output: {
        entryFileNames: '[name].html',
        assetFileNames: '[name].[ext]',
        // 保持默认的代码分割，单文件插件会内联资源
      },
    },
  },
};
