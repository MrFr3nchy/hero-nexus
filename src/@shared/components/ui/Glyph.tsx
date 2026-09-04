import { type SVGProps } from 'react';

/**
 * The house icon set — drawn here rather than pulled from a font or an icon
 * CDN, for three reasons that the emoji this replaces all failed:
 *
 * 1. They take the token colours. Every path is `currentColor`, so a glyph in
 *    `text-ink-subtle` reads as ink and a glyph in `text-gold` reads as gold,
 *    in both the parchment and the candlelight palette. An emoji is a fixed
 *    full-colour bitmap that ignores the theme and shouts over it.
 * 2. They look the same for everyone at the table. Emoji are rendered by the
 *    operating system, so the DM on a Mac and a player on Windows were looking
 *    at visibly different apps.
 * 3. They ship with the app. Hero Nexus is self-hosted and makes no outbound
 *    calls; an icon set fetched from a CDN at runtime would be blank on a box
 *    without internet.
 *
 * House style, so a new glyph doesn't stand out: a 24×24 box, stroke-drawn at
 * 1.5 with round caps and joins, no fill except a couple of tiny solid accents
 * (a pupil, a coin face). Draw for legibility at 16px — detail below that is
 * mud. Keep them iconic rather than illustrative; the scene-scale drawing that
 * carries mood lives in `scenes.tsx`.
 */

export type GlyphName =
  // canon kinds
  | 'person'
  | 'dragon'
  | 'map'
  | 'banner'
  | 'sword'
  | 'sparkle'
  | 'scroll'
  | 'notebook'
  // downtime kinds
  | 'coins'
  | 'hammer'
  | 'magnifier'
  | 'target'
  | 'tankard'
  | 'letter'
  | 'compass'
  | 'candle'
  | 'bed'
  | 'holy-symbol'
  | 'question'
  // homebrew kinds
  | 'crossed-swords'
  | 'orb'
  | 'shield'
  | 'helix'
  | 'crown'
  | 'star'
  // shelves and general furniture
  | 'books'
  | 'chest'
  | 'anvil'
  | 'hourglass'
  | 'tome'
  | 'quill'
  | 'die'
  | 'key';

