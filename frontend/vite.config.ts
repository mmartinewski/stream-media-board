import fs from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin as EsbuildPlugin } from 'esbuild';

const BACKEND_PORT = Number(process.env.BACKEND_PORT ?? 3847);

/**
 * react-draggable calls `process.env.DRAGGABLE_DEBUG` inside log() on every
 * mousedown. In the browser `process` is undefined → ReferenceError → drag never starts.
 */
function rewriteDraggableDebug(code: string): string {
  return code.split('process.env.DRAGGABLE_DEBUG').join(
    '(typeof process !== "undefined" && process.env && process.env.DRAGGABLE_DEBUG)',
  );
}

function esbuildShimDraggableDebug(): EsbuildPlugin {
  return {
    name: 'shim-draggable-debug-esbuild',
    setup(build) {
      build.onLoad({ filter: /[\\/]react-draggable[\\/].*\.m?js$/ }, async (args) => {
        const source = await fs.promises.readFile(args.path, 'utf8');
        if (!source.includes('process.env.DRAGGABLE_DEBUG')) return null;
        return {
          contents: rewriteDraggableDebug(source),
          loader: 'js',
        };
      });
    },
  };
}

function shimDraggableDebug(): Plugin {
  return {
    name: 'shim-draggable-debug',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('react-draggable') && !id.includes('react-grid-layout')) return null;
      if (!code.includes('process.env.DRAGGABLE_DEBUG')) return null;
      return { code: rewriteDraggableDebug(code), map: null };
    },
  };
}

export default defineConfig({
  plugins: [react(), shimDraggableDebug()],
  define: {
    'process.env.DRAGGABLE_DEBUG': JSON.stringify(''),
  },
  optimizeDeps: {
    esbuildOptions: {
      plugins: [esbuildShimDraggableDebug()],
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `ws://localhost:${BACKEND_PORT}`,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
