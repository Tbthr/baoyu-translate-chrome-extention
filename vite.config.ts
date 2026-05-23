import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { resolve } from 'path';
import { readFileSync, writeFileSync } from 'fs';

// Post-build plugin: inline content script dependencies into a single IIFE file
function inlineContentScriptPlugin() {
  return {
    name: 'inline-content-script',
    closeBundle() {
      const distDir = resolve(__dirname, 'dist');
      const contentPath = resolve(distDir, 'content/content.js');
      let code = readFileSync(contentPath, 'utf-8');

      // Resolve all relative imports (e.g. import { X } from "../chunks/xxx.js")
      const importRegex = /import\s*\{([^}]*)\}\s*from\s*"([^"]+\.js)"/g;
      let match;
      while ((match = importRegex.exec(code)) !== null) {
        const [_full, imports, relPath] = match;
        const absPath = resolve(distDir, 'content', relPath);
        let chunkCode = readFileSync(absPath, 'utf-8');

        // Extract exports from the chunk: export { A as X, B as Y }
        const exportRegex = /export\s*\{([^}]*)\}/;
        const exportMatch = chunkCode.match(exportRegex);
        if (exportMatch) {
          // Remove the export statement, keep variable declarations
          chunkCode = chunkCode.replace(exportRegex, '');
        }

        // Replace import with inlined code
        code = code.replace(match[0], `/* inlined: ${relPath} */\n${chunkCode}`);
      }

      // Remove any remaining export statements
      code = code.replace(/^export\s+\{/gm, '{');

      writeFileSync(contentPath, code);
    },
  };
}

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
    inlineContentScriptPlugin(),
  ],
});
