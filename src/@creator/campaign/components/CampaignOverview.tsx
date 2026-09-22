'use client';

import { Button, Link } from '@heroui/react';

import {
  Glyph,
  Marginalia,
  SectionCard,
  type GlyphName,
} from '@/@shared/components/ui';
import { countdownWords, formatCalendarDate } from '@/@shared/lib/dates';
import type { CampaignPulse } from '@/server/campaign-pulse';

/**
 * One thing to do next, named in the DM's own words.
 *
 * `where` is either a section on this page or a route. The first move whose
 * condition holds is the one that leads; the rest follow it as a short list,
 * so a DM can see the shape of what is unfinished without reading five
 * sections to find out.
 */
interface Move {
  key: string;
  glyph: GlyphName;
  label: string;
  line: string;
  section?: string;
  href?: string;
}

/**
 * What the table looks like right now, in one sentence per fact.
 *
 * Not a grid of tiles (design rule 2): each line is a fact with its number
 * inside it. The tiles this replaced read `0 / 0 / 0 / 0` at a new table,
 * which is the failure that rule exists to stop.
 */
function StateLines({
  pulse,
  memberCount,
  isStaff,
}: {
  pulse: CampaignPulse;
  memberCount: number;
  isStaff: boolean;
}) {
  const lines: string[] = [];

  lines.push(
    memberCount === 1
      ? 'One person at the table'
      : `${memberCount} at the table`
  );
  if (isStaff && pulse.emptySeats > 0) {
    lines.push(
      pulse.emptySeats === 1
        ? 'one chair with no hero in it'
        : `${pulse.emptySeats} chairs with no hero in them`
    );
  }
  if (isStaff && pulse.pendingInvites > 0) {
    lines.push(
      pulse.pendingInvites === 1
        ? 'one invitation out'
        : `${pulse.pendingInvites} invitations out`
    );
  }
  lines.push(
    pulse.sessionsPlayed === 0
      ? 'no sessions played yet'
      : pulse.sessionsPlayed === 1
        ? 'one session played'
        : `${pulse.sessionsPlayed} sessions played`
  );
  if (pulse.questsInHand > 0) {
    lines.push(
      pulse.questsInHand === 1
        ? 'one quest in hand'
        : `${pulse.questsInHand} quests in hand`
    );
  }
  if (isStaff) {
    lines.push(
      pulse.boardInPlay
        ? `${pulse.boardInPlay.name} is the board in play`
        : pulse.boardsBuilt === 0
          ? 'no battle board built'
          : 'no board in play'
    );
    if (pulse.encountersReady > 0) {
      lines.push(
        pulse.encountersReady === 1
          ? 'one encounter ready'
          : `${pulse.encountersReady} encounters ready`
      );
    }
  }

  return (
    <p className="text-sm text-ink-muted">
      {lines.map((line, i) => (
        <span key={line}>
          {i > 0 && <span className="px-1.5 text-ink-subtle">·</span>}
          <span className={i === 0 ? 'text-ink' : undefined}>{line}</span>
        </span>
      ))}
    </p>
  );
}

/**
 * The campaign page's first section: where the table stands, and the next
 * move.
 *
 * A new campaign used to open on the sessions log — "the chronicle is blank"
 * — which is the one thing a DM with no players and no board does not want.
 * This opens on the state of the table and one primary action, and the rest
 * of the page is behind a named list rather than ten tabs.
 */
