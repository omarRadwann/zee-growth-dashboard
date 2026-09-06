import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath, URL } from 'node:url';
// The user explicitly chose GitHub Pages. Only the static client is published.
export default defineConfig({ base: '/zee-growth-dashboard/', plugins: [react()], resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } }, css: { postcss: { plugins: [tailwindcss()] } }, build: { outDir: 'docs', emptyOutDir: true, sourcemap: false }, server: { host: '127.0.0.1', port: 5174, strictPort: true } });
