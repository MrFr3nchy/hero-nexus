'use client';

import { Button, Link } from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

import { listCharactersAction } from '@/@creator/character/actions';
import {
  DiceSpinner,
  Glyph,
  Marginalia,
  PageHeader,
  PageShell,
  Ribbon,
  SectionCard,
} from '@/@shared/components/ui';
import { useCampaignLive } from '@/@shared/hooks/useCampaignLive';
import type { SessionRow } from '@/server/campaign-sessions';
import type { CampaignRole, CampaignRow } from '@/server/campaigns';
import type { CharacterRow } from '@/server/characters';
import {
  SCREEN_PANELS,
  SCREEN_PANEL_KEYS,
  type ScreenLayout,
  type ScreenPanelKey,
  type ScreenRail,
} from '../../lib/screen';
import { listSessionsAction } from '../../chronicle-actions';
import { getScreenAction, saveScreenAction } from '../../screen-actions';
import { CanonPanel } from '../CanonPanel';
import { ChroniclePanel } from '../ChroniclePanel';
import { DowntimePanel } from '../DowntimePanel';
import { LedgerPanel } from '../LedgerPanel';
import { NotebookPanel } from '../NotebookPanel';
import { PartyPlayPanel } from '../PartyPlayPanel';
import { QuestPanel } from '../QuestPanel';
import { RevealTimeline } from '../RevealTimeline';
import { HandoutsPanel } from '../session/HandoutsPanel';
import { InitiativeTracker } from '../session/InitiativeTracker';
import { RollPanel } from '../session/RollPanel';
import { ConditionsCard } from './ConditionsCard';

/** Everything the panels share, gathered once rather than per panel. */
interface ScreenContext {
  campaignId: string;
  viewerId: string;
  viewerRole: CampaignRole;
  isStaff: boolean;
  live: ReturnType<typeof useCampaignLive>;
  sessions: SessionRow[];
  myCharacters: CharacterRow[];
  onError: (message: string) => void;
  revealSeq: number;
  bumpReveals: () => void;
}

/**
 * One panel.
 *
 * The panels are the ones the campaign page already has — this screen is an
 * arrangement of the app, not a second implementation of it. A DM who changes
 * a quest here and opens the Quests tab sees the same thing, because it is the
 * same component reading the same server function.
 */
function Panel({ id, ctx }: { id: ScreenPanelKey; ctx: ScreenContext }) {
  const { live } = ctx;

  switch (id) {
    case 'initiative':
      // Every live panel reads the one poller in `ctx.live`. Mounting three
      // panels that each poll would be three requests every three seconds for
      // one answer.
      return live.state ? (
        <InitiativeTracker
          campaignId={ctx.campaignId}
          state={live.state}
          isStaff={ctx.isStaff}
          refresh={live.refresh}
          onError={ctx.onError}
        />
      ) : null;

    case 'vitals':
      return (
        <PartyPlayPanel
          campaignId={ctx.campaignId}
          isStaff={ctx.isStaff}
          onError={ctx.onError}
        />
      );

    case 'dice':
      return live.state ? (
        <RollPanel
          campaignId={ctx.campaignId}
          state={live.state}
          isStaff={ctx.isStaff}
          myCharacters={ctx.myCharacters}
          refresh={live.refresh}
          onError={ctx.onError}
        />
      ) : null;

    case 'handouts':
      return live.state ? (
        <HandoutsPanel
          campaignId={ctx.campaignId}
          state={live.state}
          isStaff={ctx.isStaff}
          sessions={ctx.sessions}
          refresh={live.refresh}
          onError={ctx.onError}
        />
      ) : null;

    case 'reveals':
      return (
        <SectionCard title="What they know">
          <RevealTimeline
            campaignId={ctx.campaignId}
            viewerRole={ctx.viewerRole}
            reloadKey={ctx.revealSeq}
          />
        </SectionCard>
      );

    case 'notebook':
      return (
        <NotebookPanel
          campaignId={ctx.campaignId}
          onRevealed={async () => ctx.bumpReveals()}
        />
      );

    case 'quests':
      return (
        <QuestPanel campaignId={ctx.campaignId} viewerRole={ctx.viewerRole} />
      );

    case 'conditions':
      return <ConditionsCard />;

    case 'ledger':
      return <LedgerPanel campaignId={ctx.campaignId} onError={ctx.onError} />;

    case 'canon':
      return (
        <CanonPanel
          campaignId={ctx.campaignId}
          viewerId={ctx.viewerId}
          viewerRole={ctx.viewerRole}
        />
      );

    case 'chronicle':
      return (
        <ChroniclePanel
          campaignId={ctx.campaignId}
          viewerRole={ctx.viewerRole}
        />
      );

    case 'downtime':
      return (
        <DowntimePanel
          campaignId={ctx.campaignId}
          viewerId={ctx.viewerId}
          viewerRole={ctx.viewerRole}
        />
      );
  }
}

