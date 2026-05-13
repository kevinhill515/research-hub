import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  /* Private GitHub Pages (Silvercrest's plan) serves the site at the
     root of a randomized hostname like
     `<random>.pages.github.io/` — no /<repo>/ subpath. Use root
     base so asset URLs resolve. If you ever switch to public Pages
     under the standard `<org>.github.io/research-hub/` URL, change
     this back to '/research-hub/' before deploying. */
  base: '/',
  build: {
    rollupOptions: {
      output: {
        /* Split heavy/rarely-used libraries into their own chunks so the
         * initial main.js stays small. The biggest win is recharts (~150KB
         * gz) — only needed once a user lands on a dashboard tab. Users
         * who only browse Companies / Portfolios never download it.
         *
         * Function form so we catch transitive deps (recharts pulls in
         * d3 under several paths). */
        manualChunks(id) {
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3')) {
            return 'recharts';
          }
          if (id.includes('node_modules/react-dom')) {
            return 'react-dom';
          }
          if (id.includes('node_modules/@supabase')) {
            return 'supabase';
          }
        },
      },
    },
  },
})
