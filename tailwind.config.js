/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Rethink Sans', 'sans-serif']
      },
      colors: {
        midnight: '#071016',
        panel: { dark: '#0c1820' },
        sidebar: '#08141b',
        lumen: '#1f3640',
        row: '#162b34',
        teal: { accent: '#14B8A6', bg: '#12362f', text: '#cfe6e3' },
        primary: { text: '#e6f6f4', muted: '#89a4aa' },
        emerald: '#10b981',
        amber: '#f59e0b'
      }
    }
  },
  plugins: []
}