/* --- arranging it ------------------------------------------------------ */

function isOn(layout: ScreenLayout, key: ScreenPanelKey): ScreenRail | null {
  if (layout.main.includes(key)) return 'main';
  if (layout.rail.includes(key)) return 'rail';
  return null;
}

/**
 * The panel picker.
 *
 * Deliberately a list of everything with a state on each row rather than a
 * drag-and-drop board: a DM arranging this is doing it once, ten minutes
 * before a session, on whatever machine is nearest — and a board that needs a
 * mouse is the one thing that will not work on the laptop propped behind the
 * screen.
 */
function Arranger({
  layout,
  isStaff,
  onChange,
}: {
  layout: ScreenLayout;
  isStaff: boolean;
  onChange: (next: ScreenLayout) => void;
}) {
  const available = SCREEN_PANEL_KEYS.filter(
    key => isStaff || SCREEN_PANELS[key].players
  );

  const put = (key: ScreenPanelKey, rail: ScreenRail | null) => {
    const without = {
      main: layout.main.filter(k => k !== key),
      rail: layout.rail.filter(k => k !== key),
    };
    if (!rail) {
      onChange(without);
      return;
    }
    onChange({ ...without, [rail]: [...without[rail], key] });
  };

  const move = (key: ScreenPanelKey, by: -1 | 1) => {
    const rail = isOn(layout, key);
    if (!rail) return;
    const list = [...layout[rail]];
    const i = list.indexOf(key);
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    onChange({ ...layout, [rail]: list });
  };

  return (
    <SectionCard
      title="What is on your screen"
      description="Yours alone — every person at this table arranges their own."
    >
      <ul className="divide-y divide-line">
        {available.map(key => {
          const meta = SCREEN_PANELS[key];
          const where = isOn(layout, key);
          return (
            <li key={key} className="flex flex-wrap items-center gap-3 py-2">
              <Glyph
                name={meta.glyph}
                size={16}
                className={where ? 'text-gold' : 'text-ink-subtle'}
              />
              <div className="min-w-40 flex-1">
                <div className="text-sm text-ink">{meta.label}</div>
                <div className="text-xs text-ink-subtle">
                  {meta.description}
                </div>
              </div>

              <div className="flex items-center gap-1">
                {(['main', 'rail'] as ScreenRail[]).map(rail => (
                  <button
                    key={rail}
                    type="button"
                    onClick={() => put(key, where === rail ? null : rail)}
                    className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                      where === rail
                        ? 'border-gold bg-gold/15 text-ink'
                        : 'border-line text-ink-muted hover:border-gold/60 hover:text-ink'
                    }`}
                  >
                    {rail === 'main' ? 'Main' : 'Side'}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={!where}
                  aria-label={`Move ${meta.label} up`}
                  onClick={() => move(key, -1)}
                  className="px-1 text-ink-subtle disabled:opacity-30 hover:text-ink"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={!where}
                  aria-label={`Move ${meta.label} down`}
                  onClick={() => move(key, 1)}
                  className="px-1 text-ink-subtle disabled:opacity-30 hover:text-ink"
                >
                  ↓
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

/* --- the screen -------------------------------------------------------- */

/**
 * One page a table is run from.
 *
 * Everything here already existed and was spread across eight tabs, which is
 * fine for prep and wrong for the two hours when a DM needs initiative, the
 * party's hit points, the dice and what the party has been told all visible at
 * once. Nothing on this page is a second implementation of a panel: the same
 * components read the same server functions, so a quest ticked here is ticked
 * on the Quests tab.
 *
 * The arrangement is per person and per table, so a player's screen and the
 * DM's are different pages built from the same parts.
 */
export function DmScreen({
  campaign,
  viewerId,
}: {
  campaign: CampaignRow;
  viewerId: string;
}) {
  const isStaff = campaign.role === 'gm' || campaign.role === 'co-gm';

  const live = useCampaignLive(campaign.id);
  const [layout, setLayout] = useState<ScreenLayout | null>(null);
  const [arranging, setArranging] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [myCharacters, setMyCharacters] = useState<CharacterRow[]>([]);
  const [revealSeq, setRevealSeq] = useState(0);

  useEffect(() => {
    getScreenAction(campaign.id)
      .then(s => setLayout(s.layout))
      .catch(() => setError('Failed to open your screen.'));
  }, [campaign.id]);

  const loadSide = useCallback(async () => {
    const [list, chars] = await Promise.all([
      listSessionsAction(campaign.id).catch(() => [] as SessionRow[]),
      listCharactersAction().catch(() => [] as CharacterRow[]),
    ]);
    setSessions(list);
    setMyCharacters(chars);
  }, [campaign.id]);

  useEffect(() => {
    loadSide();
  }, [loadSide]);

  const save = async () => {
    if (!layout) return;
    const res = await saveScreenAction(campaign.id, layout);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setLayout(res.data);
    setDirty(false);
    setArranging(false);
  };

  if (!layout) {
    return (
      <PageShell width="wide">
        <div className="flex justify-center py-24">
          <DiceSpinner label="Setting up the screen…" />
        </div>
      </PageShell>
    );
  }

  const ctx: ScreenContext = {
    campaignId: campaign.id,
    viewerId,
    viewerRole: campaign.role,
    isStaff,
    live,
    sessions,
    myCharacters,
    onError: setError,
    revealSeq,
    bumpReveals: () => setRevealSeq(n => n + 1),
  };

  return (
    <PageShell width="wide">
      <PageHeader
        rule={false}
        title={campaign.name}
        description="Everything this table needs, on one page."
        actions={
          <>
            <Ribbon tone={isStaff ? 'gold' : 'neutral'}>
              {isStaff ? 'Your screen' : 'Your seat'}
            </Ribbon>
            <Button
              size="sm"
              variant={arranging ? 'solid' : 'flat'}
              color={arranging ? 'primary' : 'default'}
              onPress={() =>
                arranging && dirty ? save() : setArranging(!arranging)
              }
            >
              {arranging ? (dirty ? 'Save it' : 'Done') : 'Arrange'}
            </Button>
            <Button
              as={Link}
              href={`/campaigns/${campaign.id}`}
              size="sm"
              variant="light"
            >
              Back to the table
            </Button>
          </>
        }
      />

      {error && (
        <p className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {live.error && (
        <p className="mb-4 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          {live.error}
        </p>
      )}

      {arranging && (
        <div className="mb-5">
          <Arranger
            layout={layout}
            isStaff={isStaff}
            onChange={next => {
              setLayout(next);
              setDirty(true);
            }}
          />
        </div>
      )}

      {layout.main.length === 0 && layout.rail.length === 0 ? (
        <SectionCard title="An empty screen">
          <p className="text-sm text-ink-muted">
            Nothing is up. Press <strong>Arrange</strong> and put something on
            it.
          </p>
        </SectionCard>
      ) : (
        // Asymmetric on purpose (design rule 3): a working main column and a
        // narrower rail of things you glance at, not a grid of equal tiles.
        <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="space-y-5">
            {layout.main.map(key => (
              <Panel key={key} id={key} ctx={ctx} />
            ))}
          </div>
          {layout.rail.length > 0 && (
            <div className="space-y-5">
              {layout.rail.map(key => (
                <Panel key={key} id={key} ctx={ctx} />
              ))}
            </div>
          )}
        </div>
      )}

      <Marginalia className="mt-6" dash>
        {isStaff
          ? 'everything you need behind the screen, and nothing they can see'
          : 'your seat at this table, arranged how you like it'}
      </Marginalia>
    </PageShell>
  );
}
