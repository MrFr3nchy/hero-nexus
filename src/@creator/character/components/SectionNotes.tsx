'use client';

import { Button, Textarea } from '@heroui/react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import {
  addSheetNoteAction,
  deleteSheetNoteAction,
  setSheetNoteVisibilityAction,
} from '../notes-actions';
import type { NoteSection, SheetNoteRow } from '../lib/note-sections';

interface SectionNotesProps {
  campaignId: string;
  characterId: string;
  section: NoteSection;
  notes: SheetNoteRow[];
  /** Staff get the compose box and the visibility controls; players read. */
  canWrite: boolean;
}

/**
 * The DM's comments on one section of a sheet.
 *
 * A comment is written either for the player (`shared`) or as a private margin
 * note (`dm`); the server never sends a private one to the player, so what the
 * player's copy of this component receives is already the whole truth.
 */
export function SectionNotes({
  campaignId,
  characterId,
  section,
  notes,
  canWrite,
}: SectionNotesProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [shared, setShared] = useState(true);
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
      setOpen(false);
      router.refresh();
    });
  };

  if (!canWrite && notes.length === 0) return null;

  return (
    <div className="mt-4 border-t border-line pt-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display-alt text-[0.65rem] uppercase tracking-[0.12em] text-ink-subtle">
          {canWrite ? "DM's comments" : 'From your DM'}
          {notes.length > 0 && ` (${notes.length})`}
        </h3>
        {canWrite && (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="text-sm text-ink-muted underline-offset-2 hover:text-ink hover:underline"
          >
            {open ? 'Cancel' : 'Add a comment'}
          </button>
        )}
      </div>

      {notes.length > 0 && (
        <ul className="mt-2 space-y-2">
          {notes.map(note => (
            <li
              key={note.id}
              className={`rounded-md border px-3 py-2 text-sm ${
                note.visibility === 'dm'
                  ? 'border-warning/40 bg-warning/5'
                  : 'border-line bg-surface-2'
              }`}
            >
              <p className="whitespace-pre-wrap text-ink-muted">{note.body}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-ink-subtle">
                <span>{note.authorName ?? 'Your DM'}</span>
                {canWrite && (
                  <>
                    <span>
                      {note.visibility === 'dm'
                        ? 'private to staff'
                        : 'the player sees this'}
                    </span>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(() =>
                          setSheetNoteVisibilityAction(
                            campaignId,
                            characterId,
                            note.id,
                            note.visibility === 'dm' ? 'shared' : 'dm'
                          )
                        )
                      }
                      className="underline-offset-2 hover:text-ink hover:underline"
                    >
                      {note.visibility === 'dm'
                        ? 'Show the player'
                        : 'Make private'}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(() =>
                          deleteSheetNoteAction(
                            campaignId,
                            characterId,
                            note.id
                          )
                        )
                      }
                      className="underline-offset-2 hover:text-danger hover:underline"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canWrite && open && (
        <div className="mt-3 space-y-2">
          <Textarea
            aria-label={`Comment on ${section}`}
            minRows={2}
            value={body}
            onValueChange={setBody}
            placeholder="What do you want to say about this part of the sheet?"
            classNames={{ inputWrapper: 'bg-surface-2 border-line' }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              color="primary"
              isDisabled={pending || !body.trim()}
              onPress={() =>
                run(() =>
                  addSheetNoteAction(
                    campaignId,
                    characterId,
                    section,
                    body,
                    shared ? 'shared' : 'dm'
                  )
                )
              }
            >
              Save comment
            </Button>
            <button
              type="button"
              onClick={() => setShared(s => !s)}
              className="text-sm text-ink-muted underline-offset-2 hover:text-ink hover:underline"
            >
              {shared ? 'The player will see this' : 'Private to staff'}
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
