/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      keyframes: {
        /* Battle.

           Two families here. `ready*` loops while the server resolves the
           round — breathing, not fighting, because the real action is the
           replay that follows. `dash*`, `impact`, `recoil`, `faint` and
           `enterField` are one-shots fired by that replay.

           The player's sprite is mirrored, so every keyframe it uses carries
           its own scaleX(-1): a transform animation would otherwise wipe out
           a -scale-x-100 utility mid-flight. */
        readyRight: {
          '0%, 100%': { transform: 'translate(0, 0) scaleX(-1)' },
          '50%': { transform: 'translate(3px, -3px) scaleX(-1)' },
        },
        readyLeft: {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '50%': { transform: 'translate(-3px, -3px)' },
        },
        dashRight: {
          '0%': { transform: 'translate(0, 0) scaleX(-1)' },
          '18%': { transform: 'translate(-14px, 2px) scale(0.94) scaleX(-1)' },
          '45%': { transform: 'translate(74px, -14px) scale(1.12) scaleX(-1)' },
          '60%': { transform: 'translate(74px, -14px) scale(1.12) scaleX(-1)' },
          '100%': { transform: 'translate(0, 0) scaleX(-1)' },
        },
        dashLeft: {
          '0%': { transform: 'translate(0, 0)' },
          '18%': { transform: 'translate(14px, 2px) scale(0.94)' },
          '45%': { transform: 'translate(-74px, 14px) scale(1.12)' },
          '60%': { transform: 'translate(-74px, 14px) scale(1.12)' },
          '100%': { transform: 'translate(0, 0)' },
        },
        recoilRight: {
          '0%': { transform: 'translate(0, 0) scaleX(-1)', filter: 'none' },
          '12%': { transform: 'translate(-12px, 0) scaleX(-1)', filter: 'brightness(3) saturate(0)' },
          '30%': { transform: 'translate(7px, 0) scaleX(-1)', filter: 'brightness(1.8)' },
          '50%': { transform: 'translate(-4px, 0) scaleX(-1)', filter: 'brightness(2.2) saturate(0)' },
          '70%': { transform: 'translate(2px, 0) scaleX(-1)', filter: 'none' },
          '100%': { transform: 'translate(0, 0) scaleX(-1)', filter: 'none' },
        },
        recoilLeft: {
          '0%': { transform: 'translate(0, 0)', filter: 'none' },
          '12%': { transform: 'translate(12px, 0)', filter: 'brightness(3) saturate(0)' },
          '30%': { transform: 'translate(-7px, 0)', filter: 'brightness(1.8)' },
          '50%': { transform: 'translate(4px, 0)', filter: 'brightness(2.2) saturate(0)' },
          '70%': { transform: 'translate(-2px, 0)', filter: 'none' },
          '100%': { transform: 'translate(0, 0)', filter: 'none' },
        },
        impact: {
          '0%': { opacity: '0', transform: 'translate(-50%, -50%) scale(0.2)' },
          '25%': { opacity: '1' },
          '100%': { opacity: '0', transform: 'translate(-50%, -50%) scale(2.4)' },
        },
        spark: {
          '0%': { opacity: '1', transform: 'translate(-50%, -50%) scale(0.4) rotate(0deg)' },
          '100%': { opacity: '0', transform: 'translate(-50%, -50%) scale(1.8) rotate(120deg)' },
        },
        floatUp: {
          '0%': { opacity: '0', transform: 'translate(-50%, 6px) scale(0.7)' },
          '18%': { opacity: '1', transform: 'translate(-50%, -6px) scale(1.15)' },
          '100%': { opacity: '0', transform: 'translate(-50%, -44px) scale(1)' },
        },
        faintRight: {
          '0%': { opacity: '1', transform: 'translate(0, 0) scaleX(-1)' },
          '100%': { opacity: '0', transform: 'translate(0, 34px) scaleY(0.55) scaleX(-1)' },
        },
        faintLeft: {
          '0%': { opacity: '1', transform: 'translate(0, 0)' },
          '100%': { opacity: '0', transform: 'translate(0, 34px) scaleY(0.55)' },
        },
        enterRight: {
          '0%': { opacity: '0', transform: 'translate(-40px, 0) scaleX(-1)' },
          '100%': { opacity: '1', transform: 'translate(0, 0) scaleX(-1)' },
        },
        enterLeft: {
          '0%': { opacity: '0', transform: 'translate(40px, 0)' },
          '100%': { opacity: '1', transform: 'translate(0, 0)' },
        },
        arenaShake: {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '20%': { transform: 'translate(-6px, 3px)' },
          '40%': { transform: 'translate(5px, -3px)' },
          '60%': { transform: 'translate(-4px, -2px)' },
          '80%': { transform: 'translate(3px, 2px)' },
        },
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
        'ready-right': 'readyRight 1.6s ease-in-out infinite',
        'ready-left': 'readyLeft 1.6s ease-in-out infinite 0.8s',
        'dash-right': 'dashRight 0.75s cubic-bezier(0.3, 0, 0.2, 1) 1',
        'dash-left': 'dashLeft 0.75s cubic-bezier(0.3, 0, 0.2, 1) 1',
        'recoil-right': 'recoilRight 0.5s ease-out 1',
        'recoil-left': 'recoilLeft 0.5s ease-out 1',
        impact: 'impact 0.5s ease-out forwards',
        spark: 'spark 0.45s ease-out forwards',
        'float-up': 'floatUp 1s ease-out forwards',
        'faint-right': 'faintRight 0.55s ease-in forwards',
        'faint-left': 'faintLeft 0.55s ease-in forwards',
        'enter-right': 'enterRight 0.35s ease-out 1',
        'enter-left': 'enterLeft 0.35s ease-out 1',
        'arena-shake': 'arenaShake 0.4s ease-out 1',
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