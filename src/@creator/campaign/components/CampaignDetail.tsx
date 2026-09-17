'use client';

import { Button, Link, Snippet, Tab, Tabs } from '@heroui/react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

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
import { AtTable } from '@/@shared/table';
import type { CampaignPulse } from '@/server/campaign-pulse';
import type { CampaignRow } from '@/server/campaigns';
import { getCampaignPulseAction } from '../chronicle-actions';
import { describeRules } from '../lib/rules';
import type { TableKind } from '../lib/screen';
import { describeTableRules } from '../lib/table-rules';
import { CampaignSearch } from './CampaignSearch';
import { CanonPanel } from './CanonPanel';
import { AwardsPanel } from './AwardsPanel';
import { ChroniclePanel } from './ChroniclePanel';
import { ClocksPanel } from './ClocksPanel';
import { DowntimePanel } from './DowntimePanel';
import { CampaignContentPanel } from './CampaignContentPanel';
import { HomebrewApprovalPanel } from './HomebrewApprovalPanel';
import { LedgerPanel } from './LedgerPanel';
import { JournalPanel } from './JournalPanel';
import { MapPanel } from './MapPanel';
import { MembersPanel } from './MembersPanel';
import { NotebookPanel, SharedNotes } from './NotebookPanel';
import { PartySecrets } from './PartySecrets';
import { QuestPanel } from './QuestPanel';
import { RevealTimeline } from './RevealTimeline';
import { EncounterPlanner } from './EncounterPlanner';
import { BoardShelf } from './workshop/BoardShelf';

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
 * Which tab opens at each of the three tables.
 *
 * The desk opens on the chronicle — between sittings a campaign is a record.
 * While the table is sitting, or a fight is running, play happens on the
 * screen and this page is the record behind it, so it opens on the party.
 * The strip's order never changes: a tab that is first on Tuesday and fourth
 * on Friday costs muscle memory, which is the main thing a four-hour tool has.
 */
const LEADING_TAB: Record<TableKind, string> = {
  desk: 'chronicle',
  table: 'party',
  battle: 'party',
};

/**
 * The campaign, as a single object (design language: Single object archetype).
 *
 * The page opens on whichever of the three tables the campaign is at — the
 * chronicle between sittings, the session while one is sitting, the board
 * while a fight is running — and the numbers under the title are set as a
 * sentence rather than a row of tiles, because they are context for the page
 * and not its subject.
 */