export function CampaignOverview({
  campaignId,
  pulse,
  memberCount,
  isStaff,
  onGo,
}: {
  campaignId: string;
  pulse: CampaignPulse | null;
  memberCount: number;
  isStaff: boolean;
  onGo: (section: string) => void;
}) {
  if (!pulse) {
    return (
      <div className="space-y-3 pt-4">
        <span className="block h-4 w-72 animate-pulse rounded bg-surface-2" />
        <span className="block h-24 w-full animate-pulse rounded bg-surface-2" />
      </div>
    );
  }

  const soon = pulse.next ? countdownWords(pulse.next.date) : null;

  /*
   * The moves, in the order a table actually gets built: people first,
   * then something for them to chase, then somewhere to fight, then a
   * night on the books. Only the ones that still want doing are listed.
   */
  const moves: Move[] = [];

  if (isStaff) {
    if (pulse.sitting) {
      moves.push({
        key: 'run',
        glyph: 'tankard',
        label: pulse.fighting ? 'Back to the fight' : 'Back to the session',
        line: pulse.fighting
          ? 'A fight is running. The board and the order are on the session screen.'
          : 'The table is sitting. Run it from the session screen.',
        href: `/campaigns/${campaignId}/screen`,
      });
    }
    if (memberCount <= 1 || pulse.emptySeats > 0 || pulse.pendingInvites > 0) {
      moves.push({
        key: 'party',
        glyph: 'person',
        label: memberCount <= 1 ? 'Seat the party' : 'Fill the empty chairs',
        line:
          memberCount <= 1
            ? 'Nobody has pulled up a chair yet. Hand out the join code or send an invitation.'
            : 'Somebody is sitting without a hero. They can seat one from their own page.',
        section: 'party',
      });
    }
    if (pulse.questsInHand === 0) {
      moves.push({
        key: 'quest',
        glyph: 'scroll',
        label: 'Write the first quest',
        line: 'Something for the party to pull on. A clock beside it is the deadline they do not know about.',
        section: 'quests',
      });
    }
    if (pulse.boardsBuilt === 0) {
      moves.push({
        key: 'board',
        glyph: 'cube',
        label: 'Lay out a battle board',
        line: 'A room on a grid. The workshop builds it; a fight is dealt onto it.',
        section: 'boards',
      });
    } else if (!pulse.boardInPlay) {
      moves.push({
        key: 'board-play',
        glyph: 'cube',
        label: 'Put a board in play',
        line: 'The board in play is the one the table sees and a fight is dealt onto.',
        section: 'boards',
      });
    }
    if (pulse.encountersReady === 0 && pulse.boardsBuilt > 0) {
      moves.push({
        key: 'encounter',
        glyph: 'crossed-swords',
        label: 'Plan an encounter',
        line: 'Pick the monsters, place them on the board, and start the fight in one press later.',
        section: 'encounters',
      });
    }
    if (!pulse.next) {
      moves.push({
        key: 'session',
        glyph: 'notebook',
        label: 'Put a session on the books',
        line: 'A date and a name. Everyone can answer whether they can make it.',
        section: 'sessions',
      });
    }
    if (pulse.unsentRecaps > 0) {
      moves.push({
        key: 'recap',
        glyph: 'letter',
        label:
          pulse.unsentRecaps === 1
            ? 'A recap is written but not shown'
            : `${pulse.unsentRecaps} recaps written but not shown`,
        line: 'The party cannot read a recap until it is shown to them.',
        section: 'sessions',
      });
    }
    if (pulse.openDowntime > 0) {
      moves.push({
        key: 'downtime',
        glyph: 'hourglass',
        label:
          pulse.openDowntime === 1
            ? 'One downtime action to rule on'
            : `${pulse.openDowntime} downtime actions to rule on`,
        line: 'What the party did between sessions, waiting on you.',
        section: 'downtime',
      });
    }
    if (pulse.pendingApprovals > 0) {
      moves.push({
        key: 'homebrew',
        glyph: 'orb',
        label:
          pulse.pendingApprovals === 1
            ? 'One homebrew submission waiting'
            : `${pulse.pendingApprovals} homebrew submissions waiting`,
        line: 'Somebody forged something and wants it allowed at this table.',
        section: 'homebrew',
      });
    }
  } else {
    if (pulse.sitting) {
      moves.push({
        key: 'seat',
        glyph: 'tankard',
        label: 'Take your seat',
        line: 'The table is sitting. Your hero, the dice and the board are through here.',
        href: `/campaigns/${campaignId}/screen`,
      });
    }
    moves.push({
      key: 'quests',
      glyph: 'scroll',
      label: 'What the party is pulling on',
      line: 'Every quest you have been told about, and how far along it is.',
      section: 'quests',
    });
    moves.push({
      key: 'journal',
      glyph: 'journal',
      label: 'Write in your journal',
      line: 'Your own log, in your own voice. The DM does not write it for you.',
      section: 'journal',
    });
  }

  const [lead, ...rest] = moves;

  return (
    <div className="space-y-5 pt-4">
      <StateLines pulse={pulse} memberCount={memberCount} isStaff={isStaff} />

      {pulse.next && (
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

      {lead && (
        <SectionCard framed title={lead.label} description={lead.line}>
          <div className="flex flex-wrap items-center gap-2">
            {lead.href ? (
              <Button as={Link} href={lead.href} size="md" color="primary">
                {lead.label}
              </Button>
            ) : (
              <Button
                size="md"
                color="primary"
                onPress={() => onGo(lead.section!)}
              >
                {lead.label}
              </Button>
            )}
          </div>
        </SectionCard>
      )}

      {rest.length > 0 && (
        <SectionCard
          title="Also waiting"
          description="Everything else this table has half-finished."
        >
          <ul className="divide-y divide-line">
            {rest.map(move => (
              <li key={move.key}>
                <button
                  type="button"
                  onClick={() =>
                    move.href
                      ? (window.location.href = move.href)
                      : onGo(move.section!)
                  }
                  className="flex w-full items-start gap-3 py-3 text-left hover:text-gold-strong dark:hover:text-gold"
                >
                  <Glyph
                    name={move.glyph}
                    size={16}
                    className="mt-0.5 shrink-0 text-gold"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm text-ink">{move.label}</span>
                    <span className="block text-xs text-ink-muted">
                      {move.line}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {moves.length === 0 && (
        <Marginalia dash>
          nothing is waiting on you. that is allowed.
        </Marginalia>
      )}
    </div>
  );
}
