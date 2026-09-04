'use client';

import { Button, Link, Snippet, Tab, Tabs } from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

import {
  Fleuron,
  Glyph,
  Ledger,
  Marginalia,
  PageHeader,
  PageShell,
  Ribbon,
  SectionCard,
  type GlyphName,
} from '@/@shared/components/ui';
import { countdownWords, formatCalendarDate } from '@/@shared/lib/dates';
import type { CampaignPulse } from '@/server/campaign-pulse';
import type { CampaignRow } from '@/server/campaigns';
import { getCampaignPulseAction } from '../chronicle-actions';
import { CanonPanel } from './CanonPanel';
import { ChroniclePanel } from './ChroniclePanel';
import { DowntimePanel } from './DowntimePanel';
import { HomebrewApprovalPanel } from './HomebrewApprovalPanel';
import { LedgerPanel } from './LedgerPanel';
import { MembersPanel } from './MembersPanel';
import { PartySecrets } from './PartySecrets';
import { QuestPanel } from './QuestPanel';
import { SessionPanel } from './session/SessionPanel';

const ROLE_LABEL = { gm: 'DM', 'co-gm': 'Co-DM', player: 'Player' } as const;
const ROLE_TONE = { gm: 'gold', 'co-gm': 'arcane', player: 'neutral' } as const;

/** "1 thread" / "3 threads" — a count line that reads as a sentence. */
function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/**
 * A tab title: a glyph, a one-word name, and a count of things wanting
 * attention.
 *
 * The glyph is what makes seven tabs scannable rather than a wall of words,
 * and it is the part that survives the horizontal scroll on a phone. The
 * count only ever appears when there is something to do — a tab wearing a "0"
 * is furniture — and `getCampaignPulse` already returns zero for the
 * staff-facing queues when a player is asking, so a player never sees a badge
 * for someone else's pending submission.
 */
function TabTitle({
  glyph,
  label,
  count,
}: {
  glyph: GlyphName;
  label: string;
  count?: number;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <Glyph name={glyph} size={15} className="opacity-70" />
      {label}
      {!!count && count > 0 && (
        <span className="rounded-full bg-gold/20 px-1.5 text-[0.65rem] font-medium tabular-nums text-gold-strong dark:text-gold">
          {count}
        </span>
      )}
    </span>
  );
}

/**
 * The campaign, as a single object (design language: Single object archetype).
 *
 * The page opens on the table itself — the party, initiative, the dice — and
 * the numbers under the title are set as a sentence rather than a row of
 * tiles, because they are context for the page and not its subject.
 */
