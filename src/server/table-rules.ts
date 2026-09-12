import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import {
  applyTableRulesPatch,
  describeRuleKeys,
  patchedRuleKeys,
  refuses,
  sanitizeTableRulesPatch,
  type TableMode,
  type TableRules,
  type TableRulesPatch,
} from '@/@creator/campaign/lib/table-rules';
import { db } from '@/db';
import { campaigns, initiativeEncounters } from '@/db/schema';
import { mergeCampaignSettings, requireCampaignRole } from './campaigns';
import { bumpVersion, publish } from './live-hub';

/**
 * The rules in force, and the fence.
 *
 * Every server function that consults a table rule calls `effectiveRules`
 * once and passes the answer down; the lib modules never read the database
 * (the `RuleContext` pattern in `campaign/lib/rules.ts`). A fight's overrides
 * are laid over the campaign's block here and nowhere else, so "what does
 * this table do about X" has one answer.
 */

/**
 * The campaign's table rules with the running fight's overrides on top.
 *
 * No role check: the answer is not a secret, and every caller has already
 * established the reader belongs at the table. `encounterId` names a fight
 * to read overrides from; omitted, the active fight is used, and with no
 * fight running the campaign's rules stand alone.
 */
export async function effectiveRules(
  campaignId: string,
  encounterId?: string | null
): Promise<TableRules> {
  const campaign = await db.query.campaigns.findFirst({
    columns: { settings: true },
    where: eq(campaigns.id, campaignId),
  });
  const base = mergeCampaignSettings(campaign?.settings).table;

  const encounter =
    encounterId === null
      ? null
      : encounterId
        ? await db.query.initiativeEncounters.findFirst({
            columns: { campaignId: true, ruleOverrides: true },
            where: eq(initiativeEncounters.id, encounterId),
          })
        : await db.query.initiativeEncounters.findFirst({
            columns: { campaignId: true, ruleOverrides: true },
            where: and(
              eq(initiativeEncounters.campaignId, campaignId),
              eq(initiativeEncounters.isActive, true)
            ),
          });
  if (!encounter || encounter.campaignId !== campaignId) return base;
  return applyTableRulesPatch(base, encounter.ruleOverrides);
}

/* --- the fence ------------------------------------------------------------ */

/**
 * A refusal the rules made, as opposed to one the model made.
 *
 * `NOT_YOUR_TOKEN` is the model: nothing the DM says makes it yours.
 * `CANNOT_STAND_THERE` on lava is the rules: the DM can say the fire has
 * gone out. The second kind is thrown as this, so the action wrapper can
 * tell a staff caller they may overrule it — and only a staff caller, which
 * is why `overridable` is decided here from the role and not in the browser.
 */
export class RuleRefusal extends Error {
  readonly overridable: boolean;
  constructor(code: string, overridable: boolean) {
    super(code);
    this.name = 'RuleRefusal';
    this.overridable = overridable;
  }
}

/** Who is asking, and whether they said "do it anyway". */
export interface Ruling {
  isStaff: boolean;
  ruling?: boolean;
}

/**
 * Refuse under `enforce`, unless staff are ruling past it. Under `advise`
 * this never throws: the app says what the rules say and does nothing.
 *
 * Returns whether the write goes ahead *as a ruling*, so the caller can
 * mark the line it produces with `RULING_SUFFIX`.
 */
export function fence(
  code: string,
  rules: Pick<TableRules, 'mode'>,
  who: Ruling
): boolean {
  if (refuses(rules, who)) throw new RuleRefusal(code, who.isStaff);
  return rules.mode === 'enforce' && Boolean(who.ruling && who.isStaff);
}

/* --- writes --------------------------------------------------------------- */

/**
 * Flip the campaign between advising and enforcing. Staff only, one tap, no
 * confirm — it announces itself to everyone at the table.
 */
export async function setTableMode(
  campaignId: string,
  mode: TableMode
): Promise<void> {
  const { userId, campaign } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
  ]);
  const current = mergeCampaignSettings(campaign.settings);
  if (current.table.mode === mode) return;
  const before = await effectiveRules(campaignId);

  await db
    .update(campaigns)
    .set({
      settings: { ...current, table: { ...current.table, mode } },
      updatedAt: new Date().toISOString(),
    })
    .where(eq(campaigns.id, campaignId));
  bumpVersion(campaignId);

  // If a fight is overriding the mode, the campaign flip changes nothing at
  // the table right now, and an announcement would claim it had. The fight's
  // own control announces its changes; this one stays quiet.
  const effective = await effectiveRules(campaignId);
  if (effective.mode === before.mode) return;
  publish(campaignId, {
    kind: 'rules',
    id: randomUUID(),
    at: new Date().toISOString(),
    by: userId,
    mode: effective.mode,
    modeChanged: true,
    changed: describeRuleKeys(effective, ['mode']),
    encounterName: null,
  });
}

/**
 * Set what one fight does differently from the campaign. Staff only.
 *
 * `overrides` replaces the fight's set outright — the control holds the
 * whole set off `LiveState` and sends it back changed, so taking one key
 * off is not a second verb. A key set to the campaign's own value is still
 * stored: a fight that says "flanking off" keeps saying it if the campaign
 * later turns flanking on. `null` clears the fight back to the campaign.
 */
export async function setEncounterRuleOverrides(
  encounterId: string,
  overrides: TableRulesPatch | null
): Promise<void> {
  const encounter = await db.query.initiativeEncounters.findFirst({
    where: eq(initiativeEncounters.id, encounterId),
  });
  if (!encounter) throw new Error('NOT_FOUND');
  const { userId } = await requireCampaignRole(encounter.campaignId, [
    'gm',
    'co-gm',
  ]);

  const before = await effectiveRules(encounter.campaignId, encounterId);
  const current = sanitizeTableRulesPatch(encounter.ruleOverrides);
  const next = overrides === null ? {} : sanitizeTableRulesPatch(overrides);

  await db
    .update(initiativeEncounters)
    .set({ ruleOverrides: next })
    .where(eq(initiativeEncounters.id, encounterId));
  bumpVersion(encounter.campaignId);

  const after = await effectiveRules(encounter.campaignId, encounterId);
  // What actually moved at the table, not what was written: clearing an
  // override that matched the campaign anyway is silence, not news.
  const touched = [
    ...new Set([...patchedRuleKeys(current), ...patchedRuleKeys(next)]),
  ];
  const changed = touched.filter(
    k =>
      describeRuleKeys(before, [k]).join() !==
      describeRuleKeys(after, [k]).join()
  );
  if (changed.length === 0) return;

  publish(encounter.campaignId, {
    kind: 'rules',
    id: randomUUID(),
    at: new Date().toISOString(),
    by: userId,
    mode: after.mode,
    modeChanged: before.mode !== after.mode,
    changed: describeRuleKeys(after, changed),
    encounterName: encounter.name,
  });
}
