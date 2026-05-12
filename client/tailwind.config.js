/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{js,jsx}'],
    theme: {
      extend: {
        colors: {
          brand: {
            50: '#f0f4ff',
            100: '#e0eaff',
            500: '#4f6ef7',
            600: '#3b5bdb',
            700: '#2f4ac0',
          },
          dark: {
            900: '#0a0a0f',
            800: '#111118',
            700: '#1a1a25',
            600: '#22222f',
            500: '#2e2e3e',
          },
        },
        fontFamily: {
          sans: ['DM Sans', 'sans-serif'],
          mono: ['JetBrains Mono', 'monospace'],
        },
        animation: {
          'slide-up': 'slideUp 0.3s ease-out',
          'fade-in': 'fadeIn 0.2s ease-out',
          'card-left': 'cardLeft 0.4s ease-out forwards',
          'card-right': 'cardRight 0.4s ease-out forwards',
        },
        keyframes: {
          slideUp: { from: { transform: 'translateY(20px)', opacity: 0 }, to: { transform: 'translateY(0)', opacity: 1 } },
          fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
          cardLeft: { to: { transform: 'translateX(-120%) rotate(-20deg)', opacity: 0 } },
          cardRight: { to: { transform: 'translateX(120%) rotate(20deg)', opacity: 0 } },
        },
      },
    },
    plugins: [],
  };