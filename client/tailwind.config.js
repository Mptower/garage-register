/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        grease: '#15100d',
        board: '#2e221a',
        cream: { DEFAULT: '#f4ead6', 2: '#e9dbbe', 3: '#d8c5a1' },
        ink: { DEFAULT: '#241a12', 2: '#5d4a35', 3: '#8a7254' },
        enamel: { DEFAULT: '#b4232e', light: '#d13541', dark: '#7a141d' },
        petrol: { DEFAULT: '#1a505a', light: '#276e7a', dark: '#0d3038' },
        brass: { DEFAULT: '#d9a441', hi: '#f7df9e', lo: '#8a6417' },
        chrome: { hi: '#ffffff', 1: '#dde3e9', 2: '#a3abb3', 3: '#6b737b', 4: '#3f464d' },
        // Plate colours sampled from a real Wisconsin Collector plate.
        plate: { field: '#6b8795', char: '#a8392a' },
        ok: '#3f6b36',
        warn: '#b9771f',
        bad: '#9e2a1e',
      },
      fontFamily: {
        sign: ['Alfa Slab One', 'Georgia', 'serif'],
        stencil: ['Staatliches', 'Impact', 'sans-serif'],
        ui: ['Oswald', 'system-ui', 'sans-serif'],
        type: ['Special Elite', 'Courier New', 'monospace'],
        neon: ['Sacramento', 'cursive'],
      },
      boxShadow: {
        card: '0 18px 40px rgba(0,0,0,.62), inset 0 1px 0 rgba(255,255,255,.5)',
        plate: '0 9px 20px rgba(0,0,0,.72), inset 0 1px 0 rgba(255,255,255,.85)',
      },
    },
  },
  plugins: [],
};
