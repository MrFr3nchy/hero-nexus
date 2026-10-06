'use client';

import { Button, Input, Switch } from '@heroui/react';
import { useEffect, useState } from 'react';

import { Marginalia, SectionCard } from '@/@shared/components/ui';
import {
  DISCORD_TRIGGERS,
  DISCORD_TRIGGER_LABELS,
  type DiscordEvents,
  type DiscordTrigger,
} from '../lib/discord';
import {
  getDiscordSettingsAction,
  saveDiscordSettingsAction,
  sendDiscordTestAction,
} from '../discord-actions';
import type { DiscordSettingsView } from '@/server/discord';

/**
 * Post to Discord: one channel webhook for the whole table.
 *
 * The URL is a write credential for somebody's channel, so it is never sent
 * back — the field shows a mask, and leaving it untouched keeps what is
 * stored. The test button posts synchronously, so a bad webhook says so here
 * rather than failing silently on the night.
 */
export function DiscordCard({ campaignId }: { campaignId: string }) {
  const [view, setView] = useState<DiscordSettingsView | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState<'save' | 'test' | 'remove' | null>(null);
  const [message, setMessage] = useState<{
    kind: 'ok' | 'err';
    text: string;
  } | null>(null);

  useEffect(() => {
    getDiscordSettingsAction(campaignId).then(res => {
      if (res.ok) setView(res.data);
      else setMessage({ kind: 'err', text: res.error });
    });
  }, [campaignId]);

  const save = async (patch: {
    webhookUrl?: string | null;
    events?: Partial<DiscordEvents>;
  }) => {
    setMessage(null);
    const res = await saveDiscordSettingsAction(campaignId, patch);
    if (!res.ok) {
      setMessage({ kind: 'err', text: res.error });
      return false;
    }
    setView(res.data);
    return true;
  };

  const connect = async () => {
    setBusy('save');
    if (await save({ webhookUrl: url })) {
      setUrl('');
      setMessage({ kind: 'ok', text: 'Saved. Send a test to be sure.' });
    }
    setBusy(null);
  };

  const disconnect = async () => {
    setBusy('remove');
    if (await save({ webhookUrl: null })) {
      setMessage({ kind: 'ok', text: 'Disconnected.' });
    }
    setBusy(null);
  };

  const toggle = (trigger: DiscordTrigger, on: boolean) => {
    if (!view) return;
    setView({ ...view, events: { ...view.events, [trigger]: on } });
    void save({ events: { [trigger]: on } });
  };

  const test = async () => {
    setBusy('test');
    setMessage(null);
    const res = await sendDiscordTestAction(campaignId);
    setBusy(null);
    if (!res.ok) {
      setMessage({ kind: 'err', text: res.error });
      return;
    }
    setMessage(
      res.data.error
        ? { kind: 'err', text: res.data.error }
        : { kind: 'ok', text: 'Sent. Check the channel.' }
    );
    const fresh = await getDiscordSettingsAction(campaignId);
    if (fresh.ok) setView(fresh.data);
  };

  return (
    <SectionCard
      title="Discord"
      description="Post to Discord when something happens that the whole table should hear about. Only things the players could already see are posted."
    >
      <div className="flex flex-col gap-4">
        <Input
          label="Channel webhook URL"
          labelPlacement="outside"
          placeholder={view?.masked ?? 'https://discord.com/api/webhooks/…/…'}
          value={url}
          onValueChange={setUrl}
          autoComplete="off"
          description="In Discord: the channel's settings → Integrations → Webhooks → New Webhook → Copy Webhook URL."
        />

        <div className="flex flex-wrap gap-2">
          <Button
            color="primary"
            isDisabled={!url.trim()}
            isLoading={busy === 'save'}
            onPress={connect}
          >
            {view?.configured ? 'Replace the webhook' : 'Connect'}
          </Button>
          {view?.configured && (
            <>
              <Button variant="flat" isLoading={busy === 'test'} onPress={test}>
                Send a test message
              </Button>
              <Button
                variant="light"
                className="text-ink-muted data-[hover=true]:text-danger"
                isLoading={busy === 'remove'}
                onPress={disconnect}
              >
                Disconnect
              </Button>
            </>
          )}
        </div>

        {message && (
          <p
            role={message.kind === 'err' ? 'alert' : 'status'}
            className={`text-sm ${message.kind === 'err' ? 'text-danger' : 'text-success'}`}
          >
            {message.text}
          </p>
        )}

        {view?.configured && view.lastError && !message && (
          <p role="alert" className="text-sm text-danger">
            The last post failed: {view.lastError}
          </p>
        )}

        {view?.configured && (
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <p className="text-sm text-ink-muted">Post when…</p>
            {DISCORD_TRIGGERS.map(t => (
              <Switch
                key={t}
                isSelected={view.events[t]}
                onValueChange={on => toggle(t, on)}
              >
                <span className="text-sm">{DISCORD_TRIGGER_LABELS[t]}</span>
              </Switch>
            ))}
            <Marginalia dash className="mt-1">
              players who add their Discord ID on the campaign page get a
              mention.
            </Marginalia>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
