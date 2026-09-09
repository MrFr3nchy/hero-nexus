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
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { listCampaignsAction } from '@/@creator/campaign/actions';
import { StatBlock } from '@/@shared/components/StatBlock';
import {
  DiceSpinner,
  EmptyState,
  ForgeScene,
  Glyph,
  Seal,
  SectionCard,
  useConfirm,
} from '@/@shared/components/ui';
import {
  contentMeta,
  emptyContentData,
  parseContentData,
  type ContentEntry,
  type ContentType,
} from '@/@shared/content';
import type { ApprovalRow } from '@/server/approvals';
import type { CampaignRow } from '@/server/campaigns';
import type { HomebrewRow } from '@/server/homebrew';

import {
  deleteHomebrewAction,
  listHomebrewAction,
  listMyApprovalsAction,
  saveHomebrewAction,
  submitHomebrewToCampaignAction,
} from '../actions';
import { HOMEBREW_TYPES } from '../schema';
import { ContentDataForm } from './forms/ContentDataForm';

/**
 * The Forge.
 *
 * Every type gets the fields its SRD equivalent has, and the stat block beside
 * the form is the real renderer — what you see while writing a spell is
 * exactly what the DM sees in the approval queue and what a player sees on a
 * sheet. Design rule 1: the object is the hero, so the object is on screen the
 * whole time rather than described by the form.
 */

interface Draft {
  id: string | null;
  type: ContentType;
  name: string;
  description: string;
  visibility: 'private' | 'public';
  data: unknown;
}

function newDraft(type: ContentType = 'spell'): Draft {
  return {
    id: null,
    type,
    name: '',
    description: '',
    visibility: 'private',
    data: emptyContentData(type),
  };
}

function draftFromRow(row: HomebrewRow): Draft {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    description: row.description,
    visibility: row.visibility,
    data: parseContentData(row.type, row.data),
  };
}

/** The draft as the thing it will become, so the preview is never a mock-up. */
function draftEntry(draft: Draft): ContentEntry {
  return {
    ref: { source: 'homebrew', type: draft.type, key: draft.id ?? 'draft' },
    type: draft.type,
    name:
      draft.name.trim() ||
      `Unnamed ${contentMeta(draft.type).label.toLowerCase()}`,
    description: draft.description,
    data: draft.data,
  };
}

