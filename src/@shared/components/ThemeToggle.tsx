'use client';

import { Button } from '@heroui/react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

import { Glyph } from './ui';

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === 'dark';

  // Lighting or snuffing the candle: every surface takes the new palette
  // over a third of a second instead of blinking to it. The class is on
  // the root only for that moment, so nothing else ever pays for it, and
  // it is skipped outright for anyone who asked for less motion.
  const turn = () => {
    const root = document.documentElement;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!still) {
      root.classList.add('theme-turning');
      window.setTimeout(() => root.classList.remove('theme-turning'), 400);
    }
    setTheme(isDark ? 'light' : 'dark');
  };

  return (
    <Button
      isIconOnly
      size="sm"
      variant="light"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`text-ink-muted data-[hover=true]:text-ink ${className ?? ''}`}
      onPress={turn}
    >
      {mounted && <Glyph name={isDark ? 'sun' : 'moon'} size={18} />}
    </Button>
  );
}
