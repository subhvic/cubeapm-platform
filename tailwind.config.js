/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces (dark mode — the only mode for now)
        canvas: '#151820',
        card: '#080B11',
        panel: '#171C28',
        'panel-2': '#1B2130',
        raised: '#1E2431',

        // Borders
        'border-subtle': '#232B3B',
        'border-panel': '#2A3346',
        'border-strong': '#39445C',

        // Text
        'text-primary': '#F1F3F9',
        'text-secondary': '#9CA6BF',
        'text-muted': '#616C86',

        // Brand
        brand: '#3B82F6',
        'brand-muted': '#182A4E',

        // Semantic status
        healthy: '#22C55E',
        warning: '#F59E0B',
        critical: '#EF4444',
        info: '#60A5FA',
        neutral: '#616C86',
      },
      fontFamily: {
        sans: ['Rubik', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        sm: '6px',
        md: '9px',
        lg: '10px',
        card: '12px',
      },
      fontSize: {
        'kpi-value': ['30px', { lineHeight: '1.1', fontWeight: '600' }],
        'summary-pill': ['25px', { lineHeight: '1.1', fontWeight: '700' }],
        'chart-value': ['20px', { lineHeight: '1.2', fontWeight: '700' }],
        'page-title': ['15px', { lineHeight: '1.3', fontWeight: '600' }],
        'drawer-title': ['14px', { lineHeight: '1.3', fontWeight: '600' }],
        'panel-header': ['13.5px', { lineHeight: '1.4', fontWeight: '600' }],
        'body': ['12.5px', { lineHeight: '1.45', fontWeight: '400' }],
        'caption': ['11px', { lineHeight: '1.3', fontWeight: '400' }],
      },
      width: {
        'nav-expanded': '222px',
        'nav-collapsed': '66px',
      },
      spacing: {
        'nav-expanded': '222px',
        'nav-collapsed': '66px',
      },
    },
  },
  plugins: [],
}
