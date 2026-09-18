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

import { SectionCard, useConfirm } from '@/@shared/components/ui';
import type { CampaignRow } from '@/server/campaigns';
import {
  deleteCampaignAction,
  setCampaignStatusAction,
  updateCampaignAction,
} from '../actions';
import {
  CampaignSettingsFields,
  draftFromSettings,
  settingsFromDraft,
} from './CampaignSettingsFields';
import { ImagePicker } from './ImagePicker';

/**
 * The same sheet the table was created from, plus what only an existing
 * table has: a banner (it needs a campaign to be filed under), a status, and
 * the way out. The rules themselves live in `CampaignSettingsFields`, shared
 * with creation, so this page cannot offer a setting the other lacks.
 */
export function CampaignManageForm({ campaign }: { campaign: CampaignRow }) {
  const router = useRouter();
  const { settings } = campaign;
  const { confirm, dialog } = useConfirm();
  const [form, setForm] = useState({
    name: campaign.name,
    description: campaign.description,
    maxPlayers: settings.maxPlayers,
    bannerImageId: settings.bannerImageId,
  });
  const [draft, setDraft] = useState(() => draftFromSettings(settings));
  const [status, setStatus] = useState(campaign.status);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{
    kind: 'ok' | 'err';
    text: string;
  } | null>(null);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setBanner(null);
    try {
      const res = await updateCampaignAction(campaign.id, {
        name: form.name,
        description: form.description,
        settings: {
          rpgSystem: settings.rpgSystem,
          maxPlayers: form.maxPlayers,
          bannerImageId: form.bannerImageId,
          ...settingsFromDraft(draft),
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
    <div className="flex flex-col gap-5">
      {dialog}
      {banner && (
        <p
          role={banner.kind === 'err' ? 'alert' : 'status'}
          className={`rounded-md border px-3 py-2 text-sm ${
            banner.kind === 'ok'
              ? 'border-success/40 bg-success/10 text-success'
              : 'border-danger/40 bg-danger/10 text-danger'
          }`}
        >
          {banner.text}
        </p>
      )}

      <form onSubmit={save} className="flex flex-col gap-5">
        <SectionCard title="The table">
          <div className="flex flex-col gap-5">
            <Input
              label="Campaign name"
              value={form.name}
              onValueChange={v => set('name', v)}
              isRequired
            />
            <Textarea
              label="Description"
              value={form.description}
              onValueChange={v => set('description', v)}
              minRows={3}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberInput
                label="Max players"
                minValue={1}
                maxValue={20}
                value={form.maxPlayers}
                onValueChange={v => set('maxPlayers', Number(v) || 6)}
              />
              <div className="flex items-end pb-2 text-sm text-ink-muted">
                D&amp;D 5e (2024), with the SRD on the shelves.
              </div>
            </div>
            <ImagePicker
              campaignId={campaign.id}
              label="Banner"
              value={form.bannerImageId}
              onChange={id => set('bannerImageId', id)}
            />
            <p className="-mt-2 text-xs text-ink-subtle">
              Shown across the top of the campaign page and on its card. Save
              after choosing one.
            </p>
          </div>
        </SectionCard>

        <CampaignSettingsFields draft={draft} onChange={setDraft} />

        <div>
          <Button type="submit" color="primary" isLoading={saving}>
            Save changes
          </Button>
        </div>
      </form>

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

      <SectionCard
        title="Ending the campaign"
        description="Deleting takes every session, quest, canon entry and downtime record filed under this table with it. There is no undo."
      >
        <Button color="danger" variant="flat" onPress={remove}>
          Delete campaign
        </Button>
      </SectionCard>
    </div>
  );
}
