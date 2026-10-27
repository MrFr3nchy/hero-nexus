'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { importDdbCharacterAction } from '@/@creator/character/ddb-actions';
import { ImportPreview } from '@/@creator/character/components/ImportPreview';
import { Marginalia, SectionCard } from '@/@shared/components/ui';
import type { DdbPreview } from '@/server/ddb-import';

import { draftCharacterAction } from '../actions';
import { DraftWithAi } from './DraftWithAi';

/**
 * A hero drafted with AI: a pregen for a new player, or an adventurer the
 * party meets. It arrives as the same facts an import does, previews the
 * same way, and only becomes a character — a draft, opened in the builder —
 * when the DM presses for it.
 */
export function DraftHero() {
  const router = useRouter();
  const [preview, setPreview] = useState<DdbPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!preview) return;
    setBusy(true);
    const res = await importDdbCharacterAction(preview.facts);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.push(`/creator/character?id=${res.data.id}`);
  };

  return (
    <div className="space-y-5">
      <SectionCard
        title="Who are they?"
        description="Class, level and a line about them is enough. Say if they are a pregen for a player or someone the party meets."
      >
        <div className="flex flex-col gap-3">
          <DraftWithAi
            label="Draft a hero with AI"
            placeholder="A level 3 halfling bard, a pregen for a new player — cheerful, a little light-fingered…"
            whenOff={
              <p className="text-sm text-ink-muted">
                Drafting a hero is a DM’s tool: it needs a table you run, and
                this server set up for AI drafting.
              </p>
            }
            onDraft={async prompt => {
              setError(null);
              const res = await draftCharacterAction(prompt);
              if (!res.ok) return res.error;
              setPreview(res.data);
              return null;
            }}
          />
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Marginalia dash>the builder still gets the last word</Marginalia>
        </div>
      </SectionCard>

      {preview && (
        <ImportPreview
          preview={preview}
          source="ai"
          busy={busy}
          onCreate={create}
        />
      )}
    </div>
  );
}
