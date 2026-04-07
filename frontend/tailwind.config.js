/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#080a0f',
          'bg-light': '#0d1117',
          'bg-lighter': '#111520',
          'bg-card': 'rgba(255, 255, 255, 0.045)',
          'border': 'rgba(255, 255, 255, 0.07)',
          'text': '#f0f1f5',
          'text-muted': '#8b8fa8',
          'text-dim': '#5a5e72',
        },
        accent: {
          orange: '#3b82f6',  // Primary blue (renamed from orange for legacy compat)
          pink: '#1d4ed8',    // Deep blue
          teal: '#10b981',    // Success green
          blue: '#3b82f6',    // Primary blue
          cyan: '#06b6d4',    // Cyan accent
          purple: '#6366f1',  // Indigo accent
        },
        glass: {
          white: 'rgba(255, 255, 255, 0.045)',
          'white-hover': 'rgba(255, 255, 255, 0.07)',
          border: 'rgba(255, 255, 255, 0.07)',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        display: ['Bricolage Grotesque', 'DM Sans', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-dark': 'linear-gradient(160deg, #080a0f 0%, #0d1117 50%, #080c12 100%)',
        'gradient-orange-pink': 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
        'gradient-teal-blue': 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)',
        'gradient-purple-blue': 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)',
        'gradient-mesh': 'radial-gradient(ellipse at 20% 20%, rgba(37,99,235,0.15) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(6,182,212,0.1) 0%, transparent 50%)',
      },
      boxShadow: {
        'glass': '0 8px 32px rgba(0, 0, 0, 0.4), 0 1px 0 rgba(255,255,255,0.06) inset',
        'glass-lg': '0 16px 56px rgba(0, 0, 0, 0.5), 0 1px 0 rgba(255,255,255,0.05) inset',
        'glow-orange': '0 0 20px rgba(59, 130, 246, 0.3)',
        'glow-teal': '0 0 20px rgba(16, 185, 129, 0.25)',
        'glow-blue': '0 0 20px rgba(37, 99, 235, 0.3)',
        'glow-cyan': '0 0 20px rgba(6, 182, 212, 0.25)',
        'inner-soft': 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.3)',
        'card-hover': '0 0 0 1px rgba(59, 130, 246, 0.3), 0 8px 32px rgba(59, 130, 246, 0.12)',
      },
      backdropBlur: {
        'glass': '14px',
      },
      animation: {
        'glow': 'glow 2s ease-in-out infinite alternate',
        'float': 'float 3.5s ease-in-out infinite',
        'shimmer': 'shimmer 1.8s ease-in-out infinite',
        'pulse-ring': 'pulseRing 2s ease-out infinite',
        'page-enter': 'pageReveal 0.45s cubic-bezier(0.22, 1, 0.36, 1) forwards',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 6px rgba(59, 130, 246, 0.3)' },
          '100%': { boxShadow: '0 0 20px rgba(59, 130, 246, 0.55)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulseRing: {
          '0%': { boxShadow: '0 0 0 0 rgba(59, 130, 246, 0.35)' },
          '70%': { boxShadow: '0 0 0 10px rgba(59, 130, 246, 0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(59, 130, 246, 0)' },
        },
        pageReveal: {
          'from': { opacity: '0', transform: 'translateY(10px)' },
          'to': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
