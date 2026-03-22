/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        parchment: '#f5f0e8',
        ink: '#1a1a2e',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
