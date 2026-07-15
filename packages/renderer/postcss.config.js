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
              DEFAULT: '#1e1e1e',
              raised: '#252526',
              overlay: '#2d2d2d',
              border: '#3c3c3c',
            },
            accent: {
              DEFAULT: '#0078d4',
              hover: '#1a86d9',
              muted: '#264f78',
            },
            text: {
              primary: '#cccccc',
              secondary: '#858585',
              muted: '#6e6e6e',
            },
          },
        },
      },
    }),
    autoprefixer(),
  ],
}
