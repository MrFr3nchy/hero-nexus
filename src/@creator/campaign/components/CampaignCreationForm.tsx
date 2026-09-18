'use client';

import { Button, Input, NumberInput, Textarea } from '@heroui/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { createCampaignAction } from '@/@creator/campaign/actions';
import { SectionCard } from '@/@shared/components/ui';
import {
  CampaignSettingsFields,
  defaultSettingsDraft,
  settingsFromDraft,
} from './CampaignSettingsFields';

/** The one system everything here is built for. */
const SYSTEM = 'dnd5e2024';

/**
 * The whole table, decided up front.
 *
 * There is no system to pick: everything here — the SRD on the shelves, the
 * builder's rules, the screen's enforcement — is D&D 5e (2024), and a menu
 * offering Pathfinder and Call of Cthulhu was a promise the app could not
 * keep. And the rules a DM used to find only later, behind Manage, are here
 * from the start; every one of them still defaults to the book, so a DM in a
 * hurry can name the table and press the button.
 */
export function CampaignCreationForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    maxPlayers: 6,
  });
  const [draft, setDraft] = useState(defaultSettingsDraft);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await createCampaignAction({
        name: form.name,
        description: form.description,
        settings: {
          rpgSystem: SYSTEM,
          maxPlayers: form.maxPlayers,
          ...settingsFromDraft(draft),
        },
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/campaigns/${result.data.id}`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <SectionCard framed title="The table">
        <div className="flex flex-col gap-5">
          <Input
            label="Campaign name"
            value={form.name}
            onValueChange={v => setForm(f => ({ ...f, name: v }))}
            isRequired
            autoFocus
          />
          <Textarea
            label="Description"
            placeholder="The world, the story, what players can expect…"
            value={form.description}
            onValueChange={v => setForm(f => ({ ...f, description: v }))}
            minRows={4}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberInput
              label="Max players"
              minValue={1}
              maxValue={20}
              value={form.maxPlayers}
              onValueChange={v =>
                setForm(f => ({ ...f, maxPlayers: Number(v) || 6 }))
              }
            />
            <div className="flex items-end pb-2 text-sm text-ink-muted">
              D&amp;D 5e (2024), with the SRD on the shelves.
            </div>
          </div>
        </div>
      </SectionCard>

      <CampaignSettingsFields draft={draft} onChange={setDraft} />

      {error && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div>
        <Button type="submit" color="primary" isLoading={loading}>
          Create campaign
        </Button>
      </div>
    </form>
  );
}
