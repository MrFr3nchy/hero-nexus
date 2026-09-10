'use client';

/**
 * How loud the table is, for this reader, on this device.
 *
 * **Per viewer, not per table.** A DM running a fight wants to hear every
 * roll; the player who left the tab open on a second monitor wants none of it.
 * Those are two people at one table with different answers, so this is a
 * preference rather than a campaign setting — and it is the difference between
 * a feature somebody turns down and one they close.
 *
 * `localStorage`, so it needs no column, no migration and no round trip, and
 * follows the device rather than the account. Every read is wrapped: a private
 * window, cleared site data or a browser set to block storage must give the
 * defaults rather than a thrown error inside a provider.
 */
import { TABLE_EVENT_KINDS, type TableEventKind } from './events';

const KEY = 'hero-nexus.table-preferences';

export interface TablePreferences {
  /** Kinds that raise a slip in the corner. Everything reaches the feed. */
  announce: Record<TableEventKind, boolean>;
  /**
   * A short tone when something arrives.
   *
   * **Off by default and deliberately so.** A DM's laptop chiming through a
   * session is worse than a missed roll, and a sound somebody did not ask for
   * is the fastest way to have the whole feature muted.
   */
  sound: boolean;
}

/**
 * Everything announces except turns.
 *
 * A turn advancing is the one event a table is already watching the initiative
 * order for, and in a six-round fight it is thirty slips telling people
 * something the tracker in front of them already said. Yours still announces —
 * `describe` marks it as asking — because being told it is your go is the
 * whole reason to look up.
 */
export function defaultPreferences(): TablePreferences {
  const announce = Object.fromEntries(
    TABLE_EVENT_KINDS.map(k => [k, k !== 'turn'])
  ) as Record<TableEventKind, boolean>;
  return { announce, sound: false };
}

export function readPreferences(): TablePreferences {
  const base = defaultPreferences();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const stored = JSON.parse(raw) as Partial<TablePreferences>;
    return {
      // Folded over the defaults rather than trusted whole, so a kind added
      // after somebody last saved gets its default instead of `undefined`.
      announce: { ...base.announce, ...(stored.announce ?? {}) },
      sound: stored.sound ?? base.sound,
    };
  } catch {
    return base;
  }
}

export function writePreferences(next: TablePreferences): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage refused. The preference holds for this page and is forgotten on
    // the next, which is a better outcome than the control appearing broken.
  }
}

/**
 * One short tone, made rather than fetched.
 *
 * Hero Nexus makes no outbound calls and ships no audio, so this is two
 * oscillator notes — a fifth, short, quiet. Wrapped because `AudioContext` is
 * absent in some browsers and refused in others until the reader has
 * interacted with the page, and a silent failure is exactly right for a chime.
 */
export function chime(): void {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    gain.connect(ctx.destination);

    for (const [freq, at] of [
      [587.33, 0],
      [880, 0.08],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.22);
    }
    // Let it go once it has rung, rather than holding an audio device open for
    // the life of the tab.
    window.setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {
    // No audio available. Nothing to report: the slip is the announcement and
    // the tone was only ever the grace note on it.
  }
}
