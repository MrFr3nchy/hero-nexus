'use client';

import { Button, Input, Select, SelectItem } from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

import {
  DiceSpinner,
  Glyph,
  Marginalia,
  SectionCard,
  useConfirm,
} from '@/@shared/components/ui';
import type { AiSettings } from '@/server/ai/keys';

import {
  getAiSettingsAction,
  listAiModelsAction,
  removeAiKeyAction,
  saveAiKeyAction,
  setAiModelAction,
} from '../actions';
import {
  AI_ERRORS,
  AI_KEY_PAGE,
  AI_PROVIDER_LABEL,
  AI_PROVIDERS,
  type AiProvider,
} from '../lib';

/**
 * AI drafting, on the account page.
 *
 * A key goes in and only its last four characters come back out. The copy
 * says the two things a user is owed before they paste one: the provider
 * bills for it separately from any chat subscription, and the server's
 * operator could read it.
 */
export function AiKeyCard() {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [provider, setProvider] = useState<AiProvider>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [models, setModels] = useState<string[] | null>(null);
  const [checking, setChecking] = useState(false);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    const res = await getAiSettingsAction();
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSettings(res.data);
    const code = res.data.key?.lastError;
    setLastError(code ? (AI_ERRORS[code] ?? AI_ERRORS.AI_FAILED) : null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setError(null);
    setSaving(true);
    const res = await saveAiKeyAction({ provider, apiKey });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setApiKey('');
    setReplacing(false);
    setModels(res.data.models);
    await load();
  };

  const checkModels = async () => {
    setError(null);
    setChecking(true);
    const res = await listAiModelsAction();
    setChecking(false);
    if (!res.ok) setError(res.error);
    else setModels(res.data);
  };

  const pickModel = async (model: string) => {
    if (!model) return;
    const res = await setAiModelAction(model);
    if (!res.ok) setError(res.error);
    await load();
  };

  const remove = async () => {
    const yes = await confirm({
      title: 'Remove your AI key?',
      body: 'It is deleted from this server. Drafts you already saved stay where they are.',
      confirmLabel: 'Remove it',
      destructive: true,
    });
    if (!yes) return;
    const res = await removeAiKeyAction();
    if (!res.ok) setError(res.error);
    setModels(null);
    await load();
  };

  if (!settings) {
    return (
      <SectionCard title="AI drafting">
        {error ? (
          <p className="text-sm text-danger">{error}</p>
        ) : (
          <div className="flex justify-center py-6">
            <DiceSpinner label="Checking the inkwell…" />
          </div>
        )}
      </SectionCard>
    );
  }

  const key = settings.key;
  const showForm = settings.available && (!key || replacing);
  const modelOptions = models ?? (key ? [key.model] : []);

  return (
    <SectionCard
      title="AI drafting"
      description="Your own OpenAI, Claude or Gemini key, for drafting homebrew and encounters. Optional."
    >
      {dialog}
      <div className="flex flex-col gap-4">
        {!settings.available && (
          <p className="text-sm text-ink-muted">
            This server is not set up for it yet. Whoever runs it needs to set{' '}
            <code className="text-ink">AI_KEY_SECRET</code>, which is what keys
            are locked with.
          </p>
        )}

        {settings.available && !settings.runsATable && (
          <p className="text-sm text-ink-muted">
            Drafting is a DM’s tool for now — it appears in the Forge and the
            encounter planner once you run a table.
          </p>
        )}

        {key && !replacing && (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <Glyph name="key" size={16} className="text-gold" />
              <span className="text-ink">
                {AI_PROVIDER_LABEL[key.provider]}
              </span>
              <span className="text-ink-muted tabular-nums">
                key ending …{key.hint}
              </span>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <Select
                label="Model"
                labelPlacement="outside"
                className="min-w-56 flex-1"
                selectedKeys={[key.model]}
                onSelectionChange={keys =>
                  pickModel(String(Array.from(keys)[0] ?? ''))
                }
              >
                {modelOptions.map(m => (
                  <SelectItem key={m}>{m}</SelectItem>
                ))}
              </Select>
              {!models && (
                <Button
                  variant="flat"
                  isLoading={checking}
                  onPress={checkModels}
                >
                  Show other models
                </Button>
              )}
            </div>

            {lastError && (
              <p className="text-sm text-warning">Last draft: {lastError}</p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="flat" onPress={() => setReplacing(true)}>
                Replace the key
              </Button>
              <Button
                variant="light"
                className="text-ink-muted data-[hover=true]:text-danger"
                onPress={remove}
              >
                Remove it
              </Button>
            </div>
          </>
        )}

        {showForm && (
          <div className="flex flex-col gap-4">
            <Select
              label="Provider"
              labelPlacement="outside"
              selectedKeys={[provider]}
              onSelectionChange={keys => {
                const next = Array.from(keys)[0] as AiProvider | undefined;
                if (next) setProvider(next);
              }}
            >
              {AI_PROVIDERS.map(p => (
                <SelectItem key={p}>{AI_PROVIDER_LABEL[p]}</SelectItem>
              ))}
            </Select>
            <Input
              type="password"
              label="API key"
              labelPlacement="outside"
              placeholder="Paste it here"
              // Not a sign-in password: "new-password" keeps the browser from
              // autofilling the account's password into the forms above when
              // this field takes focus, and from offering to save the key.
              autoComplete="new-password"
              data-1p-ignore
              data-lpignore="true"
              value={apiKey}
              onValueChange={setApiKey}
              description={`From ${AI_KEY_PAGE[provider]}. It is checked with the provider before it is kept.`}
            />
            <p className="text-sm text-ink-muted">
              This is an API key, not your chat subscription: the provider bills
              what drafting uses to your API account, separately from ChatGPT
              Plus, Claude Pro or Gemini Advanced. The key is stored encrypted
              and never shown again — but whoever runs this server holds the
              secret it is locked with.
            </p>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <Button
                color="primary"
                isLoading={saving}
                isDisabled={apiKey.trim().length < 8}
                onPress={save}
              >
                Save the key
              </Button>
              {replacing && (
                <Button variant="light" onPress={() => setReplacing(false)}>
                  Keep the old one
                </Button>
              )}
            </div>
          </div>
        )}

        {!showForm && error && <p className="text-sm text-danger">{error}</p>}

        <Marginalia>
          a draft is only a draft — you still have the last word
        </Marginalia>
      </div>
    </SectionCard>
  );
}
