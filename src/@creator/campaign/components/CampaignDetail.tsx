'use client';

import { Button, Link } from '@heroui/react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  Fleuron,
  Glyph,
  Marginalia,
  PageHeader,
  PageShell,
  Ribbon,
  SectionCard,
  type GlyphName,
} from '@/@shared/components/ui';
import { AtTable } from '@/@shared/table';
import type { CampaignPulse } from '@/server/campaign-pulse';
import type { CampaignRow } from '@/server/campaigns';
import { getCampaignPulseAction } from '../chronicle-actions';
import { describeRules } from '../lib/rules';
import type { TableKind } from '../lib/screen';
import { FOLDED_SECTIONS, readWorldRoute } from '../lib/world-route';
import { describeTableRules } from '../lib/table-rules';
import { CampaignOverview } from './CampaignOverview';
import { CaptureBox } from './CaptureBox';
import { AwardsPanel } from './AwardsPanel';
import { ChroniclePanel } from './ChroniclePanel';
import { DowntimePanel } from './DowntimePanel';
import { CampaignContentPanel } from './CampaignContentPanel';
import { HomebrewApprovalPanel } from './HomebrewApprovalPanel';
import { LedgerPanel } from './LedgerPanel';
import { JournalPanel } from './JournalPanel';
import { MembersPanel } from './MembersPanel';
import { SafetyPanel } from './SafetyPanel';
import { NotebookPanel, SharedNotes } from './NotebookPanel';
import { PartySecrets } from './PartySecrets';
import { RevealTimeline } from './RevealTimeline';
import { BoardShelf } from './workshop/BoardShelf';
import { WorldPanel } from './world/WorldPanel';

/**
 * Section keys that moved, and the full address each now means. `canon`
 * became the World (0072); quests, random tables and encounters folded into
 * it as Everywhere filters. Old bookmarks, Discord links and the overview's
 * buttons still land.
 */
const ALIASES: Record<string, string> = {
  canon: 'world/everywhere/canon',
  ...FOLDED_SECTIONS,
};

