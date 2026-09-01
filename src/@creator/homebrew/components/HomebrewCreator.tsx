'use client';

import {
  Button,
  Chip,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Input,
  Select,
  SelectItem,
  Switch,
  Textarea,
} from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

import { listCampaignsAction } from '@/@creator/campaign/actions';
import {
  DiceSpinner,
  EmptyState,
  Seal,
  SectionCard,
} from '@/@shared/components/ui';
import type { ApprovalRow } from '@/server/approvals';
import type { CampaignRow } from '@/server/campaigns';
import type { HomebrewRow, HomebrewType } from '@/server/homebrew';
import {
  deleteHomebrewAction,
  listHomebrewAction,
  listMyApprovalsAction,
  saveHomebrewAction,
  submitHomebrewToCampaignAction,
} from '../actions';
import { HOMEBREW_TYPES, homebrewSchema } from '../schema';

export function HomebrewCreator() {
  const [items, setItems] = useState<HomebrewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    type: 'item' as HomebrewType,
    name: '',
    description: '',
    visibility: 'private' as 'private' | 'public',
  });

  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [hb, camps, apps] = await Promise.all([
        listHomebrewAction(),
        listCampaignsAction(),
        listMyApprovalsAction(),
      ]);
      setItems(hb);
      setCampaigns(camps);
      setApprovals(apps);
    } catch {
      setError('Failed to load your homebrew.');
    } finally {
      setLoading(false);
    }
  }, []);

  const submitTo = async (homebrewId: string, campaignId: string) => {
    const res = await submitHomebrewToCampaignAction(homebrewId, campaignId);
    if (!res.ok) setError(res.error ?? 'Failed to submit.');
    setApprovals(await listMyApprovalsAction());
  };

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    setError(null);
    const parsed = homebrewSchema.safeParse({ ...form, data: {} });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid input.');
      return;
    }
    setSaving(true);
    try {
      const result = await saveHomebrewAction(parsed.data);
      if (!result.ok) {
        setError(result.error ?? 'Failed to save.');
        return;
      }
      setForm({
        type: 'item',
        name: '',
        description: '',
        visibility: 'private',
      });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this homebrew item?')) return;
    await deleteHomebrewAction(id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const typeMeta = (type: HomebrewType) =>
    HOMEBREW_TYPES.find(t => t.id === type) ?? HOMEBREW_TYPES[2];

  return (
    <div className="space-y-6">
      <SectionCard title="Create homebrew">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Name"
              value={form.name}
              onValueChange={v => setForm(f => ({ ...f, name: v }))}
            />
            <Select
              label="Type"
              selectedKeys={[form.type]}
              onSelectionChange={keys =>
                setForm(f => ({
                  ...f,
                  type: Array.from(keys)[0] as HomebrewType,
                }))
              }
            >
              {HOMEBREW_TYPES.map(t => (
                <SelectItem key={t.id}>
                  {t.icon} {t.name}
                </SelectItem>
              ))}
            </Select>
          </div>
          <Textarea
            label="Description"
            value={form.description}
            onValueChange={v => setForm(f => ({ ...f, description: v }))}
            minRows={4}
          />
          <Switch
            isSelected={form.visibility === 'public'}
            onValueChange={v =>
              setForm(f => ({
                ...f,
                visibility: v ? 'public' : 'private',
              }))
            }
          >
            <span className="text-sm text-ink-muted">
              Share to the public marketplace
            </span>
          </Switch>

          {error && (
            <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <Button
            color="primary"
            isLoading={saving}
            isDisabled={!form.name.trim()}
            onPress={handleCreate}
          >
            Create {typeMeta(form.type).name.toLowerCase()}
          </Button>
        </div>
      </SectionCard>

      <SectionCard title={`Your homebrew (${items.length})`}>
        {loading ? (
          <div className="flex justify-center py-8">
            <DiceSpinner label="Consulting the archive…" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon="🧪"
            title="Nothing brewed yet"
            description="Create a class, spell or item above."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map(item => {
              const itemApprovals = approvals.filter(
                a => a.homebrewId === item.id
              );
              return (
                <div
                  key={item.id}
                  className="flex flex-col rounded-[var(--radius-card)] border border-line bg-surface p-4"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-2 font-medium text-ink">
                      <span>{typeMeta(item.type).icon}</span>
                      {item.name}
                    </span>
                    <Chip size="sm" variant="flat" className="bg-surface-2">
                      {item.visibility}
                    </Chip>
                  </div>
                  <p className="mb-3 line-clamp-3 text-sm text-ink-muted">
                    {item.description || 'No description.'}
                  </p>

                  {itemApprovals.length > 0 && (
                    <ul className="mb-3 space-y-1">
                      {itemApprovals.map(a => (
                        <li
                          key={a.id}
                          className="flex items-center gap-1.5 text-xs text-ink-muted"
                          title={a.reviewNotes ?? undefined}
                        >
                          <Seal
                            variant={a.status}
                            showLabel={false}
                            size={15}
                          />
                          <span className="truncate">{a.campaignName}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-auto flex gap-2">
                    {campaigns.length > 0 && (
                      <Dropdown>
                        <DropdownTrigger>
                          <Button size="sm" variant="flat" className="flex-1">
                            Submit to…
                          </Button>
                        </DropdownTrigger>
                        <DropdownMenu
                          aria-label="Submit to campaign"
                          onAction={key => submitTo(item.id, String(key))}
                        >
                          {campaigns.map(c => (
                            <DropdownItem key={c.id}>{c.name}</DropdownItem>
                          ))}
                        </DropdownMenu>
                      </Dropdown>
                    )}
                    <Button
                      size="sm"
                      variant="light"
                      className="text-ink-muted data-[hover=true]:text-danger"
                      onPress={() => handleDelete(item.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
