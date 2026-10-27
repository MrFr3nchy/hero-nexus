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
import { ImportPreview } from './ImportPreview';

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
        <ImportPreview
          preview={preview}
          source="ddb"
          busy={busy}
          onCreate={create}
        />
      )}
    </div>
  );
}
