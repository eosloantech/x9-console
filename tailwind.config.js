/** @type {import('tailwindcss').Config} */
// Paleta canônica Eos Loan (prototype :root) — não inventar tons fora daqui.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#EEF2F8',      // bg de página Eos
        ink: '#414141',        // texto (dark)
        mute: '#6B7C93',
        line: '#E2EAF3',
        navy: '#2F5496',
        gold: '#FEBE00',
        eosgreen: '#92D050',
        petrol: {              // escala azul Eos (mantém os nomes de classe existentes)
          50: '#F4F7FB', 100: '#EDF5F9', 200: '#D6E7FA', 300: '#A9CDF4',
          500: '#3084E7', 600: '#3084E7', 700: '#2F5496', 800: '#24406E', 900: '#1A2F52',
        },
      },
      fontFamily: {
        display: ['"Segoe UI"', 'Calibri', 'Arial', 'system-ui', 'sans-serif'],
        sans: ['"Segoe UI"', 'Calibri', 'Arial', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        eos: '0 3px 14px rgba(15,27,45,.05)',
      },
    },
  },
  plugins: [],
};
