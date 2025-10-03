module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
    "./src/app/**/*.{js,ts,jsx,tsx}"
  ],
  safelist: [
    'bg-emerald-500/10',
    'text-emerald-300',
    'border-emerald-400/60',
    'bg-amber-500/10',
    'text-amber-300',
    'border-amber-400/60',
    'bg-red-500/10',
    'text-red-300',
    'border-red-400/60',
  ],
  theme: { extend: {} },
  plugins: []
}
