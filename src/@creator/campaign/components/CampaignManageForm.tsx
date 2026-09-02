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

import { RPG_SYSTEMS } from '@/@creator/campaign/types';
import { SectionCard, useConfirm } from '@/@shared/components/ui';
import type { CampaignRow } from '@/server/campaigns';
import {
  deleteCampaignAction,
  setCampaignStatusAction,
  updateCampaignAction,
} from '../actions';

export function CampaignManageForm({ campaign }: { campaign: CampaignRow }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [form, setForm] = useState({
    name: campaign.name,
    description: campaign.description,
    rpgSystem: campaign.settings.rpgSystem,
    maxPlayers: campaign.settings.maxPlayers,
    sessionNotes: campaign.settings.sessionNotes,
    customRules: campaign.settings.customRules,
  });
  const [status, setStatus] = useState(campaign.status);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{
    kind: 'ok' | 'err';
    text: string;
  } | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setBanner(null);
    try {
      const res = await updateCampaignAction(campaign.id, {
        name: form.name,
        description: form.description,
        settings: {
          rpgSystem: form.rpgSystem,
          maxPlayers: form.maxPlayers,
          sessionNotes: form.sessionNotes,
          customRules: form.customRules,
        },
      });
      setBanner(
        res.ok
          ? { kind: 'ok', text: 'Saved.' }
          : { kind: 'err', text: res.error }
      );
      if (res.ok) router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (next: CampaignRow['status']) => {
    setStatus(next);
    const res = await setCampaignStatusAction(campaign.id, next);
    if (!res.ok) setBanner({ kind: 'err', text: res.error });
    else router.refresh();
  };

  const remove = async () => {
    const ok = await confirm({
      title: 'Disband this campaign?',
      body: 'Members, invites and session data are removed for good.',
      confirmLabel: 'Disband',
      destructive: true,
    });
    if (!ok) return;
    const res = await deleteCampaignAction(campaign.id);
    if (res.ok) router.push('/campaigns');
    else setBanner({ kind: 'err', text: res.error });
  };

  return (
    <div className="space-y-5">
      {dialog}
      {banner && (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            banner.kind === 'ok'
              ? 'border-success/40 bg-success/10 text-success'
              : 'border-danger/40 bg-danger/10 text-danger'
          }`}
        >
          {banner.text}
        </p>
      )}

      <SectionCard title="Details">
        <form onSubmit={save} className="space-y-5">
          <Input
            label="Campaign name"
            value={form.name}
            onValueChange={v => setForm(f => ({ ...f, name: v }))}
            isRequired
          />
          <Textarea
            label="Description"
            value={form.description}
            onValueChange={v => setForm(f => ({ ...f, description: v }))}
            minRows={3}
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
          <Textarea
            label="Session notes"
            value={form.sessionNotes}
            onValueChange={v => setForm(f => ({ ...f, sessionNotes: v }))}
            minRows={3}
          />
          <Textarea
            label="House rules"
            value={form.customRules}
            onValueChange={v => setForm(f => ({ ...f, customRules: v }))}
            minRows={3}
          />
          <Button type="submit" color="primary" isLoading={saving}>
            Save changes
          </Button>
        </form>
      </SectionCard>

      <SectionCard title="Status">
        <Select
          aria-label="Campaign status"
          className="max-w-xs"
          selectedKeys={[status]}
          onSelectionChange={keys =>
            changeStatus(Array.from(keys)[0] as CampaignRow['status'])
          }
        >
          <SelectItem key="active">Active</SelectItem>
          <SelectItem key="paused">Paused</SelectItem>
          <SelectItem key="completed">Completed</SelectItem>
          <SelectItem key="archived">Archived</SelectItem>
        </Select>
      </SectionCard>

      <SectionCard title="Danger zone">
        <Button color="danger" variant="flat" onPress={remove}>
          Delete campaign
        </Button>
      </SectionCard>
    </div>
  );
}
