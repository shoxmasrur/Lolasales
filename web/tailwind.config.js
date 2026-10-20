/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /**
         * `ink` — interfeysning neytral shkalasi. Qiymatlar CSS
         * o'zgaruvchilaridan olinadi va mavzu almashganda o'zgaradi.
         *
         * NEGA SHUNDAY: kodda 580 dan ortiq joyda `bg-ink-950`,
         * `text-ink-500` kabi sinflar bor. Yorug' mavzu uchun ularning
         * har biriga `dark:` variant yozish o'rniga shkalaning O'ZI
         * almashadi — bitta joyda, hamma joyda darhol.
         *
         * `<alpha-value>` shart: `bg-ink-900/60` kabi shaffoflik
         * modifikatorlari ishlashda davom etsin.
         */
        ink: {
          50: 'rgb(var(--ink-50) / <alpha-value>)',
          100: 'rgb(var(--ink-100) / <alpha-value>)',
          200: 'rgb(var(--ink-200) / <alpha-value>)',
          300: 'rgb(var(--ink-300) / <alpha-value>)',
          400: 'rgb(var(--ink-400) / <alpha-value>)',
          500: 'rgb(var(--ink-500) / <alpha-value>)',
          600: 'rgb(var(--ink-600) / <alpha-value>)',
          700: 'rgb(var(--ink-700) / <alpha-value>)',
          800: 'rgb(var(--ink-800) / <alpha-value>)',
          900: 'rgb(var(--ink-900) / <alpha-value>)',
          950: 'rgb(var(--ink-950) / <alpha-value>)',
        },
        /**
         * Ma'noli ranglarning YENGIL soyalari — faqat MATN uchun.
         *
         * `-100…-400` to'q fon uchun tanlangan: oq fonda ular oqarib
         * ketadi va o'qilmaydi (2026-08-11 da sariq ogohlantirishlarda
         * ko'rindi). Shu sabab ular ham `ink` kabi mavzuga bog'landi.
         *
         * `-500` va undan to'qlari TEGILMAYDI: ular fon va chegara uchun
         * shaffoflik bilan ishlatiladi (`bg-amber-500/10`) va ikkala
         * fonda ham to'g'ri ko'rinadi.
         */
        amber: {
          100: 'rgb(var(--amber-100) / <alpha-value>)',
          200: 'rgb(var(--amber-200) / <alpha-value>)',
          300: 'rgb(var(--amber-300) / <alpha-value>)',
          400: 'rgb(var(--amber-400) / <alpha-value>)',
        },
        red: {
          100: 'rgb(var(--red-100) / <alpha-value>)',
          200: 'rgb(var(--red-200) / <alpha-value>)',
          300: 'rgb(var(--red-300) / <alpha-value>)',
          400: 'rgb(var(--red-400) / <alpha-value>)',
        },
        emerald: {
          100: 'rgb(var(--emerald-100) / <alpha-value>)',
          200: 'rgb(var(--emerald-200) / <alpha-value>)',
          300: 'rgb(var(--emerald-300) / <alpha-value>)',
          400: 'rgb(var(--emerald-400) / <alpha-value>)',
        },
        orange: {
          200: 'rgb(var(--orange-200) / <alpha-value>)',
          300: 'rgb(var(--orange-300) / <alpha-value>)',
        },
        brand: {
          50: '#eef6ff',
          100: '#d9ebff',
          400: '#4a9eff',
          500: '#2b83f0',
          600: '#1a66cc',
          700: '#1852a3',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
