'use client';

import { Button, Link, Textarea } from '@heroui/react';
import NextLink from 'next/link';
import { useEffect, useState } from 'react';

import { Glyph } from '@/@shared/components/ui';

import { getAiSettingsAction } from '../actions';

/**
 * The one prompt box AI drafting uses, wherever it appears.
 *
 * It renders nothing for an account that does not run a table, or on a
 * server with no `AI_KEY_SECRET` — an option nobody here can use is noise.
 * A DM with no key yet gets one quiet line pointing at the account page.
 *
 * `onDraft` does the work and returns an error sentence, or null; what a
 * draft turns into is the caller's business, because the caller is the form
 * it lands in.
 */
export function DraftWithAi({
  label,
  placeholder,
  onDraft,
  whenOff = null,
}: {
  label: string;
  placeholder: string;
  onDraft: (prompt: string) => Promise<string | null>;
  /** For a page that is only this box: what to say instead of nothing. */
  whenOff?: React.ReactNode;
}) {
  const [state, setState] = useState<'loading' | 'off' | 'no-key' | 'ready'>(
    'loading'
  );
  const [model, setModel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAiSettingsAction().then(res => {
      if (!res.ok || !res.data.available || !res.data.runsATable) {
        setState('off');
      } else if (!res.data.key) {
        setState('no-key');
      } else {
        setModel(res.data.key.model);
        setState('ready');
      }
    });
  }, []);

  if (state === 'loading') return null;
  if (state === 'off') return whenOff;

  if (state === 'no-key') {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-muted">
        <Glyph name="quill" size={15} className="text-ink-subtle" />
        <span>
          Draft this with your own AI key —{' '}
          <Link as={NextLink} href="/account" size="sm" underline="always">
            add one on your account page
          </Link>
          .
        </span>
      </p>
    );
  }

  const run = async () => {
    setError(null);
    setBusy(true);
    try {
      const err = await onDraft(prompt);
      if (err) setError(err);
      else setPrompt('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-dashed border-line bg-surface-2/40 p-3">
      <Textarea
        size="sm"
        label={label}
        labelPlacement="outside"
        placeholder={placeholder}
        minRows={2}
        maxRows={6}
        value={prompt}
        onValueChange={setPrompt}
        isDisabled={busy}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant="flat"
          startContent={busy ? null : <Glyph name="quill" size={15} />}
          isLoading={busy}
          isDisabled={prompt.trim().length < 3}
          onPress={run}
        >
          {busy ? 'Drafting…' : 'Draft with AI'}
        </Button>
        <span className="text-xs text-ink-subtle">
          {model} · nothing is saved until you save it
        </span>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
