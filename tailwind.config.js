/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#FAFAF7',
        ink: '#101312',
        petrol: {
          50: '#EDF7F4', 100: '#D4EDE6', 200: '#A6DBCC', 300: '#6FC2AC',
          500: '#168569', 600: '#0E6F5C', 700: '#0B5949', 800: '#0A463B', 900: '#083A31',
        },
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
