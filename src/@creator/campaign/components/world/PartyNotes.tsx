'use client';

import { Button, Textarea } from '@heroui/react';
import { useState } from 'react';

import { ControlRow, Glyph } from '@/@shared/components/ui';
import type { PartyNoteRow } from '../../lib/canon';
import {
  addPartyNoteAction,
  deletePartyNoteAction,
  updatePartyNoteAction,
} from '../../canon-actions';

type Act = (p: Promise<{ ok: boolean; error?: string }>) => Promise<unknown>;

/**
 * What the party has written about an NPC or a place, signed — the party's
 * memory of the people it has met, kept beside the DM's version rather than
 * in a journal nobody else can find it in.
 *
 * Anyone who can read the entry can add a line. Only its author rewrites it;
 * the DM may take one down but never put words in somebody's mouth.
 */
export function PartyNotes({
  campaignId,
  entryId,
  notes,
  act,
  compact = false,
  place = false,
}: {
  campaignId: string;
  entryId: string;
  notes: PartyNoteRow[];
  act: Act;
  compact?: boolean;
  /** A place, not a person: "of it", not "of them". */
  place?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    await act(addPartyNoteAction(campaignId, entryId, draft));
    setBusy(false);
    setDraft('');
  };

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-[0.65rem] uppercase tracking-[0.1em] text-ink-subtle">
        <Glyph name="quill" size={12} />
        Party notes
      </p>
      {notes.length > 0 && (
        <ul className="space-y-1.5">
          {notes.map(n => (
            <li
              key={n.id}
              className="rounded-md border border-line bg-surface-2/60 px-2.5 py-1.5 text-sm"
            >
              {editing === n.id ? (
                <div className="space-y-2">
                  <Textarea
                    size="sm"
                    aria-label="Your note"
                    minRows={2}
                    value={edit}
                    onValueChange={setEdit}
                    autoFocus
                  />
                  <ControlRow size="sm">
                    <Button
                      color="primary"
                      onPress={async () => {
                        await act(
                          updatePartyNoteAction(campaignId, n.id, edit)
                        );
                        setEditing(null);
                      }}
                    >
                      Save
                    </Button>
                    <Button variant="light" onPress={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </ControlRow>
                </div>
              ) : (
                <>
                  <p className="whitespace-pre-wrap text-ink">{n.body}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-subtle">
                    <span>— {n.mine ? 'you' : n.byName}</span>
                    {n.mine && (
                      <button
                        type="button"
                        className="hover:text-ink"
                        onClick={() => {
                          setEditing(n.id);
                          setEdit(n.body);
                        }}
                      >
                        edit
                      </button>
                    )}
                    {n.canEdit && (
                      <button
                        type="button"
                        className="hover:text-danger"
                        onClick={() =>
                          act(deletePartyNoteAction(campaignId, n.id))
                        }
                      >
                        take down
                      </button>
                    )}
                  </p>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex items-end gap-2"
        onSubmit={e => {
          e.preventDefault();
          void add();
        }}
      >
        <Textarea
          size="sm"
          aria-label="Add a party note"
          placeholder={
            notes.length === 0
              ? `What does the party make of ${place ? 'it' : 'them'}?`
              : 'Add to what the party knows…'
          }
          minRows={compact ? 1 : 2}
          value={draft}
          onValueChange={setDraft}
          className="flex-1"
        />
        <Button
          size="sm"
          type="submit"
          variant="flat"
          isDisabled={!draft.trim() || busy}
        >
          Note it
        </Button>
      </form>
    </div>
  );
}
