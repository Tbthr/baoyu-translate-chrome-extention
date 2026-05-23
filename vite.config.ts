import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
        'content': resolve(__dirname, 'src/content/content.ts'),
        'popup': resolve(__dirname, 'src/popup/popup.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'service-worker') return 'background/service-worker.js';
          if (chunkInfo.name === 'content') return 'content/content.js';
          if (chunkInfo.name === 'popup') return 'popup/popup.js';
          return '[name].js';
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
    target: 'chrome120',
    minify: false,
  },
  plugins: [
    viteStaticCopy({
      targets: [
        { src: 'src/manifest.json', dest: '.' },
        { src: 'src/popup/popup.html', dest: 'popup' },
        { src: 'src/assets/*', dest: 'assets' },
      ],
    }),
  ],
});
