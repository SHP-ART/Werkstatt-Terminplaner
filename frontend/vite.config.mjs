import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  // Basis-Pfad für Assets (relativ für Electron)
  base: './',

  // Build-Konfiguration
  build: {
    // Output-Verzeichnis
    outDir: 'dist',

    // Assets-Verzeichnis innerhalb von outDir
    assetsDir: 'assets',

    // Quellkarten für Debugging (deaktiviert für kleinere Builds)
    sourcemap: false,

    // Minifizierung aktivieren
    minify: 'esbuild',

    // Target-Browser
    target: 'chrome108', // Electron 28 nutzt Chrome 108

    // Rollup-spezifische Optionen
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html')
      },
      output: {
        // Dateinamen mit Hash für Cache-Busting
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },

    // Chunk-Größe Warnungen anpassen (app.js ist sehr groß)
    chunkSizeWarningLimit: 1500
  },

  // Entwicklungsserver
  server: {
    port: 3000,
    strictPort: true,
    host: true,
    // Proxy zum Backend
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },

  // Vorschau-Server
  preview: {
    port: 4173
  },

  // Resolve-Aliase für saubere Imports
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@components': path.resolve(__dirname, 'src/components'),
      '@services': path.resolve(__dirname, 'src/services'),
      '@styles': path.resolve(__dirname, 'src/styles')
    }
  },

  // CSS-Optionen
  css: {
    devSourcemap: true
  },

  // Optimierungen
  optimizeDeps: {
    // Externe Abhängigkeiten (SheetJS wird über CDN geladen)
    exclude: ['xlsx']
  }
});
