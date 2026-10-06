'use client';

import { Button, Input } from '@heroui/react';
import { useEffect, useState } from 'react';

import { ControlRow } from '@/@shared/components/ui';
import {
  getMyDiscordAction,
  setMyDiscordUserIdAction,
} from '../discord-actions';

/**
 * A member's own Discord user ID, so the table's Discord posts can mention
 * them. Only shown when the table has a channel connected.
 */
export function DiscordIdField({ campaignId }: { campaignId: string }) {
  const [connected, setConnected] = useState(false);
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    getMyDiscordAction(campaignId).then(res => {
      if (!res.ok) return;
      setConnected(res.data.connected);
      setValue(res.data.discordUserId ?? '');
      setSaved(res.data.discordUserId ?? '');
    });
  }, [campaignId]);

  if (!connected) return null;

  const save = async () => {
    setBusy(true);
    setNote(null);
    const next = value.trim() || null;
    const res = await setMyDiscordUserIdAction(campaignId, next);
    setBusy(false);
    if (!res.ok) {
      setNote({ ok: false, text: res.error });
      return;
    }
    setSaved(next ?? '');
    setNote({
      ok: true,
      text: next ? 'Saved. Posts will mention you.' : 'Cleared.',
    });
  };

  return (
    <div className="basis-full">
      <ControlRow size="sm">
        <Input
          aria-label="Your Discord user ID"
          placeholder="Your Discord user ID (optional)"
          className="max-w-xs"
          value={value}
          onValueChange={setValue}
          inputMode="numeric"
        />
        <Button
          variant="flat"
          isDisabled={value.trim() === saved}
          isLoading={busy}
          onPress={save}
        >
          Save
        </Button>
      </ControlRow>
      <p className="mt-1 text-xs text-ink-subtle">
        The table posts to Discord. To be mentioned: Discord settings → Advanced
        → Developer Mode on, then right-click your name → Copy User ID.
      </p>
      {note && (
        <p
          role={note.ok ? 'status' : 'alert'}
          className={`mt-1 text-xs ${note.ok ? 'text-success' : 'text-danger'}`}
        >
          {note.text}
        </p>
      )}
    </div>
  );
}