export function HomebrewCreator({
  initialType,
  initialId,
}: {
  /** The kind the `+` that sent you here was standing on. */
  initialType?: ContentType;
  /** An existing draft to open, from "Edit in the forge" on a shelf. */
  initialId?: string;
} = {}) {
  const [items, setItems] = useState<HomebrewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { confirm, dialog } = useConfirm();

  const [draft, setDraft] = useState<Draft>(() => newDraft(initialType));
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

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Opening `?id=` waits for the list, because the row is where the draft
   * comes from. Keyed on the id so switching from one shelf entry to another
   * re-opens; editing the loaded draft afterwards does not pull it back, since
   * `items` only changes on a save.
   */
  useEffect(() => {
    if (!initialId) return;
    const row = items.find(i => i.id === initialId);
    if (row) setDraft(draftFromRow(row));
  }, [initialId, items]);

  /**
   * Only tables that actually allow homebrew. Offering to submit to a table
   * whose DM has switched homebrew off wastes everybody's time — the request
   * would queue and sit there.
   */
  const submittableCampaigns = useMemo(
    () => campaigns.filter(c => c.settings.allowHomebrew),
    [campaigns]
  );

  /**
   * Tables this item cannot be sent to again, and why.
   *
   * Filtering the dropdown to tables that allow homebrew was only half the
   * job: an item already in play there, or already waiting in the queue, has
   * nothing to submit. Re-sending an approved one resets it to pending and
   * takes it out of the library, which reads to the player as their own
   * approved content being revoked.
   */
  const blockedFor = useCallback(
    (homebrewId: string): Map<string, string> => {
      const out = new Map<string, string>();
      for (const a of approvals) {
        if (a.homebrewId !== homebrewId) continue;
        if (a.status === 'approved') out.set(a.campaignId, 'already in play');
        else if (a.status === 'pending')
          out.set(a.campaignId, 'awaiting the DM');
      }
      return out;
    },
    [approvals]
  );

  const submitTo = async (homebrewId: string, campaignId: string) => {
    const res = await submitHomebrewToCampaignAction(homebrewId, campaignId);
    if (!res.ok) setError(res.error ?? 'Failed to submit.');
    setApprovals(await listMyApprovalsAction());
  };

  const changeType = (type: ContentType) =>
    // A spell's fields mean nothing to an item, so the stat data resets while
    // the prose the author has already written is kept.
    setDraft(d => ({ ...d, type, data: emptyContentData(type) }));

  const handleSave = async () => {
    setError(null);
    if (!draft.name.trim()) {
      setError('Name is required.');
      return;
    }
    setSaving(true);
    try {
      const result = await saveHomebrewAction(
        {
          type: draft.type,
          name: draft.name,
          description: draft.description,
          visibility: draft.visibility,
          data: draft.data,
        },
        draft.id ?? undefined
      );
      if (!result.ok) {
        setError(result.error ?? 'Failed to save.');
        return;
      }
      setDraft(newDraft(draft.type));
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Scrap this homebrew?',
      body: 'The draft and any pending submission are removed.',
      confirmLabel: 'Scrap it',
      destructive: true,
    });
    if (!ok) return;
    await deleteHomebrewAction(id);
    setItems(prev => prev.filter(i => i.id !== id));
    if (draft.id === id) setDraft(newDraft());
  };

  const meta = contentMeta(draft.type);

  return (
    <div className="space-y-6">
      {dialog}

      <SectionCard
        framed
        title={
          draft.id ? `Editing ${draft.name || meta.label}` : 'Forge homebrew'
        }
        description={meta.description}
        actions={
          <div className="flex items-center gap-2">
            {/* Somebody staring at an empty form is exactly who needs this. */}
            <Button
              as={Link}
              href="/creator/homebrew/guide"
              size="sm"
              variant="light"
              className="text-ink-muted data-[hover=true]:text-gold-strong"
              startContent={<Glyph name="tome" size={15} />}
            >
              How this works
            </Button>
            {draft.id && (
              <Button
                size="sm"
                variant="flat"
                onPress={() => setDraft(newDraft())}
              >
                New draft
              </Button>
            )}
          </div>
        }
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          {/* The form */}
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                size="sm"
                label="Name"
                value={draft.name}
                onValueChange={v => setDraft(d => ({ ...d, name: v }))}
              />
              <Select
                size="sm"
                label="Type"
                selectedKeys={[draft.type]}
                isDisabled={draft.id !== null}
                description={
                  draft.id ? 'Type is fixed once forged.' : undefined
                }
                onSelectionChange={keys =>
                  changeType(Array.from(keys)[0] as ContentType)
                }
              >
                {HOMEBREW_TYPES.map(t => (
                  <SelectItem key={t.id} textValue={t.name}>
                    <span className="flex items-center gap-2">
                      <Glyph name={t.glyph} size={15} />
                      {t.name}
                    </span>
                  </SelectItem>
                ))}
              </Select>
            </div>

            <Textarea
              size="sm"
              label="Description"
              value={draft.description}
              onValueChange={v => setDraft(d => ({ ...d, description: v }))}
              minRows={3}
              placeholder="What it is, in the voice of the rulebook."
            />

            <div className="border-t border-line pt-4">
              <ContentDataForm
                type={draft.type}
                value={draft.data}
                onChange={data => setDraft(d => ({ ...d, data }))}
              />
            </div>

            {/*
              A flex column, not `space-y-4`: HeroUI renders both the Switch
              and the Button `inline-flex`, so vertical spacing does nothing
              between them and the two shared a line with the button sitting
              flush against the end of the switch's label. This is the case
              the design language bans by name.
            */}
            <div className="flex flex-col items-start gap-4">
              <Switch
                className="max-w-full"
                classNames={{ label: 'ml-2 text-sm text-ink-muted' }}
                isSelected={draft.visibility === 'public'}
                onValueChange={v =>
                  setDraft(d => ({
                    ...d,
                    visibility: v ? 'public' : 'private',
                  }))
                }
              >
                Share to the public marketplace
              </Switch>

              {error && (
                <p className="w-full rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {error}
                </p>
              )}

              <Button
                color="primary"
                isLoading={saving}
                isDisabled={!draft.name.trim()}
                onPress={handleSave}
              >
                {draft.id
                  ? 'Save changes'
                  : `Forge ${meta.label.toLowerCase()}`}
              </Button>
            </div>
          </div>

          {/* The thing itself */}
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <div className="rounded-[var(--radius-card)] border border-line bg-surface-2/40 p-4">
              <p className="mb-3 font-display-alt text-[0.65rem] uppercase tracking-[0.14em] text-ink-subtle">
                As it will be read
              </p>
              <StatBlock entry={draftEntry(draft)} showSource={false} />
            </div>
          </aside>
        </div>
      </SectionCard>

      <SectionCard title={`Your homebrew (${items.length})`}>
        {loading ? (
          <div className="flex justify-center py-8">
            <DiceSpinner label="Consulting the archive…" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            scene={<ForgeScene />}
            title="The anvil is cold"
            description="Whatever you make here — a class, a spell, a blade — lands on this shelf, and can be submitted to any table you play at."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map(item => {
              const itemApprovals = approvals.filter(
                a => a.homebrewId === item.id
              );
              const itemMeta = contentMeta(item.type);
              return (
                <div
                  key={item.id}
                  className="flex flex-col rounded-[var(--radius-card)] border border-line bg-surface p-4"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2 font-medium text-ink">
                      <Glyph
                        name={itemMeta.glyph}
                        size={16}
                        className="text-gold"
                      />
                      <span className="truncate">{item.name}</span>
                    </span>
                    <Chip size="sm" variant="flat" className="bg-surface-2">
                      {itemMeta.label}
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

                  <div className="mt-auto flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="flat"
                      onPress={() => {
                        setDraft(draftFromRow(item));
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    >
                      Edit
                    </Button>
                    {submittableCampaigns.length > 0 &&
                      (() => {
                        const blocked = blockedFor(item.id);
                        return (
                          <Dropdown>
                            <DropdownTrigger>
                              <Button
                                size="sm"
                                variant="flat"
                                className="flex-1"
                                isDisabled={
                                  blocked.size >= submittableCampaigns.length
                                }
                              >
                                Submit to…
                              </Button>
                            </DropdownTrigger>
                            <DropdownMenu
                              aria-label="Submit to campaign"
                              disabledKeys={[...blocked.keys()]}
                              onAction={key => submitTo(item.id, String(key))}
                            >
                              {submittableCampaigns.map(c => (
                                <DropdownItem
                                  key={c.id}
                                  description={blocked.get(c.id)}
                                >
                                  {c.name}
                                </DropdownItem>
                              ))}
                            </DropdownMenu>
                          </Dropdown>
                        );
                      })()}
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
