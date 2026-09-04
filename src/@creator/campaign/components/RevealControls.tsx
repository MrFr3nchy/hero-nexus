'use client';

import { type ReactNode } from 'react';

export interface RevealLevel<T extends string> {
  key: T;
  label: string;
  /** One line explaining who ends up seeing it. */
  hint?: string;
}

export interface RevealMember {
  userId: string;
  name: string;
}

/**
 * Who currently sees a thing, and the two ways to change it: move it up or
 * down the ladder (staff → one player → the table), or hand it to named
 * people while it is still private.
 *
 * Canon entries, character secrets and downtime results all answer the same
 * question in the same words, so they share this control rather than each
 * inventing a vocabulary for "revealed".
 */
export function RevealControls<T extends string>({
  levels,
  value,
  onSet,
  members,
  revealedTo,
  onToggleMember,
  disabled,
  footer,
}: {
  levels: RevealLevel<T>[];
  value: T;
  onSet: (next: T) => void;
  /** Omit to hide the per-person list — some things only have levels. */
  members?: RevealMember[];
  revealedTo?: string[];
  onToggleMember?: (userId: string, next: boolean) => void;
  disabled?: boolean;
  footer?: ReactNode;
}) {
  const current = levels.find(l => l.key === value);
  const revealed = new Set(revealedTo ?? []);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {levels.map(level => (
          <button
            key={level.key}
            type="button"
            disabled={disabled}
            onClick={() => onSet(level.key)}
            title={level.hint}
            className={`rounded-md border px-2 py-1 text-xs transition-colors ${
              level.key === value
                ? 'border-gold bg-gold/15 text-ink'
                : 'border-line text-ink-muted hover:border-gold/60 hover:text-ink'
            }`}
          >
            {level.label}
          </button>
        ))}
      </div>

      {current?.hint && (
        <p className="text-xs text-ink-subtle">{current.hint}</p>
      )}

      {members && members.length > 0 && onToggleMember && (
        <div>
          <div className="font-display-alt text-[0.6rem] uppercase tracking-[0.12em] text-ink-subtle">
            Also shown to
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {members.map(member => {
              const on = revealed.has(member.userId);
              return (
                <button
                  key={member.userId}
                  type="button"
                  disabled={disabled}
                  onClick={() => onToggleMember(member.userId, !on)}
                  className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                    on
                      ? 'border-arcane bg-arcane/15 text-ink'
                      : 'border-line text-ink-muted hover:border-arcane/60 hover:text-ink'
                  }`}
                >
                  {member.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {footer}
    </div>
  );
}
