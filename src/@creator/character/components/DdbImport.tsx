'use client';

import { Button, Textarea } from '@heroui/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Marginalia, SectionCard } from '@/@shared/components/ui';
import type { DdbPreview } from '@/server/ddb-import';
import {
  importDdbCharacterAction,
  previewDdbImportAction,
} from '../ddb-actions';
import { parseDdbCharacter } from '../lib/ddb-import';

/**
 * Paste or upload a D&D Beyond character's JSON, see what carries over, then
 * create it as a draft and finish it in the builder.
 *
 * The JSON is read here, in the browser — the server is sent the facts, not
 * the export, and never calls D&D Beyond itself.
 */
export function DdbImport() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<DdbPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const read = async (raw: string) => {
    setError(null);
    setPreview(null);
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      setError('That is not JSON. Paste the whole page the link opens.');
      return;
    }
    const facts = parseDdbCharacter(json);
    if (!facts) {
      setError('That JSON is not a D&D Beyond character.');
      return;
    }
    setBusy(true);
    const res = await previewDdbImportAction(facts);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else setPreview(res.data);
  };

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

  const matchedItems = preview?.items.filter(i => i.match) ?? [];
  const loneItems = preview?.items.filter(i => !i.match) ?? [];
  const matchedSpells = preview?.spells.filter(s => s.match) ?? [];
  const loneSpells = preview?.spells.filter(s => !s.match) ?? [];

  return (
    <div className="space-y-5">
      <SectionCard
        title="Your character's JSON"
        description="D&D Beyond has no official export. For a character set to Public: open character-service.dndbeyond.com/character/v5/character/ followed by the number at the end of your character's address, then copy the whole page and paste it here — or save it and upload the file."
      >
        <div className="space-y-3">
          <Textarea
            aria-label="Character JSON"
            placeholder='{"id":…,"success":true,"data":{"name":…'
            minRows={6}
            maxRows={12}
            value={text}
            onValueChange={setText}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              color="primary"
              isDisabled={!text.trim()}
              isLoading={busy && !preview}
              onPress={() => read(text)}
            >
              Read it
            </Button>
            <label className="cursor-pointer rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink hover:border-gold/60">
              Upload a .json file
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={async e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const raw = await file.text();
                  setText(raw.length > 200_000 ? '' : raw);
                  await read(raw);
                }}
              />
            </label>
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Marginalia dash>
            nothing is sent to D&amp;D Beyond. it never knows.
          </Marginalia>
        </div>
      </SectionCard>

      {preview && (
        <SectionCard
          title={preview.facts.name}
          description={[
            preview.facts.classes
              .map(
                c =>
                  `${c.name} ${c.level}${c.subclass ? ` (${c.subclass})` : ''}`
              )
              .join(' / '),
            preview.facts.species,
            preview.facts.background,
          ]
            .filter(Boolean)
            .join(' · ')}
        >
          <div className="space-y-4 text-sm">
            <p className="text-ink">
              Level {preview.facts.level} · {preview.facts.hitPointsMax ?? '?'}{' '}
              hit points ·{' '}
              {Object.entries(preview.facts.abilities)
                .map(([k, v]) => `${k.slice(0, 3).toUpperCase()} ${v}`)
                .join(' · ')}
            </p>

            <ul className="space-y-1 text-ink-muted">
              {preview.facts.warnings.map(w => (
                <li key={w}>{w}</li>
              ))}
            </ul>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="font-display-alt text-[0.65rem] uppercase tracking-[0.14em] text-gold/80">
                  Found in the SRD
                </h3>
                <p className="mt-1 text-ink-muted">
                  {[...matchedItems, ...matchedSpells]
                    .map(x => x.match!.name)
                    .join(', ') || 'Nothing matched.'}
                </p>
              </div>
              <div>
                <h3 className="font-display-alt text-[0.65rem] uppercase tracking-[0.14em] text-warning">
                  Needs a match
                </h3>
                <p className="mt-1 text-ink-muted">
                  {[...loneItems, ...loneSpells].map(x => x.name).join(', ') ||
                    'Nothing — everything matched.'}
                </p>
                {(loneItems.length > 0 || loneSpells.length > 0) && (
                  <p className="mt-1 text-xs text-ink-subtle">
                    Items come in by name, marked to be matched; spells are
                    listed in the class features. Nothing is turned into
                    homebrew — most of it is from books, and homebrew can be
                    shared.
                  </p>
                )}
              </div>
            </div>

            <Button color="primary" isLoading={busy} onPress={create}>
              Create the draft and open the builder
            </Button>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
