import type { Config } from 'tailwindcss';
import { heroui } from '@heroui/theme/plugin';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/@auth/**/*.{js,ts,jsx,tsx,mdx}',
    './src/@shared/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [heroui()],
};

export default config;
