'use client';

import { useEffect, useState } from 'react';

/**
 * Keyboard for the DM (11).
 *
 * One hook on the screen, staff only, ignored while anything that takes
 * typing has focus. A digit sequence after D or H is shown while it is
 * being typed, so nothing is applied blind, and Enter applies it to the
 * highlighted combatant. The board hears its mode keys through a window
 * event, because its tool state is its own; the list itself is `SHORTCUTS`,
 * drawn by the `?` overlay from the same table the hook reads.
 */

export const SHORTCUTS: { keys: string; does: string }[] = [
  { keys: 'N / P', does: 'next / previous turn' },
  { keys: 'D, digits, Enter', does: 'damage the highlighted combatant' },
  { keys: 'H, digits, Enter', does: 'heal' },
  { keys: 'C', does: 'conditions on the highlighted' },
  { keys: '1 – 6', does: 'board: select, floor, height, build, things, fog' },
  { keys: 'F', does: 'the fog reveal tool' },
  { keys: 'Space', does: 'the shelf' },
  { keys: 'Ctrl / ⌘ Z', does: 'undo' },
  { keys: 'Esc', does: 'let go of a number' },
  { keys: '?', does: 'this list' },
];

/** Board modes by digit; the board listens for `hero-nexus:board`. */
export const BOARD_MODE_KEYS = [
  'select',
  'paint',
  'shape',
  'build',
  'things',
  'fog',
] as const;

export interface DmShortcutHandlers {
  nextTurn: () => void;
  previousTurn: () => void;
  /** Called with the signed delta once a D/H sequence is entered. */
  hp: (delta: number) => void;
  conditions: () => void;
  toggleShelf: () => void;
  undo: () => void;
}

export interface Typing {
  verb: 'D' | 'H';
  digits: string;
}

function typingTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  // HeroUI's comboboxes and menus are focusable roles that take arrows and
  // letters; leave them alone as well.
  const role = el.getAttribute('role');
  return role === 'combobox' || role === 'textbox' || role === 'listbox';
}

export function useDmShortcuts(
  active: boolean,
  handlers: DmShortcutHandlers
): { typing: Typing | null; help: boolean; setHelp: (v: boolean) => void } {
  const [typing, setTyping] = useState<Typing | null>(null);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (typingTarget(e)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        setTyping(null);
        handlers.undo();
        return;
      }
      if (mod || e.altKey) return;

      if (e.key === 'Escape') {
        if (typing) {
          e.preventDefault();
          setTyping(null);
        }
        if (help) setHelp(false);
        return;
      }
      if (e.key === '?') {
        e.preventDefault();
        setHelp(h => !h);
        return;
      }

      if (typing) {
        if (/^\d$/.test(e.key)) {
          e.preventDefault();
          setTyping({ ...typing, digits: (typing.digits + e.key).slice(0, 4) });
          return;
        }
        if (e.key === 'Backspace') {
          e.preventDefault();
          setTyping({ ...typing, digits: typing.digits.slice(0, -1) });
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          const n = Number(typing.digits);
          setTyping(null);
          if (Number.isFinite(n) && n > 0) {
            handlers.hp(typing.verb === 'D' ? -n : n);
          }
          return;
        }
        // Any other key drops the number: nothing is applied blind.
        setTyping(null);
      }

      const k = e.key.toLowerCase();
      if (k === 'n') {
        e.preventDefault();
        handlers.nextTurn();
      } else if (k === 'p') {
        e.preventDefault();
        handlers.previousTurn();
      } else if (k === 'd' || k === 'h') {
        e.preventDefault();
        setTyping({ verb: k === 'd' ? 'D' : 'H', digits: '' });
      } else if (k === 'c') {
        e.preventDefault();
        handlers.conditions();
      } else if (k === ' ') {
        e.preventDefault();
        handlers.toggleShelf();
      } else if (k === 'f') {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent('hero-nexus:board', { detail: { mode: 'fog' } })
        );
      } else if (/^[1-6]$/.test(e.key)) {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent('hero-nexus:board', {
            detail: { mode: BOARD_MODE_KEYS[Number(e.key) - 1] },
          })
        );
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, handlers, typing, help]);

  return { typing, help, setHelp };
}