/** `world/here/abc` → the section `world` and the route `here/abc`. */
function splitHash(hash: string): { key: string; sub: string } {
  const [head, ...rest] = hash.replace(/^#/, '').split('/');
  const alias = ALIASES[head];
  if (!alias) return { key: head, sub: rest.join('/') };
  const [key, ...more] = alias.split('/');
  return { key, sub: [...more, ...rest].join('/') };
}

const ROLE_LABEL = { gm: 'DM', 'co-gm': 'Co-DM', player: 'Player' } as const;
const ROLE_TONE = { gm: 'gold', 'co-gm': 'arcane', player: 'neutral' } as const;

/**
 * One entry in the rail.
 *
 * `group` is the heading it sits under. Ten flat tabs in a horizontal
 * scroller is what "I cannot find anything" felt like: nothing said which
 * of them a thing was on, the order was arbitrary, and half of them fell off
 * the right edge. Five headings and a named list under each is the same
 * content, sorted by the question a person is actually asking.
 */
interface Section {
  key: string;
  group: string;
  label: string;
  glyph: GlyphName;
  /** One line under the heading of the pane. */
  line: string;
  staffOnly?: boolean;
  /** Read from the pulse: something here wants attention. */
  badge?: (pulse: CampaignPulse) => number;
  content: ReactNode;
}

/** The order the headings appear in, which is the order a table gets built. */
const GROUPS = ['The table', 'The world', 'Play', 'Battle', 'Content'] as const;

/**
 * The campaign, as a single object (design language: Single object archetype).
 *
 * Everything a campaign is managed with lives here: the party, the world, the
 * sessions, the battle boards, the encounters and the content. The session
 * screen at `/campaigns/[id]/screen` is for *running* an evening and nothing
 * else — it has no second copy of the record on it, and this page does not
 * send anybody there to prepare.
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
  const ruleLines = useMemo(
    () => [
      ...describeTableRules(campaign.settings.table, { omit: ['mode'] }),
      ...describeRules(campaign.settings.rules, {
        allowHomebrew: campaign.settings.allowHomebrew,
      }),
    ],
    [campaign.settings]
  );
  const [pulse, setPulse] = useState<CampaignPulse | null>(null);
  // Bumped when the notebook shows something to the party, so the timeline
  // beside it re-reads without the DM having to leave and come back.
  const [revealSeq, setRevealSeq] = useState(0);
  // Bumped when the capture box writes, so the World re-reads what it shows.
  const [wroteSeq, setWroteSeq] = useState(0);
  const [section, setSection] = useState('overview');
  /** What follows the section in the address: where in the World. */
  const [sub, setSub] = useState('');

  const loadPulse = useCallback(async () => {
    setPulse(await getCampaignPulseAction(campaign.id));
  }, [campaign.id]);

  useEffect(() => {
    loadPulse();
  }, [loadPulse]);

  /*
   * Deep links. The overview points at sections, the search results point at
   * sections, and a DM who bookmarks "the boards" should land on the boards.
   * The hash rather than a query string: no server round trip, and the page
   * is one component either way.
   */
  useEffect(() => {
    const read = () => {
      const { key, sub } = splitHash(window.location.hash);
      if (key) setSection(key);
      setSub(sub);
    };
    // A link or a typed address changes the hash behind the router's back,
    // and the next server action's refresh would put the old address back.
    // Telling the router about it (its replaceState is watched) keeps the
    // address and the page agreeing.
    const changed = () => {
      read();
      window.history.replaceState(
        window.history.state,
        '',
        window.location.href
      );
    };
    read();
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);

  const go = useCallback((target: string) => {
    const { key, sub } = splitHash(target);
    setSection(key);
    setSub(sub);
    window.history.replaceState(null, '', `#${target}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  /** Move within a section without jumping the page back to the top. */
  const route = useCallback((key: string, next: string) => {
    setSub(next);
    window.history.replaceState(
      null,
      '',
      `${window.location.search}#${next ? `${key}/${next}` : key}`
    );
  }, []);

  /* --- the rules card, shared by the Rules section ---------------------- */

  const rulesCard = (
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
        {/* The free-text house rules are a footnote to the enforced ones,
            on the same card: three homes for house rules is how a DM ends
            up with two lists that disagree. */}
        {campaign.settings.customRules && (
          <div className="border-t border-line pt-3">
            <p className="font-display-alt text-[0.6rem] uppercase tracking-[0.16em] text-ink-subtle">
              In your own words
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink-muted">
              {campaign.settings.customRules}
            </p>
          </div>
        )}
        {ruleLines.length === 0 && !campaign.settings.customRules && (
          <p className="text-sm text-ink-muted">
            The book as written — no house rules on top of it yet.
          </p>
        )}
        {campaign.settings.sessionNotes && (
          <div className="border-t border-line pt-3">
            <p className="font-display-alt text-[0.6rem] uppercase tracking-[0.16em] text-ink-subtle">
              Table notes
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink-muted">
              {campaign.settings.sessionNotes}
            </p>
          </div>
        )}
        {isStaff && (
          <div className="border-t border-line pt-3">
            <Button
              as={Link}
              href={`/campaigns/${campaign.id}/manage`}
              size="sm"
              variant="flat"
            >
              Change the rules
            </Button>
          </div>
        )}
      </div>
    </SectionCard>
  );

  /* --- the sections ----------------------------------------------------- */

  const sections: Section[] = [
    {
      key: 'overview',
      group: 'The table',
      label: 'Overview',
      glyph: 'candle',
      line: 'Where the table stands, and what wants doing next.',
      content: (
        <CampaignOverview
          campaignId={campaign.id}
          pulse={pulse}
          memberCount={campaign.memberCount}
          isStaff={isStaff}
          onGo={go}
        />
      ),
    },
    {
      key: 'party',
      group: 'The table',
      label: 'Party',
      glyph: 'person',
      line: 'Who is at the table, who is coming, and who is playing what.',
      content: (
        <div className="space-y-5 pt-4">
          <MembersPanel
            campaignId={campaign.id}
            viewerId={viewerId}
            viewerRole={campaign.role}
            joinCode={isStaff ? campaign.joinCode : null}
          />
          <PartySecrets campaignId={campaign.id} />
        </div>
      ),
    },
    {
      key: 'loot',
      group: 'The table',
      label: 'Loot',
      glyph: 'coins',
      line: 'What the party is carrying, who has it, and the common purse.',
      content: (
        <div className="pt-4">
          <LedgerPanel campaignId={campaign.id} />
        </div>
      ),
    },
    {
      key: 'rules',
      group: 'The table',
      label: 'Rules',
      glyph: 'gavel',
      line: 'What this table plays by — the enforced rules and your own words, in one list.',
      content: (
        <div className="space-y-5 pt-4">
          {rulesCard}
          <SafetyPanel campaignId={campaign.id} isStaff={isStaff} />
        </div>
      ),
    },
    {
      key: 'world',
      group: 'The world',
      label: 'World',
      glyph: 'compass',
      line: 'Every place, who lives there, what they sell, what is going on in it and where the party is — on the map.',
      content: (
        <WorldPanel
          campaignId={campaign.id}
          viewerId={viewerId}
          viewerRole={campaign.role}
          route={sub}
          onRoute={next => route('world', next)}
          reloadKey={wroteSeq}
        />
      ),
    },
    {
      key: 'notes',
      group: 'The world',
      label: isStaff ? 'Notebook' : 'Shared notes',
      glyph: 'quill',
      line: isStaff
        ? 'Your own prep, and the control that shows a line of it to the party.'
        : 'Everything the DM has shown the table, in the order it was told.',
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
            title="Shown to the party"
            description="Everything handed over, in the order it was told."
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
      group: 'The world',
      label: 'Journal',
      glyph: 'journal',
      line: "The party's own log, in their own voices.",
      content: (
        <div className="pt-4">
          <JournalPanel campaignId={campaign.id} viewerRole={campaign.role} />
        </div>
      ),
    },
    {
      key: 'sessions',
      group: 'Play',
      label: 'Sessions',
      glyph: 'notebook',
      line: 'Every night played and planned, the prep for each, and who can make it.',
      badge: p => p.unsentRecaps,
      content: (
        <div className="space-y-5 pt-4">
          <ChroniclePanel
            campaignId={campaign.id}
            viewerId={viewerId}
            viewerRole={campaign.role}
            calendar={campaign.settings.calendar}
          />
          {/* Awards belong beside the sessions they were earned at: a DM
              hands out experience while marking the register. */}
          <AwardsPanel campaignId={campaign.id} viewerRole={campaign.role} />
        </div>
      ),
    },
    {
      key: 'downtime',
      group: 'Play',
      label: 'Downtime',
      glyph: 'hourglass',
      line: 'What the party is doing between sessions, and what came of it.',
      badge: p => p.openDowntime,
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
    {
      key: 'boards',
      group: 'Battle',
      label: 'Battle boards',
      glyph: 'cube',
      line: 'Every room this table fights in. Build one in the workshop; put one in play here.',
      staffOnly: true,
      content: (
        <div className="pt-4">
          <BoardShelf campaignId={campaign.id} />
        </div>
      ),
    },
    {
      key: 'content',
      group: 'Content',
      label: 'Allowed content',
      glyph: 'tome',
      line: 'What this table may build from, and what has been adopted into it.',
      content: (
        <div className="pt-4">
          <CampaignContentPanel campaignId={campaign.id} isStaff={isStaff} />
        </div>
      ),
    },
    {
      key: 'homebrew',
      group: 'Content',
      label: 'Homebrew',
      glyph: 'orb',
      // Staff only: a player has nothing to approve, and the queue was on
      // their page wearing somebody else's count.
      staffOnly: true,
      line: 'Everything somebody forged and asked to use at this table.',
      badge: p => p.pendingApprovals,
      content: (
        <div className="pt-4">
          <HomebrewApprovalPanel campaignId={campaign.id} isGM={isStaff} />
        </div>
      ),
    },
  ];

  const visible = sections.filter(s => isStaff || !s.staffOnly);

  // A line typed while a place is open in the World lands in that place.
  const worldRoute = section === 'world' ? readWorldRoute(sub) : null;
  const worldPlace =
    worldRoute?.kind === 'route' ? worldRoute.route.placeId : null;
  const open = visible.find(s => s.key === section) ?? visible[0];

  return (
    <PageShell width="wide">
      {/* Announcements come out at the root, so they reach the reader on any
          section of this page — and keep reaching them after they wander. */}
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
            {/*
              One door to the session screen, named for what is behind it
              rather than for the furniture. Between sessions it is the
              thing that starts one; during one it is the way in.
            */}
            <Button
              as={Link}
              href={`/campaigns/${campaign.id}/screen`}
              size="sm"
              variant={table === 'desk' ? 'flat' : 'solid'}
              color="primary"
            >
              {table === 'desk'
                ? isStaff
                  ? 'Start a session'
                  : 'The session screen'
                : table === 'battle'
                  ? 'Back to the fight'
                  : 'Back to the session'}
            </Button>
            {isStaff && (
              <Button
                as={Link}
                href={`/campaigns/${campaign.id}/manage`}
                size="sm"
                variant="flat"
              >
                Settings
              </Button>
            )}
          </>
        }
      />

      {/* A session is running somewhere else: say so once, near the top. */}
      {table !== 'desk' && (
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
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
            {isStaff ? 'Run it' : 'Take your seat'}
          </Link>
        </p>
      )}

      <Fleuron />

      <div className="mt-5">
        {/* Above everything, because the whole point is not having to know
            which section the answer is on. */}
        <CaptureBox
          campaignId={campaign.id}
          isStaff={isStaff}
          onGo={go}
          onWrote={async () => {
            setWroteSeq(n => n + 1);
            await loadPulse();
          }}
          defaultPlaceId={worldPlace}
        />

        <div className="flex flex-col gap-6 lg:flex-row">
          {/* The rail. Grouped, because "which of these is the fight thing"
              is the question ten flat tabs could not answer. */}
          <nav
            aria-label="Campaign sections"
            className="shrink-0 lg:w-52 xl:w-56"
          >
            <ul className="flex gap-4 overflow-x-auto pb-2 lg:flex-col lg:gap-5 lg:overflow-visible lg:pb-0">
              {GROUPS.map(group => {
                const items = visible.filter(s => s.group === group);
                if (items.length === 0) return null;
                return (
                  <li key={group} className="shrink-0">
                    <p className="mb-1 font-display-alt text-[0.6rem] uppercase tracking-[0.16em] text-ink-subtle">
                      {group}
                    </p>
                    <ul className="flex gap-1 lg:flex-col">
                      {items.map(item => {
                        const count = pulse ? (item.badge?.(pulse) ?? 0) : 0;
                        const lit = item.key === open.key;
                        return (
                          <li key={item.key}>
                            <button
                              type="button"
                              aria-current={lit ? 'page' : undefined}
                              onClick={() => go(item.key)}
                              className={`flex w-full items-center gap-2 whitespace-nowrap rounded-[5px] px-2 py-1.5 text-left text-sm transition-colors ${
                                lit
                                  ? 'bg-surface-2 text-ink [box-shadow:inset_2px_0_0_var(--gold)]'
                                  : 'text-ink-muted hover:bg-surface-2/60 hover:text-ink'
                              }`}
                            >
                              <Glyph
                                name={item.glyph}
                                size={15}
                                className={
                                  lit
                                    ? 'text-gold-strong dark:text-gold'
                                    : 'opacity-70'
                                }
                              />
                              <span className="min-w-0 flex-1 truncate">
                                {item.label}
                              </span>
                              {count > 0 && (
                                <span className="rounded-full bg-gold/20 px-1.5 text-[0.65rem] font-medium tabular-nums text-gold-strong dark:text-gold">
                                  {count}
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* The pane. One section at a time, with its own heading so the
              reader is never guessing which one they are looking at. */}
          <section
            key={open.key}
            aria-label={open.label}
            className="min-w-0 flex-1"
          >
            <div className="border-b border-line pb-2">
              <h2 className="font-display text-2xl text-ink">{open.label}</h2>
              <p className="mt-0.5 text-sm text-ink-muted">{open.line}</p>
            </div>
            {open.content}
          </section>
        </div>
      </div>

      {isStaff && pulse && !pulse.next && open.key !== 'overview' && (
        <Marginalia className="mt-6" dash>
          no next session on the books — put one there under Play
        </Marginalia>
      )}
    </PageShell>
  );
}
