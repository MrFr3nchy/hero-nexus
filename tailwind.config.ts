import type { Config } from 'tailwindcss';
import { heroui } from '@heroui/theme/plugin';

const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/@auth/**/*.{js,ts,jsx,tsx,mdx}',
    './src/@shared/**/*.{js,ts,jsx,tsx,mdx}',
    './src/@creator/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: { extend: {} },
  plugins: [heroui()],
};

export default config;
