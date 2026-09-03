'use client';

import {
  Button,
  Checkbox,
  CheckboxGroup,
  Input,
  NumberInput,
  Select,
  SelectItem,
  Switch,
  Textarea,
} from '@heroui/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { RPG_SYSTEMS } from '@/@creator/campaign/types';
import { ABILITY_METHODS } from '@/@creator/character/schema';
import { SectionCard, useConfirm } from '@/@shared/components/ui';
import type { CampaignRow } from '@/server/campaigns';
import {
  deleteCampaignAction,
  setCampaignStatusAction,
  updateCampaignAction,
} from '../actions';

const METHOD_LABELS: Record<(typeof ABILITY_METHODS)[number], string> = {
  manual: 'Manual',
  pointbuy: 'Point Buy',
  standard: 'Standard Array',
  roll: 'Roll',
};

const parseList = (raw: string): string[] =>
  raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

export function CampaignManageForm({ campaign }: { campaign: CampaignRow }) {
  const router = useRouter();
  const { settings } = campaign;
  const { confirm, dialog } = useConfirm();
  const [form, setForm] = useState({
    name: campaign.name,
    description: campaign.description,
    rpgSystem: settings.rpgSystem,
    maxPlayers: settings.maxPlayers,
    sessionNotes: settings.sessionNotes,
    customRules: settings.customRules,
    // homebrew toggles (previously had no UI)
    allowHomebrew: settings.allowHomebrew,
    requireHomebrewApproval: settings.requireHomebrewApproval,
    allowPublicHomebrew: settings.allowPublicHomebrew,
    // structured table rules
    abilityMethods: settings.rules.abilityMethods as string[],
    allowMulticlass: settings.rules.allowMulticlass,
    maxStartingLevel: settings.rules.maxStartingLevel,
    requireBackstory: settings.rules.requireBackstory,
    allowedSources: settings.rules.allowedSources.join(', '),
    bannedSpecies: settings.rules.bannedSpecies.join(', '),
    bannedClasses: settings.rules.bannedClasses.join(', '),
  });
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
          rpgSystem: form.rpgSystem,
          maxPlayers: form.maxPlayers,
          sessionNotes: form.sessionNotes,
          customRules: form.customRules,
          allowHomebrew: form.allowHomebrew,
          requireHomebrewApproval: form.requireHomebrewApproval,
          allowPublicHomebrew: form.allowPublicHomebrew,
          rules: {
            abilityMethods: form.abilityMethods.filter(
              (m): m is (typeof ABILITY_METHODS)[number] =>
                (ABILITY_METHODS as readonly string[]).includes(m)
            ),
            allowMulticlass: form.allowMulticlass,
            maxStartingLevel: form.maxStartingLevel,
            requireBackstory: form.requireBackstory,
            allowedSources: parseList(form.allowedSources),
            bannedSpecies: parseList(form.bannedSpecies),
            bannedClasses: parseList(form.bannedClasses),
          },
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

      <form onSubmit={save} className="space-y-5">
        <SectionCard title="Details">
          <div className="space-y-5">
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
              <Select
                label="System"
                selectedKeys={[form.rpgSystem]}
                onSelectionChange={keys =>
                  set(
                    'rpgSystem',
                    String(Array.from(keys)[0] ?? form.rpgSystem)
                  )
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
                onValueChange={v => set('maxPlayers', Number(v) || 6)}
              />
            </div>
            <Textarea
              label="Session notes"
              value={form.sessionNotes}
              onValueChange={v => set('sessionNotes', v)}
              minRows={3}
            />
            <Textarea
              label="House rules (free text — for the table to read)"
              value={form.customRules}
              onValueChange={v => set('customRules', v)}
              minRows={3}
            />
          </div>
        </SectionCard>

        <SectionCard title="Table rules (enforced in the character builder)">
          <div className="space-y-5">
            <CheckboxGroup
              label="Ability score methods players may use"
              orientation="horizontal"
              value={form.abilityMethods}
              onValueChange={v => set('abilityMethods', v)}
            >
              {ABILITY_METHODS.map(m => (
                <Checkbox key={m} value={m}>
                  {METHOD_LABELS[m]}
                </Checkbox>
              ))}
            </CheckboxGroup>
            {form.abilityMethods.length === 0 && (
              <p className="text-xs text-danger">
                Pick at least one — an empty list would leave players no way to
                set ability scores.
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <NumberInput
                label="Highest starting level"
                minValue={1}
                maxValue={20}
                value={form.maxStartingLevel}
                onValueChange={v => set('maxStartingLevel', Number(v) || 1)}
              />
            </div>

            <div className="flex flex-col gap-3">
              <Switch
                isSelected={form.allowMulticlass}
                onValueChange={v => set('allowMulticlass', v)}
              >
                Allow multiclassing
              </Switch>
              <Switch
                isSelected={form.requireBackstory}
                onValueChange={v => set('requireBackstory', v)}
              >
                Require a backstory before joining
              </Switch>
            </div>

            <Input
              label="Species not allowed (comma-separated)"
              value={form.bannedSpecies}
              onValueChange={v => set('bannedSpecies', v)}
              placeholder="e.g. Custom Lineage, Warforged"
            />
            <Input
              label="Classes not allowed (comma-separated)"
              value={form.bannedClasses}
              onValueChange={v => set('bannedClasses', v)}
              placeholder="e.g. Artificer"
            />
            <Input
              label="Sources in use (comma-separated — for reference, not enforced)"
              value={form.allowedSources}
              onValueChange={v => set('allowedSources', v)}
              placeholder="e.g. PHB 2024, Xanathar's"
            />
          </div>
        </SectionCard>

        <SectionCard title="Homebrew">
          <div className="flex flex-col gap-3">
            <Switch
              isSelected={form.allowHomebrew}
              onValueChange={v => set('allowHomebrew', v)}
            >
              Allow homebrew content on character sheets
            </Switch>
            <Switch
              isSelected={form.requireHomebrewApproval}
              onValueChange={v => set('requireHomebrewApproval', v)}
              isDisabled={!form.allowHomebrew}
            >
              Require DM approval for each homebrew entry
            </Switch>
            <Switch
              isSelected={form.allowPublicHomebrew}
              onValueChange={v => set('allowPublicHomebrew', v)}
              isDisabled={!form.allowHomebrew}
            >
              Allow players to pull in publicly shared homebrew
            </Switch>
            {!form.requireHomebrewApproval && form.allowHomebrew && (
              <p className="text-xs text-ink-subtle">
                With approval off, homebrew entries are recorded as approved
                automatically and the review queue stays empty.
              </p>
            )}
          </div>
        </SectionCard>

        <Button type="submit" color="primary" isLoading={saving}>
          Save changes
        </Button>
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

      <SectionCard title="Danger zone">
        <Button color="danger" variant="flat" onPress={remove}>
          Delete campaign
        </Button>
      </SectionCard>
    </div>
  );
}
