'use client';

import { Children, cloneElement, isValidElement, type ReactNode } from 'react';

/**
 * One row of controls at one size (design-language rule 10, improvements 12).
 *
 * HeroUI controls read `size` from props only, so this clones its direct
 * children with the row's size when they do not set one. It is not magic: a
 * child that sets a *different* size is what `hero-nexus/one-size-per-row`
 * fails the build on, and a child that is not a HeroUI control (a Glyph, a
 * span) is left alone — `size` is only handed to components, never to DOM
 * elements, which would warn about an unknown attribute.
 *
 * `align` is the cross-axis: `end` lines up the bottoms of a labelled Select
 * beside an unlabelled Button, which is the row that usually goes wrong.
 */
export function ControlRow({
  size = 'sm',
  align = 'end',
  className = '',
  children,
}: {
  size?: 'sm' | 'md' | 'lg';
  align?: 'start' | 'center' | 'end';
  className?: string;
  children: ReactNode;
}) {
  const items =
    align === 'center'
      ? 'items-center'
      : align === 'start'
        ? 'items-start'
        : 'items-end';
  return (
    <div className={`flex flex-wrap gap-2 ${items} ${className}`.trim()}>
      {Children.map(children, child => {
        if (!isValidElement(child)) return child;
        if (typeof child.type === 'string') return child;
        const props = child.props as { size?: unknown };
        if (props.size !== undefined) return child;
        return cloneElement(child as React.ReactElement<{ size?: string }>, {
          size,
        });
      })}
    </div>
  );
}
