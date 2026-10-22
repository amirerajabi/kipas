import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// A strict Content-Security-Policy for the built app only: Vite's dev server injects inline scripts (React refresh),
// which the policy would block. The vault never talks to the network, so connect-src stays 'none' in production.
const csp: Plugin = {
  name: 'kipas-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace(
      '<meta charset="UTF-8" />',
      `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'" />`,
    ),
};

export default defineConfig({
  // Relative asset URLs: the Electron build is loaded from disk.
  base: './',
  plugins: [react(), csp],
  server: { port: 5174, strictPort: true, fs: { allow: ['..'] } },
  build: { target: 'es2022' },
});
