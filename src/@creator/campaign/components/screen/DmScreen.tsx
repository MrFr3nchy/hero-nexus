'use client';

import { Button, Input, Link, Select, SelectItem } from '@heroui/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { listCharactersAction } from '@/@creator/character/actions';
import { DiceSpinner, Glyph, Ribbon } from '@/@shared/components/ui';
import { useCampaignLive } from '@/@shared/hooks/useCampaignLive';
import { AtTable, useTable } from '@/@shared/table';
import type { SessionRow } from '@/server/campaign-sessions';
import type { CampaignRole, CampaignRow } from '@/server/campaigns';
import type { CharacterRow } from '@/server/characters';
import {
  panelsOn,
  SCREEN_COLUMN_COUNTS,
  SCREEN_PANELS,
  SCREEN_PANEL_KEYS,
  type BattleLayout,
  type ScreenLayout,
  type ScreenLayouts,
  type ScreenPanelKey,
  type TableKind,
} from '../../lib/screen';
import { BattleArrangement } from './BattleArrangement';
import { TableRibbon } from './TableRibbon';
import { createEncounterAction } from '../../actions';
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
import { BattleBoard } from '../session/BattleBoard';
import { ChecksPanel } from '../session/ChecksPanel';
import { RollPanel } from '../session/RollPanel';
import { SpotlightPanel } from '../session/SpotlightPanel';
import { SittingCard } from '../session/SittingCard';
import { ConditionsCard } from './ConditionsCard';
import { AttacksPanel } from './AttacksPanel';
import { FeedPanel } from './FeedPanel';
import { StatBlockPanel } from './StatBlockPanel';
import { unreadWhispers, WhispersPanel } from './WhispersPanel';
import { ScreenBox } from './ScreenBox';
import { TimerPanel } from '../session/TimerPanel';
import { MyHeroPanel } from './MyHeroPanel';

/**
 * What the initiative box shows when nothing is trying to kill anybody.
 *
 * The tab version leaves this to `SessionPanel`, which is why the box was
 * simply blank here — a dead panel on a screen whose whole promise is that
 * everything on it is useful. Calling for initiative is one field and a button,
 * so it belongs in the box rather than a tab away.
 */
function CallForInitiative({
  campaignId,
  refresh,
  onError,
}: {
  campaignId: string;
  refresh: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex h-full flex-col justify-center gap-2 px-1">
      <p className="text-sm text-ink-muted">Nothing is trying to kill you.</p>
      <div className="flex flex-wrap items-end gap-2">
        <Input
          size="sm"
          aria-label="Name the fight"
          placeholder="The bridge at Duskwater"
          className="min-w-32 flex-1"
          value={name}
          onValueChange={setName}
        />
        <Button
          size="sm"
          color="primary"
          isDisabled={busy}
          isLoading={busy}
          onPress={async () => {
            setBusy(true);
            const res = await createEncounterAction(campaignId, name);
            setBusy(false);
            if (!res.ok) {
              onError(res.error ?? 'Failed to start the encounter.');
              return;
            }
            setName('');
            await refresh();
          }}
        >
          Roll for it
        </Button>
      </div>
    </div>
  );
}

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
 * One panel's contents.
 *
 * The panels are the ones the campaign page already has — this screen is an
 * arrangement of the app, not a second implementation of it. A quest ticked
 * here is ticked on the Quests tab, because it is the same component reading
 * the same server function.
 */
