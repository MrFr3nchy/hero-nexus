'use client';

import { Button, Textarea } from '@heroui/react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { SectionCard } from '@/@shared/components/ui';

import {
  addSecretAction,
  deleteSecretAction,
  setSecretVisibilityAction,
} from '../notes-actions';
import type { SecretRow, SecretVisibility } from '../lib/note-sections';

interface SecretsLogProps {
  campaignId: string;
  characterId: string;
  secrets: SecretRow[];
  /** Staff choose who each entry reaches; a player writes for their DM only. */
  canReveal: boolean;
}

const LEVEL_LABEL: Record<SecretVisibility, string> = {
  dm: 'Withheld — staff only',
  player: 'This player only',
  party: 'The whole party',
};

const LEVEL_TONE: Record<SecretVisibility, string> = {
  dm: 'border-warning/40 bg-warning/5',
  player: 'border-arcane/40 bg-arcane/5',
  party: 'border-gold/40 bg-gold/5',
};

/**
 * What this character knows and the rest of the table does not.
 *
 * Either side writes to it. The DM's entries widen in steps — withheld, then
 * this player, then the whole party — which is why visibility is three levels
 * rather than a flag. A DM entry is never deleted, only hidden: the log is a
 * record of who knew what and when.
 */
export function SecretsLog({
  campaignId,
  characterId,
  secrets,
  canReveal,
}: SecretsLogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState('');
  const [level, setLevel] = useState<SecretVisibility>('player');
  const [error, setError] = useState('');

  const run = (work: () => Promise<{ ok: boolean; error?: string }>) => {
    setError('');
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        setError(result.error ?? 'That did not work.');
        return;
      }
      setBody('');
      router.refresh();
    });
  };

  const levels: SecretVisibility[] = ['dm', 'player', 'party'];

  return (
    <SectionCard
      framed
      title="Secrets"
      description={
        canReveal
          ? 'Known to this player alone. Widen an entry to the whole party when the rest of the table has earned it.'
          : 'What your character knows that the rest of the party does not. Your DM can read these, and can add their own.'
      }
      bodyClassName="border-t-2 border-t-arcane/50"
    >
      <div className="space-y-2">
        <Textarea
          aria-label="New secret"
          minRows={2}
          value={body}
          onValueChange={setBody}
          placeholder={
            canReveal
              ? 'What did this character learn in private?'
              : 'Something your character knows and has not told the party.'
          }
          classNames={{ inputWrapper: 'bg-surface-2 border-line' }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            color="primary"
            isDisabled={pending || !body.trim()}
            onPress={() =>
              run(() =>
                addSecretAction(
                  campaignId,
                  characterId,
                  body,
                  canReveal ? level : 'player'
                )
              )
            }
          >
            Record it
          </Button>
          {canReveal ? (
            <div className="flex flex-wrap gap-1.5">
              {levels.map(l => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLevel(l)}
                  className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                    level === l
                      ? 'border-gold bg-gold/15 text-ink'
                      : 'border-line text-ink-muted hover:border-gold/60'
                  }`}
                >
                  {LEVEL_LABEL[l]}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-sm text-ink-subtle">
              Between you and your DM until they say otherwise.
            </span>
          )}
        </div>
      </div>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      {secrets.length === 0 ? (
        <p className="mt-4 text-sm text-ink-subtle">Nothing recorded yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {secrets.map(secret => (
            <li
              key={secret.id}
              className={`rounded-md border px-3 py-2 text-sm ${LEVEL_TONE[secret.visibility]}`}
            >
              <p className="whitespace-pre-wrap text-ink-muted">
                {secret.body}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-ink-subtle">
                <span>
                  {secret.authorRole === 'gm' ? 'DM' : 'Player'}
                  {secret.authorName ? ` · ${secret.authorName}` : ''}
                </span>
                <span>{LEVEL_LABEL[secret.visibility]}</span>

                {canReveal &&
                  levels
                    .filter(l => l !== secret.visibility)
                    .map(l => (
                      <button
                        key={l}
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          run(() =>
                            setSecretVisibilityAction(
                              campaignId,
                              characterId,
                              secret.id,
                              l
                            )
                          )
                        }
                        className="underline-offset-2 hover:text-ink hover:underline"
                      >
                        {l === 'party'
                          ? 'Reveal to the party'
                          : l === 'player'
                            ? 'Show this player'
                            : 'Withhold'}
                      </button>
                    ))}

                {secret.canDelete && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        deleteSecretAction(campaignId, characterId, secret.id)
                      )
                    }
                    className="underline-offset-2 hover:text-danger hover:underline"
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
