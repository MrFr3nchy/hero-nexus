'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { type ReactNode } from 'react';

/**
 * Small shared motion layer. Everything here collapses to a no-op when the
 * viewer prefers reduced motion, so consumers never branch on it themselves.
 */

export function Reveal({
  children,
  delay = 0,
  y = 8,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/**
 * A card that lifts 1px on hover. The scroll-in mount animation is opt-in via
 * `reveal` (default off) — design rule 4 bans per-card fade-in-on-scroll as a
 * default, since scattered motion is what makes a page read as generated.
 */
export function LiftCard({
  children,
  className,
  reveal = false,
}: {
  children: ReactNode;
  className?: string;
  reveal?: boolean;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      {...(reveal
        ? {
            initial: { opacity: 0, y: 6 },
            whileInView: { opacity: 1, y: 0 },
            viewport: { once: true, margin: '-40px' },
          }
        : {})}
      whileHover={{ y: -1 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

/** Slow vertical float for empty-state icons. */
export function Float({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      animate={{ y: [-3, 3, -3] }}
      transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
    >
      {children}
    </motion.div>
  );
}

export { motion, useReducedMotion };