function Panel({ id, ctx }: { id: ScreenPanelKey; ctx: ScreenContext }) {
  const { live } = ctx;

  switch (id) {
    case 'initiative':
      // Every live panel reads the one poller in `ctx.live`. Mounting three
      // panels that each poll would be three requests every three seconds for
      // one answer.
      if (!live.state) return null;
      // A staff tracker with no encounter renders nothing at all, which on a
      // screen is a box that looks broken.
      if (!live.state.encounter && ctx.isStaff) {
        return (
          <CallForInitiative
            campaignId={ctx.campaignId}
            refresh={async () => {
              await live.refresh();
            }}
            onError={ctx.onError}
          />
        );
      }
      return (
        <InitiativeTracker
          campaignId={ctx.campaignId}
          state={live.state}
          isStaff={ctx.isStaff}
          refresh={live.refresh}
          onError={ctx.onError}
        />
      );

    case 'mine': {
      const own = live.state?.party.find(
        p => p.characterId === live.state?.viewerCharacterId
      );
      return (
        <MyHeroPanel
          campaignId={ctx.campaignId}
          myCharacters={ctx.myCharacters}
          play={own}
          loadoutKey={own?.loadoutKey}
          onError={ctx.onError}
        />
      );
    }

    case 'timers':
      return live.state ? (
        <TimerPanel
          campaignId={ctx.campaignId}
          state={live.state}
          isStaff={ctx.isStaff}
          refresh={live.refresh}
        />
      ) : null;

    case 'vitals':
      return live.state ? (
        <PartyPlayPanel
          campaignId={ctx.campaignId}
          party={live.state.party}
          isStaff={ctx.isStaff}
          refresh={live.refresh}
          onError={ctx.onError}
        />
      ) : null;

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

    case 'board':
      return live.state ? (
        <BattleBoard
          campaignId={ctx.campaignId}
          state={live.state}
          isStaff={ctx.isStaff}
          refresh={live.refresh}
          onError={ctx.onError}
        />
      ) : null;

    case 'sitting':
      return live.state ? (
        <SittingCard
          campaignId={ctx.campaignId}
          state={live.state}
          isStaff={ctx.isStaff}
          refresh={live.refresh}
          onError={ctx.onError}
        />
      ) : null;

    case 'checks':
      return live.state ? (
        <ChecksPanel
          campaignId={ctx.campaignId}
          state={live.state}
          isStaff={ctx.isStaff}
          refresh={live.refresh}
          onError={ctx.onError}
        />
      ) : null;

    case 'spotlight':
      return live.state ? (
        <SpotlightPanel
          campaignId={ctx.campaignId}
          state={live.state}
          isStaff={ctx.isStaff}
          refresh={live.refresh}
          onError={ctx.onError}
        />
      ) : null;

    case 'feed':
      return <FeedPanel campaignId={ctx.campaignId} />;

    case 'attacks':
      return live.state ? (
        <AttacksPanel
          campaignId={ctx.campaignId}
          state={live.state}
          onError={ctx.onError}
        />
      ) : null;

    case 'statblock':
      return live.state ? (
        <StatBlockPanel
          campaignId={ctx.campaignId}
          state={live.state}
          onError={ctx.onError}
        />
      ) : null;

    case 'whispers':
      return live.state ? (
        <WhispersPanel
          campaignId={ctx.campaignId}
          state={live.state}
          viewerId={ctx.viewerId}
          isStaff={ctx.isStaff}
          onError={ctx.onError}
        />
      ) : null;

    case 'reveals':
      return (
        <RevealTimeline
          campaignId={ctx.campaignId}
          viewerRole={ctx.viewerRole}
          reloadKey={ctx.revealSeq}
        />
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
          viewerId={ctx.viewerId}
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

/* --- moving boxes around ----------------------------------------------- */

/** Where a dragged box is about to land. */
interface DropAt {
  column: number;
  index: number;
}

function withoutPanel(
  layout: ScreenLayout,
  key: ScreenPanelKey
): ScreenPanelKey[][] {
  return layout.columns.map(column => column.filter(k => k !== key));
}

/**
 * Put a box in a column at an index.
 *
 * The removal happens first and the index is taken against the *result*, so
 * dragging a box downwards inside its own column lands where the indicator
 * said it would rather than one slot short.
 */
function movePanel(
  layout: ScreenLayout,
  key: ScreenPanelKey,
  to: DropAt
): ScreenLayout {
  const columns = withoutPanel(layout, key);
  const target = [...(columns[to.column] ?? [])];
  target.splice(Math.max(0, Math.min(target.length, to.index)), 0, key);
  columns[to.column] = target;
  return { columns };
}

/* --- the screen -------------------------------------------------------- */

/**
 * One page a table is run from.
 *
 * Laid out like the cardboard thing it is named after: a row of boxes of equal
 * standing with a fold down the middle, filling the window exactly. The page
 * itself never scrolls — each box has its own scrollbar — so nothing can hide
 * below a long column, which was the failing of the first version.
 *
 * Arrange mode turns the title bars into drag handles and puts a swap control
 * on each. Dragging is the fast path; the swap dropdown is the one that works
 * on a touchscreen and from a keyboard, and neither is the only way in.
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
  const { preferences } = useTable();
  const [layouts, setLayouts] = useState<ScreenLayouts | null>(null);
  const [arranging, setArranging] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [myCharacters, setMyCharacters] = useState<CharacterRow[]>([]);
  const [revealSeq, setRevealSeq] = useState(0);

  const [dragged, setDragged] = useState<ScreenPanelKey | null>(null);
  const [dropAt, setDropAt] = useState<DropAt | null>(null);
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    getScreenAction(campaign.id)
      .then(s => setLayouts(s.layouts))
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

  const save = useCallback(
    async (next: ScreenLayouts) => {
      const res = await saveScreenAction(campaign.id, next);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setLayouts(res.data);
      setDirty(false);
    },
    [campaign.id]
  );

  if (!layouts) {
    return (
      <div className="flex h-full items-center justify-center bg-bg">
        <DiceSpinner label="Setting up the screen…" />
      </div>
    );
  }

  /*
   * Which table this screen is set for: the viewer's pin if they have one,
   * else what the campaign is at, else the table while the first read lands.
   * The arrangement follows it — and so does the shape, because the sand
   * table is not columns but a board with a shelf.
   */
  const current: TableKind = layouts.pin ?? live.state?.table ?? 'table';
  const layout: ScreenLayout =
    current === 'battle' ? layouts.table : layouts[current];

  const setPin = async (pin: TableKind | null) => {
    const next = { ...layouts, pin };
    setLayouts(next);
    await save(next);
  };

  const changeBattle = (next: BattleLayout) => {
    setLayouts({ ...layouts, battle: next });
    setDirty(true);
  };

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

  /*
   * What the folded shelf may wear a number for: an ask waiting on the
   * viewer, and whispers they have not looked at. Design language rule 2 bans
   * counts as furniture on a page; a folded strip is not a page, and the
   * number is the reason to open it — a rule broken on purpose.
   */
  const badges: Partial<Record<ScreenPanelKey, number>> = live.state
    ? {
        checks: live.state.checks.filter(c => c.mine).length,
        whispers: unreadWhispers(
          live.state.whispers,
          preferences.whispersReadAt[campaign.id]
        ),
      }
    : {};

  const columnCount = layout.columns.length;
  const onScreen = panelsOn(layout);
  const allowed = SCREEN_PANEL_KEYS.filter(
    key => isStaff || SCREEN_PANELS[key].players
  );
  const spare = allowed.filter(key => !onScreen.includes(key));

  const change = (next: ScreenLayout) => {
    // Written into the arrangement for the table the screen is set to, and
    // never into the battle one, which is a different shape.
    const key: 'desk' | 'table' = current === 'desk' ? 'desk' : 'table';
    setLayouts({ ...layouts, [key]: next });
    setDirty(true);
  };

  /** Which slot in a column the pointer is nearest, by box midpoints. */
  const dropIndexIn = (column: number, clientY: number): number => {
    const el = columnRefs.current[column];
    if (!el) return 0;
    const boxes = Array.from(el.querySelectorAll('section[aria-label]'));
    for (let i = 0; i < boxes.length; i++) {
      const rect = boxes[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return boxes.length;
  };

  const setColumnCount = (count: number) => {
    const columns = Array.from(
      { length: count },
      (_, i) => layout.columns[i] ?? []
    );
    // Boxes in columns that just disappeared move to the last one rather than
    // vanishing: losing a panel because you narrowed the screen would be a
    // silent deletion of something you arranged on purpose.
    const orphans = layout.columns.slice(count).flat();
    if (orphans.length > 0) {
      columns[count - 1] = [...columns[count - 1], ...orphans];
    }
    change({ columns });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <AtTable campaignId={campaign.id} />

      {/* One bar, not a page header: every row of chrome up here is a row of
          stat block down there. */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface px-3 py-2">
        <h1 className="font-display text-base text-ink">{campaign.name}</h1>
        <Ribbon tone={isStaff ? 'gold' : 'neutral'}>
          {isStaff ? 'Behind the screen' : 'At the table'}
        </Ribbon>
        {live.state && (
          <TableRibbon
            campaignId={campaign.id}
            state={live.state}
            isStaff={isStaff}
            current={current}
            pinned={layouts.pin}
            onPin={setPin}
            refresh={live.refresh}
            onError={setError}
          />
        )}

        {live.error && (
          <span className="text-xs text-warning">{live.error}</span>
        )}
        {error && <span className="text-xs text-danger">{error}</span>}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {arranging && current !== 'battle' && (
            <>
              <Select
                aria-label="How many columns"
                size="sm"
                className="w-28"
                classNames={{ trigger: 'h-8 min-h-8' }}
                selectedKeys={[String(columnCount)]}
                onSelectionChange={keys => {
                  const key = Array.from(keys)[0];
                  if (key) setColumnCount(Number(key));
                }}
              >
                {SCREEN_COLUMN_COUNTS.map(n => (
                  <SelectItem key={String(n)} textValue={`${n} columns`}>
                    {n} columns
                  </SelectItem>
                ))}
              </Select>

              {spare.length > 0 && (
                <Select
                  aria-label="Add a box"
                  size="sm"
                  className="w-40"
                  classNames={{ trigger: 'h-8 min-h-8' }}
                  placeholder="Add a box"
                  selectedKeys={[]}
                  onSelectionChange={keys => {
                    const key = Array.from(keys)[0];
                    if (!key) return;
                    // Onto the shortest column, so adding never buries a box.
                    const shortest = layout.columns.reduce(
                      (best, col, i) =>
                        col.length < layout.columns[best].length ? i : best,
                      0
                    );
                    change(
                      movePanel(layout, String(key) as ScreenPanelKey, {
                        column: shortest,
                        index: layout.columns[shortest].length,
                      })
                    );
                  }}
                >
                  {spare.map(key => (
                    <SelectItem key={key} textValue={SCREEN_PANELS[key].label}>
                      {SCREEN_PANELS[key].label}
                    </SelectItem>
                  ))}
                </Select>
              )}
            </>
          )}

          <Button
            size="sm"
            variant={arranging ? 'solid' : 'flat'}
            color={arranging ? 'primary' : 'default'}
            onPress={async () => {
              if (arranging && dirty) await save(layouts);
              setArranging(!arranging);
            }}
          >
            {arranging ? (dirty ? 'Save the screen' : 'Done') : 'Arrange'}
          </Button>
          <Button
            as={Link}
            href={`/campaigns/${campaign.id}`}
            size="sm"
            variant="light"
          >
            Back
          </Button>
        </div>
      </header>

      {current === 'battle' && live.state ? (
        <BattleArrangement
          layout={layouts.battle}
          arranging={arranging}
          isStaff={isStaff}
          badges={badges}
          onChange={changeBattle}
          board={fitHeight => (
            <BattleBoard
              campaignId={campaign.id}
              state={live.state!}
              isStaff={isStaff}
              refresh={live.refresh}
              onError={setError}
              fitHeight={fitHeight}
            />
          )}
          renderPanel={key => <Panel id={key} ctx={ctx} />}
        />
      ) : (
        /* The desk and the table: columns of equal standing, with the fold
         given a grid column of its own so it always lands in a gutter and
         never crosses a box. Below `lg` the columns stack and the fold goes:
         a phone has no middle. */
        <div
          className="grid min-h-0 flex-1 gap-2 p-2 max-lg:!grid-cols-1 max-lg:overflow-y-auto"
          style={{
            // A crease in every gutter, not just the middle one. A real screen
            // folds between each pair of panels, and with an odd number of
            // columns there is no middle gutter to put a single fold in.
            gridTemplateColumns: layout.columns
              .map((_, i) => (i === 0 ? '1fr' : 'auto 1fr'))
              .join(' '),
          }}
        >
          {layout.columns.map((column, columnIndex) => (
            <div key={columnIndex} className="contents">
              {columnIndex > 0 && (
                <div
                  aria-hidden="true"
                  className="relative w-3 self-stretch max-lg:hidden"
                >
                  {/* The crease. Two hairlines with a shadow between them read as
                    folded card at a glance; one line reads as a border. */}
                  <span className="absolute inset-y-2 left-1 w-px bg-gold/25" />
                  <span className="absolute inset-y-2 right-1 w-px bg-gold/25" />
                  <span className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-ink/20" />
                </div>
              )}

              <div
                ref={el => {
                  columnRefs.current[columnIndex] = el;
                }}
                onDragOver={event => {
                  if (!dragged) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  setDropAt({
                    column: columnIndex,
                    index: dropIndexIn(columnIndex, event.clientY),
                  });
                }}
                onDrop={event => {
                  event.preventDefault();
                  if (!dragged || !dropAt) return;
                  change(movePanel(layout, dragged, dropAt));
                  setDragged(null);
                  setDropAt(null);
                }}
                className={`flex min-h-0 flex-col gap-2 rounded-[var(--radius-card)] max-lg:min-h-64 ${
                  arranging && column.length === 0
                    ? 'border border-dashed border-line'
                    : ''
                } ${
                  dragged && dropAt?.column === columnIndex
                    ? 'bg-gold/[0.05] outline outline-1 outline-gold/30'
                    : ''
                }`}
              >
                {column.length === 0 && arranging && (
                  <p className="m-auto px-2 text-center text-xs text-ink-subtle">
                    Drop a box here
                  </p>
                )}

                {column.map((key, boxIndex) => {
                  const meta = SCREEN_PANELS[key];
                  return (
                    <div key={key} className="contents">
                      {dragged &&
                        dropAt?.column === columnIndex &&
                        dropAt.index === boxIndex && (
                          <div
                            aria-hidden="true"
                            className="h-0.5 shrink-0 rounded bg-gold"
                          />
                        )}
                      <ScreenBox
                        id={key}
                        title={meta.label}
                        glyph={<Glyph name={meta.glyph} size={13} />}
                        available={[key, ...spare]}
                        arranging={arranging}
                        dragging={dragged === key}
                        onDragStart={() => setDragged(key)}
                        onDragEnd={() => {
                          setDragged(null);
                          setDropAt(null);
                        }}
                        onSwap={next =>
                          change({
                            columns: layout.columns.map(col =>
                              col.map(k => (k === key ? next : k))
                            ),
                          })
                        }
                        onRemove={() =>
                          change({ columns: withoutPanel(layout, key) })
                        }
                      >
                        <Panel id={key} ctx={ctx} />
                      </ScreenBox>
                    </div>
                  );
                })}

                {dragged &&
                  dropAt?.column === columnIndex &&
                  dropAt.index >= column.length && (
                    <div
                      aria-hidden="true"
                      className="h-0.5 shrink-0 rounded bg-gold"
                    />
                  )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
