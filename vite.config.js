import { defineConfig } from 'vite';

// Relative base so the same build works at https://<user>.github.io/yogai-phone-tracker/
// and on any other static host without edits.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
});
