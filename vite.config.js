import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';
import { resolve } from 'path';
import pkg from './package.json' assert { type: 'json' };

export default defineConfig(({ command, mode }) => {
  const isExtension = mode === 'extension';

  if (isExtension) {
    return {
      build: {
        outDir: 'dist/extension',
        rollupOptions: {
          input: {
            'content-script': resolve(__dirname, 'src/extension-main.js'),
            'extension-inject': resolve(__dirname, 'src/extension-inject.js'),
          },
          output: {
            entryFileNames: `[name].js`,
            chunkFileNames: `assets/[name]-[hash].js`,
            assetFileNames: `assets/[name]-[hash].[ext]`,
            format: 'es',
          },
        },
      },
    };
  }

  return {
    plugins: [
      monkey({
        entry: 'src/userscript-main.js',
        userscript: {
          name: pkg.friendlyName,
          namespace: `npm/${pkg.name}`,
          version: pkg.version,
          author: pkg.author,
          description: pkg.description,
          match: pkg.matches,
          icon: 'https://img.icons8.com/external-regular-kawalan-studio/48/external-calendar-cross-date-time-regular-kawalan-studio.png'
        },
      }),
    ],
    build: {
        outDir: 'dist/userscript',
    }
  };
});
