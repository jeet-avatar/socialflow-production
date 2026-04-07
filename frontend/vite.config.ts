import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/', // Important: Ensures assets load from root path
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Share remotion-service template files without duplicating them
      '@remotion-src': path.resolve(__dirname, '../remotion-service/src'),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
    include: ['remotion', '@remotion/player'],
  },
  define: {
    'process.env.OPENAI_API_KEY': JSON.stringify(process.env.OPENAI_API_KEY),
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});