/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './extension/sidepanel/index.html',
    './extension/sidepanel/src/**/*.{ts,tsx,js,jsx}',
    './extension/popup/index.html'
  ],
  theme: {
    extend: {
      colors: {
        scribbly: {
          primary: '#2563eb',
          surface: '#0f172a',
          accent: '#facc15'
        }
      }
    }
  },
  plugins: []
};
