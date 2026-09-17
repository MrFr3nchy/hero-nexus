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

  return (
    <Button
      isIconOnly
      size="sm"
      variant="light"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`text-ink-muted data-[hover=true]:text-ink ${className ?? ''}`}
      onPress={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {mounted && <Glyph name={isDark ? 'sun' : 'moon'} size={18} />}
    </Button>
  );
}