export function CampaignDetail({
  campaign,
  viewerId,
}: {
  campaign: CampaignRow;
  viewerId: string;
}) {
  const isStaff = campaign.role === 'gm' || campaign.role === 'co-gm';
  const [pulse, setPulse] = useState<CampaignPulse | null>(null);

  const loadPulse = useCallback(async () => {
    setPulse(await getCampaignPulseAction(campaign.id));
  }, [campaign.id]);

  useEffect(() => {
    loadPulse();
  }, [loadPulse]);

  const soon = pulse?.next ? countdownWords(pulse.next.date) : null;

  return (
    <PageShell width="wide">
      {campaign.settings.bannerImageId && (
        // Deliberately an <img>: the file is served through a role-checked
        // route, which next/image's optimiser cannot fetch on the server.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/campaigns/${campaign.id}/images/${campaign.settings.bannerImageId}`}
          alt=""
          className="mb-6 h-40 w-full rounded-[var(--radius-card)] border border-line object-cover [box-shadow:var(--shadow-card)] sm:h-52"
        />
      )}

      <PageHeader
        rule={false}
        title={campaign.name}
        description={campaign.description || undefined}
        actions={
          <>
            <Ribbon tone={ROLE_TONE[campaign.role]}>
              {ROLE_LABEL[campaign.role]}
            </Ribbon>
            {isStaff && (
              <Button
                as={Link}
                href={`/campaigns/${campaign.id}/manage`}
                size="sm"
                variant="flat"
              >
                Manage
              </Button>
            )}
          </>
        }
      />

      {/* The state of the table: a ledger line, not a grid of tiles. */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        {pulse ? (
          <Ledger
            items={[
              { value: campaign.memberCount, label: 'at the table' },
              {
                value: pulse.sessionsPlayed,
                label: plural(
                  pulse.sessionsPlayed,
                  'session played',
                  'sessions played'
                ),
              },
              {
                value: pulse.questsInHand,
                label: plural(
                  pulse.questsInHand,
                  'thread in hand',
                  'threads in hand'
                ),
              },
            ]}
          />
        ) : (
          <span className="h-4 w-72 animate-pulse rounded bg-surface-2" />
        )}

        {pulse?.next && (
          <p className="text-sm text-ink-muted">
            <span className="font-display-alt text-[0.6rem] uppercase tracking-[0.16em] text-ink-subtle">
              Next
            </span>{' '}
            <span className="text-ink">
              Session {pulse.next.number}
              {pulse.next.title ? ` · ${pulse.next.title}` : ''}
            </span>{' '}
            <span className="text-ink-subtle">
              {formatCalendarDate(pulse.next.date)}
              {soon ? ` — ${soon}` : ''}
            </span>
          </p>
        )}
      </div>

      <Fleuron />

      <div className="mt-5">
        {/* Moving tabs re-reads the counts: a quest pinned or a recap handed
            over changes the ledger line, and a stale number is worse than a
            slightly late one. */}
        <Tabs
          aria-label="Campaign sections"
          variant="underlined"
          onSelectionChange={() => loadPulse()}
          classNames={{
            // Seven tabs overflow a phone. Let the list scroll rather than
            // wrap into a second row that pushes the panel off-screen.
            tabList: 'max-w-full overflow-x-auto',
          }}
        >
          <Tab key="table" title={<TabTitle glyph="die" label="Session" />}>
            <div className="pt-4">
              <SessionPanel campaignId={campaign.id} />
            </div>
          </Tab>

          <Tab key="party" title={<TabTitle glyph="person" label="Party" />}>
            <div className="space-y-5 pt-4">
              <MembersPanel
                campaignId={campaign.id}
                viewerId={viewerId}
                viewerRole={campaign.role}
              />

              {isStaff && campaign.joinCode && (
                <SectionCard
                  title="Join code"
                  description="Share this so players can join themselves."
                >
                  <Snippet symbol="" variant="flat" className="bg-surface-2">
                    {campaign.joinCode}
                  </Snippet>
                </SectionCard>
              )}

              <PartySecrets campaignId={campaign.id} />
              <LedgerPanel campaignId={campaign.id} />

              {campaign.settings.customRules && (
                <SectionCard title="House rules">
                  <p className="whitespace-pre-wrap text-sm text-ink-muted">
                    {campaign.settings.customRules}
                  </p>
                </SectionCard>
              )}
              {campaign.settings.sessionNotes && (
                <SectionCard
                  title="Table notes"
                  description="Standing notes about how this table runs."
                >
                  <p className="whitespace-pre-wrap text-sm text-ink-muted">
                    {campaign.settings.sessionNotes}
                  </p>
                </SectionCard>
              )}
            </div>
          </Tab>

          <Tab key="quests" title={<TabTitle glyph="scroll" label="Quests" />}>
            <div className="pt-4">
              <QuestPanel campaignId={campaign.id} viewerRole={campaign.role} />
            </div>
          </Tab>

          <Tab
            key="chronicle"
            title={
              <TabTitle
                glyph="notebook"
                label="Chronicle"
                count={pulse?.unsentRecaps ?? 0}
              />
            }
          >
            <div className="pt-4">
              <ChroniclePanel
                campaignId={campaign.id}
                viewerRole={campaign.role}
              />
            </div>
          </Tab>

          <Tab key="canon" title={<TabTitle glyph="tome" label="Canon" />}>
            <div className="pt-4">
              <CanonPanel
                campaignId={campaign.id}
                viewerId={viewerId}
                viewerRole={campaign.role}
              />
            </div>
          </Tab>

          <Tab
            key="downtime"
            title={
              <TabTitle
                glyph="hourglass"
                label="Downtime"
                count={pulse?.openDowntime ?? 0}
              />
            }
          >
            <div className="pt-4">
              <DowntimePanel
                campaignId={campaign.id}
                viewerId={viewerId}
                viewerRole={campaign.role}
              />
            </div>
          </Tab>

          <Tab
            key="homebrew"
            title={
              <TabTitle
                glyph="orb"
                label="Homebrew"
                count={pulse?.pendingApprovals ?? 0}
              />
            }
          >
            <div className="pt-4">
              <HomebrewApprovalPanel campaignId={campaign.id} isGM={isStaff} />
            </div>
          </Tab>
        </Tabs>
      </div>

      {isStaff && pulse && !pulse.next && (
        <Marginalia className="mt-6" dash>
          no next session on the books — open one in the chronicle
        </Marginalia>
      )}
    </PageShell>
  );
}
