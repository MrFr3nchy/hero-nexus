// HeroUI theme — "Parchment & Ink".
// Keep these values in sync with the CSS tokens in `src/app/globals.css`.
import { heroui } from '@heroui/react';

export default heroui({
  themes: {
    light: {
      colors: {
        background: '#faf6ef',
        foreground: '#2b2620',
        divider: '#e4dccb',
        focus: '#b4894a',
        content1: '#ffffff',
        content2: '#f3ede1',
        content3: '#eee6d6',
        content4: '#e4dccb',
        default: {
          DEFAULT: '#e4dccb',
          foreground: '#2b2620',
          100: '#f6f1e6',
          200: '#eee6d6',
          300: '#e4dccb',
          400: '#ccbfa3',
          500: '#a99a7c',
        },
        primary: {
          DEFAULT: '#b4894a',
          foreground: '#ffffff',
          200: '#e8d6b8',
          400: '#c9a26a',
          600: '#96702f',
        },
        secondary: {
          DEFAULT: '#4a6076',
          foreground: '#ffffff',
        },
        success: { DEFAULT: '#3f7d55', foreground: '#ffffff' },
        warning: { DEFAULT: '#b07d33', foreground: '#ffffff' },
        danger: { DEFAULT: '#a23b34', foreground: '#ffffff' },
      },
    },
    dark: {
      colors: {
        background: '#16130f',
        foreground: '#ede7da',
        divider: '#33291d',
        focus: '#d9b061',
        content1: '#1e1a14',
        content2: '#262019',
        content3: '#2f271d',
        content4: '#3a3024',
        default: {
          DEFAULT: '#2f271d',
          foreground: '#ede7da',
          100: '#262019',
          200: '#2f271d',
          300: '#3a3024',
          400: '#544636',
          500: '#77654f',
        },
        primary: {
          DEFAULT: '#d9b061',
          foreground: '#1a1710',
          200: '#3a3222',
          400: '#b98f3f',
          600: '#e8c988',
        },
        secondary: {
          DEFAULT: '#8aa4bd',
          foreground: '#14131a',
        },
        success: { DEFAULT: '#6bbf8a', foreground: '#0e1a12' },
        warning: { DEFAULT: '#d6a253', foreground: '#1a1206' },
        danger: { DEFAULT: '#d9756c', foreground: '#1a0a08' },
      },
    },
  },
  layout: {
    radius: { small: '0.375rem', medium: '0.625rem', large: '0.875rem' },
    borderWidth: { small: '1px', medium: '1px', large: '2px' },
    disabledOpacity: '0.45',
  },
});