/** Every glyph's artwork, drawn inside a 24×24 box. */
const PATHS: Record<GlyphName, React.ReactNode> = {
  person: (
    <>
      <circle cx="12" cy="7.5" r="3.75" />
      <path d="M4.5 20.5c0-3.9 3.4-6.5 7.5-6.5s7.5 2.6 7.5 6.5" />
    </>
  ),
  dragon: (
    <>
      {/* horns swept back over a tapering muzzle — a full dragon in profile
          turns to mud at 16px, a horned head does not */}
      <path d="M8.4 7.6 3.6 1.8l.7 6.6" />
      <path d="M15.6 7.6 20.4 1.8l-.7 6.6" />
      <path d="M12 6.1c3.6 0 6.4 2.3 6.4 5.3 0 1.9-1 3.6-2.6 4.7l-.6 4.4c0 .9-1.4 1.6-3.2 1.6s-3.2-.7-3.2-1.6l-.6-4.4c-1.6-1.1-2.6-2.8-2.6-4.7 0-3 2.8-5.3 6.4-5.3Z" />
      <circle cx="9.9" cy="11.5" r=".95" fill="currentColor" stroke="none" />
      <circle cx="14.1" cy="11.5" r=".95" fill="currentColor" stroke="none" />
    </>
  ),
  map: (
    <>
      <path d="M9 4.5 3.5 6.8v12.7L9 17.2l6 2.3 5.5-2.3V4.5L15 6.8Z" />
      <path d="M9 4.5v12.7M15 6.8v12.7" />
    </>
  ),
  banner: (
    <>
      <path d="M6 3v18" />
      <path d="M6 4.5h13l-2.6 4 2.6 4H6" />
    </>
  ),
  sword: (
    <>
      <path d="M12 2.2 14.6 7v8.2H9.4V7Z" />
      <path d="M6.6 15.2h10.8M12 15.2v4.2" />
      <circle cx="12" cy="20.8" r="1.5" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 2.5c.9 4.6 2 5.7 6.6 6.6-4.6.9-5.7 2-6.6 6.6-.9-4.6-2-5.7-6.6-6.6 4.6-.9 5.7-2 6.6-6.6Z" />
      <path d="M17.5 15.5c.4 2 .9 2.5 2.9 2.9-2 .4-2.5.9-2.9 2.9-.4-2-.9-2.5-2.9-2.9 2-.4 2.5-.9 2.9-2.9Z" />
    </>
  ),
  scroll: (
    <>
      <path d="M7.5 3.5h13" />
      <path d="M20.5 3.5c-1.7 0-3 1.3-3 3v11c0 1.7-1.3 3-3 3h-11" />
      <path d="M3.5 20.5c1.7 0 3-1.3 3-3V6.5c0-1.7 1.3-3 3-3" />
      <path d="M10.5 9h6M10.5 12.5h6M10.5 16h3.5" />
    </>
  ),
  notebook: (
    <>
      <path d="M6.5 3.5h13v17h-13a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z" />
      <path d="M8.5 3.5v17" />
      <path d="M11.5 8.5h5M11.5 12h5" />
    </>
  ),

  coins: (
    <>
      <ellipse cx="8.5" cy="7.5" rx="6.5" ry="2.6" />
      <path d="M2 7.5v4.6c0 1.4 2.9 2.6 6.5 2.6s6.5-1.2 6.5-2.6V7.5" />
      <circle cx="17" cy="16" r="4.8" />
    </>
  ),
  hammer: (
    <>
      <rect x="2.5" y="3.5" width="13.5" height="6" rx="2" />
      <path d="M16 5h3a1.5 1.5 0 0 1 1.5 1.5v.5A1.5 1.5 0 0 1 19 8.5h-3" />
      <path d="M9.5 9.5v11" />
    </>
  ),
  magnifier: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.4 15.4 5.1 5.1" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  tankard: (
    <>
      <path d="M4.5 8h10v10.5a2.5 2.5 0 0 1-2.5 2.5H7a2.5 2.5 0 0 1-2.5-2.5Z" />
      <path d="M14.5 10.5H17a3 3 0 0 1 0 6h-2.5" />
      <path d="M4.5 8c0-1.1.9-2 2.1-2.1.4-1.3 1.6-2.2 3-2.2s2.6.9 3 2.2c1.2.1 2.1 1 2.1 2.1" />
      <path d="M4.5 11.5h10" />
    </>
  ),
  letter: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m3.5 7.5 8.5 6 8.5-6" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15.5 8.5-2 5.2-5.2 2 2-5.2Z" />
    </>
  ),
  candle: (
    <>
      <path d="M12 2.5c1.8 1.7 2.6 3 2.6 4.2a2.6 2.6 0 0 1-5.2 0c0-1.2.8-2.5 2.6-4.2Z" />
      <rect x="8.5" y="11" width="7" height="10" rx="1.5" />
      <path d="M12 9.2V11" />
    </>
  ),
  bed: (
    <>
      <path d="M2.5 8.5v13M2.5 13h19v8.5M21.5 17.5h-19" />
      <circle cx="7" cy="10" r="2.2" />
      <path d="M11 13c0-1.4 1.1-2.5 2.5-2.5h5.5c1.4 0 2.5 1.1 2.5 2.5" />
    </>
  ),
  'holy-symbol': (
    <>
      {/* a holy symbol: prayer and ritual, and it survives 16px */}
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v3.5M12 18v3.5M2.5 12H6m12 0h3.5" />
      <path d="m5.3 5.3 2.5 2.5m8.4 8.4 2.5 2.5m0-13.4-2.5 2.5M7.8 16.2l-2.5 2.5" />
    </>
  ),
  question: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.4A2.5 2.5 0 0 1 14.5 10c0 1.7-2.5 2-2.5 3.8" />
      <circle cx="12" cy="16.8" r=".9" fill="currentColor" stroke="none" />
    </>
  ),

  'crossed-swords': (
    <>
      <path d="M3.5 3.5h3l11 11-3 3-11-11Z" />
      <path d="M20.5 3.5h-3l-11 11 3 3 11-11Z" />
    </>
  ),
  orb: (
    <>
      <circle cx="12" cy="9.5" r="6.5" />
      <path d="m12 6 .95 2.55L15.5 9.5l-2.55.95L12 13l-.95-2.55L8.5 9.5l2.55-.95Z" />
      <path d="M6.5 18h11c0 1.9-2.4 3.5-5.5 3.5S6.5 19.9 6.5 18Z" />
    </>
  ),
  shield: (
    <>
      <path d="M12 2.8 4.5 5.5v6.2c0 4.4 3 8 7.5 9.5 4.5-1.5 7.5-5.1 7.5-9.5V5.5Z" />
      <path d="M12 7v8" />
    </>
  ),
  helix: (
    <>
      <path d="M7 2.5c0 5 10 6 10 10s-10 5-10 9" />
      <path d="M17 2.5c0 5-10 6-10 10s10 5 10 9" />
      <path d="M8.4 7.5h7.2M8.4 16.5h7.2" />
    </>
  ),
  crown: (
    <>
      <path d="M3.5 17 5 6.5l4 3.5 3-5.5 3 5.5 4-3.5L20.5 17Z" />
      <path d="M3.9 20.5h16.2" />
    </>
  ),
  star: (
    <path d="m12 2.8 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5-4.7-4.6 6.5-.9Z" />
  ),

  books: (
    <>
      <rect x="3.5" y="5" width="4.5" height="15" rx="1" />
      <rect x="9.5" y="5" width="4.5" height="15" rx="1" />
      <path d="m16.2 6.6 4 1.1-3.3 12.1-4-1.1Z" />
    </>
  ),
  chest: (
    <>
      <path d="M3.5 11.5a8.5 8.5 0 0 1 17 0v9h-17Z" />
      <path d="M3.5 13h17" />
      <rect x="10.3" y="11.5" width="3.4" height="4.5" rx="1" />
    </>
  ),
  anvil: (
    <>
      <path d="M2 9.8 5.5 7.5H19c0 2-1.6 3.6-3.6 3.6h-1.7l.6 3.4h1.9l1.3 4H6.5l1.3-4h1.9l.6-3.4H5.5A3.5 3.5 0 0 1 2 9.8Z" />
      <path d="M4.5 21.5h15" />
    </>
  ),
  hourglass: (
    <>
      <path d="M6 2.8h12M6 21.2h12" />
      <path d="M7.5 2.8v3.4c0 2.3 4.5 3.9 4.5 5.8s-4.5 3.5-4.5 5.8v3.4" />
      <path d="M16.5 2.8v3.4c0 2.3-4.5 3.9-4.5 5.8s4.5 3.5 4.5 5.8v3.4" />
    </>
  ),
  tome: (
    <>
      <path d="M12 6.5C10.3 5.2 7.9 4.5 4.5 4.5v13c3.4 0 5.8.7 7.5 2 1.7-1.3 4.1-2 7.5-2v-13c-3.4 0-5.8.7-7.5 2Z" />
      <path d="M12 6.5v13" />
      <path d="M12 21.5c1.7-1.3 4.1-2 7.5-2M12 21.5c-1.7-1.3-4.1-2-7.5-2" />
    </>
  ),
  quill: (
    <>
      <path d="M20.5 3.5c-9 1-13.5 5-13.5 11 0 1 .2 1.9.5 2.7C10.4 15 14.9 11.2 20.5 3.5Z" />
      <path d="M8.4 16.2C11.6 11.4 15.4 7.5 20.5 3.5" />
      <path d="M7.5 17.2 3.5 21" />
    </>
  ),
  die: (
    <>
      <path d="M12 2.2 21 7.6v8.8L12 21.8 3 16.4V7.6Z" />
      <path d="m12 2.2 4.4 7.4-4.4 7.4-4.4-7.4Z" />
      <path d="M7.6 9.6 3 7.6m13.4 2 4.6-2m-9 7.4v5.4" />
    </>
  ),
  key: (
    <>
      <circle cx="7.5" cy="9" r="4.5" />
      <path d="m10.7 12.2 8.3 8.3M16.5 18l2-2M14 15.5l2-2" />
    </>
  ),
};

export interface GlyphProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: GlyphName;
  /** Rendered box in px. Below 16 the finer glyphs stop reading. */
  size?: number;
  /**
   * A label makes the glyph meaningful to a screen reader. Leave it off when
   * the glyph sits beside its own name in text, which is the common case here
   * — a second reading of "Bestiary" helps nobody.
   */
  label?: string;
}

export function Glyph({
  name,
  size = 18,
  label,
  className,
  ...rest
}: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`inline-block shrink-0 ${className ?? ''}`}
      {...rest}
    >
      {PATHS[name] ?? PATHS.question}
    </svg>
  );
}

/** True when `name` is one of ours — used to tell a glyph key from stored text. */
export function isGlyphName(name: string): name is GlyphName {
  return name in PATHS;
}

export const GLYPH_NAMES = Object.keys(PATHS) as GlyphName[];
