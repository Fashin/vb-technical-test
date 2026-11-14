/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      keyframes: {
        /* Booster opening. The colour comes from --glow, set per card, so one
           keyframe set covers every rarity. */
        packShake: {
          '0%, 100%': { transform: 'translateX(0) rotate(0deg)' },
          '20%': { transform: 'translateX(-4px) rotate(-3deg)' },
          '40%': { transform: 'translateX(4px) rotate(3deg)' },
          '60%': { transform: 'translateX(-3px) rotate(-2deg)' },
          '80%': { transform: 'translateX(3px) rotate(2deg)' },
        },
        packBurst: {
          '0%': { opacity: '0', transform: 'scale(0.2)' },
          '35%': { opacity: '0.95' },
          '100%': { opacity: '0', transform: 'scale(2.6)' },
        },
        cardReveal: {
          '0%': { opacity: '0', transform: 'rotateY(90deg) scale(0.8)' },
          '60%': { opacity: '1', transform: 'rotateY(-8deg) scale(1.06)' },
          '100%': { opacity: '1', transform: 'rotateY(0deg) scale(1)' },
        },
        glowPulse: {
          '0%': { boxShadow: '0 0 0 0 var(--glow)' },
          '45%': { boxShadow: '0 0 22px 6px var(--glow)' },
          '100%': { boxShadow: '0 0 0 0 transparent' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        typing: {
          "0%": {
            width: "0%",
            visibility: "hidden"
          },
          "100%": {
            width: "100%"
          }  
        },
      },
      animation: {
        'pack-shake': 'packShake 0.6s ease-in-out infinite',
        'pack-burst': 'packBurst 0.7s ease-out forwards',
        'card-reveal': 'cardReveal 0.45s cubic-bezier(0.2, 0.9, 0.3, 1.2) both',
        'glow-pulse': 'glowPulse 1.1s ease-out both',
        shimmer: 'shimmer 2s infinite',
        typing: 'typing 1s steps(20)',
      },
    },
  },
  plugins: [],
}