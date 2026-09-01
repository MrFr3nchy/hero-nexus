'use client';

import {
  Button,
  Input,
  NumberInput,
  Select,
  SelectItem,
  Textarea,
} from '@heroui/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { createCampaignAction } from '@/@creator/campaign/actions';
import { RPG_SYSTEMS } from '@/@creator/campaign/types';
import { SectionCard } from '@/@shared/components/ui';

export function CampaignCreationForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    rpgSystem: 'dnd5e2024',
    maxPlayers: 6,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await createCampaignAction({
        name: form.name,
        description: form.description,
        settings: {
          rpgSystem: form.rpgSystem,
          maxPlayers: form.maxPlayers,
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
    <SectionCard title="Campaign details">
      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          label="Campaign name"
          value={form.name}
          onValueChange={v => setForm(f => ({ ...f, name: v }))}
          isRequired
        />
        <Textarea
          label="Description"
          placeholder="The world, the story, what players can expect…"
          value={form.description}
          onValueChange={v => setForm(f => ({ ...f, description: v }))}
          minRows={4}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="System"
            selectedKeys={[form.rpgSystem]}
            onSelectionChange={keys =>
              setForm(f => ({
                ...f,
                rpgSystem: String(Array.from(keys)[0] ?? f.rpgSystem),
              }))
            }
          >
            {RPG_SYSTEMS.map(s => (
              <SelectItem key={s.id}>{s.name}</SelectItem>
            ))}
          </Select>
          <NumberInput
            label="Max players"
            minValue={1}
            maxValue={20}
            value={form.maxPlayers}
            onValueChange={v =>
              setForm(f => ({ ...f, maxPlayers: Number(v) || 6 }))
            }
          />
        </div>

        {error && (
          <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <Button type="submit" color="primary" isLoading={loading}>
          Create campaign
        </Button>
      </form>
    </SectionCard>
  );
}
