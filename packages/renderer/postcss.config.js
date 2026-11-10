import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const dir = dirname(fileURLToPath(import.meta.url))

export default {
  plugins: [
    tailwindcss({
      content: [
        resolve(dir, 'index.html'),
        resolve(dir, 'src/**/*.{js,ts,jsx,tsx}'),
      ],
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            surface: {
              DEFAULT: 'var(--surface)',
              raised: 'var(--surface-raised)',
              overlay: 'var(--surface-overlay)',
              border: 'var(--surface-border)',
            },
            accent: {
              DEFAULT: 'var(--accent)',
              hover: 'var(--accent-hover)',
              muted: 'var(--accent-muted)',
            },
            text: {
              primary: 'var(--text-primary)',
              secondary: 'var(--text-secondary)',
              muted: 'var(--text-muted)',
            },
          },
        },
      },
    }),
    autoprefixer(),
  ],
}