export function CampaignDetail({
  campaign,
  viewerId,
  table,
}: {
  campaign: CampaignRow;
  viewerId: string;
  /** Which of the three tables the campaign is at, read when the page opened. */
  table: TableKind;
}) {
  const isStaff = campaign.role === 'gm' || campaign.role === 'co-gm';
  const ruleLines = [
    ...describeTableRules(campaign.settings.table, { omit: ['mode'] }),
    ...describeRules(campaign.settings.rules, {
      allowHomebrew: campaign.settings.allowHomebrew,
    }),
  ];
  const [pulse, setPulse] = useState<CampaignPulse | null>(null);
  // Bumped when the notebook reveals something, so the timeline beside it
  // re-reads without the DM having to leave the tab and come back.
  const [revealSeq, setRevealSeq] = useState(0);

  const loadPulse = useCallback(async () => {
    setPulse(await getCampaignPulseAction(campaign.id));
  }, [campaign.id]);

  useEffect(() => {
    loadPulse();
  }, [loadPulse]);

  const soon = pulse?.next ? countdownWords(pulse.next.date) : null;

  /*
   * The tabs, in the order they have always had. Play is not among them: the
   * screen at `/campaigns/[id]/screen` is the one surface a table plays from,
   * and the Session and Board tabs that used to copy it are gone.
   */
  const tabs: { key: string; title: ReactNode; content: ReactNode }[] = [
    {
      key: 'party',
      title: <TabTitle glyph="person" label="Party" />,
      content: (
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

          {/* The same lines "Rules at hand" shows at the table, so the
              campaign page and the screen cannot disagree about the rules. */}
          {(ruleLines.length > 0 ||
            campaign.settings.customRules ||
            campaign.settings.table.mode === 'enforce') && (
            <SectionCard
              title="This table plays by"
              description={
                campaign.settings.table.mode === 'enforce'
                  ? 'The app enforces these. The DM can overrule any refusal.'
                  : 'The app advises on these and refuses nothing.'
              }
            >
              <div className="space-y-3">
                {ruleLines.length > 0 && (
                  <ul className="space-y-1 text-sm text-ink-muted">
                    {ruleLines.map(line => (
                      <li key={line} className="flex gap-2">
                        <span className="text-gold">※</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {campaign.settings.customRules && (
                  <p className="whitespace-pre-wrap text-sm text-ink-muted">
                    {campaign.settings.customRules}
                  </p>
                )}
              </div>
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
      ),
    },
    {
      key: 'quests',
      title: <TabTitle glyph="scroll" label="Quests" />,
      content: (
        <div className="space-y-5 pt-4">
          <QuestPanel campaignId={campaign.id} viewerRole={campaign.role} />

          {/* Threads the party pulls on, and the ones pulling back. They
                belong on the same tab: a clock is a quest with a deadline
                the party has not been told about. */}
          <ClocksPanel campaignId={campaign.id} viewerRole={campaign.role} />
        </div>
      ),
    },
    {
      key: 'chronicle',
      title: (
        <TabTitle
          glyph="notebook"
          label="Chronicle"
          count={pulse?.unsentRecaps ?? 0}
        />
      ),
      content: (
        <div className="pt-4">
          <ChroniclePanel
            campaignId={campaign.id}
            viewerId={viewerId}
            viewerRole={campaign.role}
            calendar={campaign.settings.calendar}
          />

          {/* Awards belong beside the sittings they were earned at, not on
                a tab of their own — a DM hands out experience while marking
                the register. */}
          <AwardsPanel campaignId={campaign.id} viewerRole={campaign.role} />

          {/* Prep, not play: the ambush the party has not walked into yet
                sits with the sittings it is being built for. The screen
                carries it too, as the "Fights planned" box. */}
          {isStaff && (
            <div className="mt-5">
              <EncounterPlanner campaignId={campaign.id} />
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'notes',
      title: <TabTitle glyph="quill" label="Notes" />,
      content: (
        <div className="space-y-5 pt-4">
          {isStaff ? (
            <NotebookPanel
              campaignId={campaign.id}
              onRevealed={async () => setRevealSeq(n => n + 1)}
            />
          ) : (
            <SharedNotes campaignId={campaign.id} />
          )}

          <SectionCard
            title="What the party knows"
            description="Every line handed over, in the order it was told."
          >
            <RevealTimeline
              campaignId={campaign.id}
              viewerRole={campaign.role}
              reloadKey={revealSeq}
            />
          </SectionCard>
        </div>
      ),
    },
    {
      key: 'journal',
      // Its own mark: Notes is the DM's prep, Journal is a player's
      // in-character log, and two boxes wearing one glyph is the failure the
      // set exists to prevent.
      title: <TabTitle glyph="journal" label="Journal" />,
      content: (
        <div className="pt-4">
          <JournalPanel campaignId={campaign.id} viewerRole={campaign.role} />
        </div>
      ),
    },
    {
      key: 'canon',
      title: <TabTitle glyph="tome" label="Canon" />,
      content: (
        <div className="space-y-5 pt-4">
          <CanonPanel
            campaignId={campaign.id}
            viewerId={viewerId}
            viewerRole={campaign.role}
          />

          {/* Maps sit with the canon because a pin is a way into it: the
                places are already written down, this says where they are. */}
          <MapPanel campaignId={campaign.id} viewerRole={campaign.role} />
        </div>
      ),
    },
    {
      key: 'downtime',
      title: (
        <TabTitle
          glyph="hourglass"
          label="Downtime"
          count={pulse?.openDowntime ?? 0}
        />
      ),
      content: (
        <div className="pt-4">
          <DowntimePanel
            campaignId={campaign.id}
            viewerId={viewerId}
            viewerRole={campaign.role}
          />
        </div>
      ),
    },
    // The shelf of boards: prep furniture, so staff only — a player has
    // no board of their own and `listBattleMaps` would hand them nothing.
    // Every handle a board has is here too — into the workshop, onto the
    // table, renamed, taken down — so the DM need not open the workshop
    // to find out what is on the shelf.
    ...(isStaff
      ? [
          {
            key: 'boards',
            title: <TabTitle glyph="cube" label="Boards" />,
            content: (
              <div className="pt-4">
                <BoardShelf campaignId={campaign.id} />
              </div>
            ),
          },
        ]
      : []),
    {
      key: 'content',
      title: <TabTitle glyph="tome" label="Content" />,
      content: (
        <div className="pt-4">
          <CampaignContentPanel campaignId={campaign.id} isStaff={isStaff} />
        </div>
      ),
    },
    {
      key: 'homebrew',
      title: (
        <TabTitle
          glyph="orb"
          label="Homebrew"
          count={pulse?.pendingApprovals ?? 0}
        />
      ),
      content: (
        <div className="pt-4">
          <HomebrewApprovalPanel campaignId={campaign.id} isGM={isStaff} />
        </div>
      ),
    },
  ];
  const leading = LEADING_TAB[table];

  return (
    <PageShell width="wide">
      {/* Announcements come out at the root, so they reach the reader on any
          tab of this page — and keep reaching them after they wander off it. */}
      <AtTable campaignId={campaign.id} />

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
            {/* Not "open the screen": the page has been the player's since it
                was built — it filters its own panels by role and has a player
                default layout — and a player reads "the screen" as the DM's
                furniture and never presses it. */}
            <Button
              as={Link}
              href={`/campaigns/${campaign.id}/screen`}
              size="sm"
              variant="flat"
              color="primary"
            >
              {isStaff ? 'Behind the screen' : 'Take your seat'}
            </Button>
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

      {/* While the table is sitting the play surface is the screen, and this
          page is the record behind it. Say so, once, above the record. */}
      {table !== 'desk' && (
        <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
          <span>
            {table === 'battle'
              ? 'A fight is running.'
              : 'The table is sitting.'}
          </span>
          <Link
            href={`/campaigns/${campaign.id}/screen`}
            size="sm"
            className="text-gold-strong dark:text-gold"
          >
            {isStaff ? 'Go behind the screen' : 'Take your seat'}
          </Link>
        </p>
      )}

      <div className="mt-5">
        {/* Above the tabs, because the whole point is not having to know which
            tab the answer is on. */}
        <CampaignSearch campaignId={campaign.id} />

        {/* Moving tabs re-reads the counts: a quest pinned or a recap handed
            over changes the ledger line, and a stale number is worse than a
            slightly late one. */}
        <Tabs
          aria-label="Campaign sections"
          variant="underlined"
          defaultSelectedKey={leading}
          onSelectionChange={() => loadPulse()}
          classNames={{
            // Seven tabs overflow a phone. Let the list scroll rather than
            // wrap into a second row that pushes the panel off-screen.
            tabList: 'max-w-full overflow-x-auto',
          }}
        >
          {tabs.map(t => (
            <Tab key={t.key} title={t.title}>
              {t.content}
            </Tab>
          ))}
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
