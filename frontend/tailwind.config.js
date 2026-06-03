/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0d0d0d',  // page background — dark charcoal
          900: '#000000',  // nav sidebar + header — Black
          800: '#FFFFFF',  // card/panel surfaces — White
          700: '#E0E0E0',  // borders
          600: '#BBBBBB',  // medium muted
          500: '#888888',  // muted text
        },
        brand: {
          400: '#C44E54',  // lighter Auburn Red
          500: '#A72C32',  // Auburn Red primary
          600: '#8B2328',  // darker Auburn Red
          700: '#6F1C21',  // darkest Auburn Red
        },
        violet: { 400: '#A78BFA', 500: '#8B5CF6', 600: '#7C3AED' },
        jade:   { 400: '#34D399', 500: '#10B981', 600: '#059669' },
        amber:  { 400: '#FCD34D', 500: '#F59E0B', 600: '#D97706' },
        rose:   { 400: '#FB7185', 500: '#EF4444', 600: '#DC2626' },
        sky:    { 400: '#38BDF8', 500: '#0EA5E9' },
        cyan:   { 400: '#22D3EE', 500: '#06B6D4' },
      },
      fontFamily: {
        sans: ['Josefin Sans', 'Gudea', 'system-ui', 'sans-serif'],
      },
      animation: {
        'ble-ring':   'bleRing 2s ease-out infinite',
        'ble-ring-2': 'bleRing 2s ease-out infinite 0.6s',
        'ble-ring-3': 'bleRing 2s ease-out infinite 1.2s',
        'float':      'float 4s ease-in-out infinite',
        'slide-up':   'slideUp 0.35s ease-out',
        'fade-in':    'fadeIn 0.25s ease-out',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
      },
      keyframes: {
        bleRing: { '0%': { transform: 'scale(1)', opacity: '0.7' }, '100%': { transform: 'scale(3)', opacity: '0' } },
        float:   { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(16px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        fadeIn:  { from: { opacity: '0' }, to: { opacity: '1' } },
      },
    },
  },
  plugins: [],
}
