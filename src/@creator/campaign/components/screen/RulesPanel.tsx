'use client';

import { Input, Link } from '@heroui/react';
import { useEffect, useMemo, useState } from 'react';

import { StatBlock } from '@/@shared/components/StatBlock';
import { Glyph, Marginalia } from '@/@shared/components/ui';
import { parseContentData, type RuleData } from '@/@shared/content';
import type { LibraryEntry } from '@/server/campaign-content';
import type { CampaignRow } from '@/server/campaigns';
import type { LiveState } from '@/server/session';
import { CONDITIONS } from '../../lib/conditions';
import { describeRules } from '../../lib/rules';
import { searchRules } from '../../lib/rules-reference';
import {
  describeRuleKeys,
  describeTableRules,
  patchedRuleKeys,
} from '../../lib/table-rules';
import { listCampaignContentAction } from '../../content-actions';

/**
 * Rules at hand.
 *
 * Three things a table stops to look up, in one box, so nobody opens a PDF:
 * what *this* table plays by (the building rules and the table rules, one
 * line each, with the running fight's overrides on top); its house rules,
 * which are content in the campaign's library; and the book — the SRD
 * passages a fight turns on, searchable.
 *
 * The first two come from the same functions the manage page and the
 * campaign page describe rules with, so the three cannot disagree. No card of
 * its own: it lives inside a screen box, which already has a frame.
 */
export function RulesPanel({
  campaign,
  state,
  isStaff,
}: {
  campaign: CampaignRow;
  state: LiveState;
  isStaff: boolean;
}) {
  const [query, setQuery] = useState('');
  const [library, setLibrary] = useState<LibraryEntry[] | null>(null);

  useEffect(() => {
    let live = true;
    listCampaignContentAction(campaign.id)
      .then(rows => {
        if (live) setLibrary(rows.filter(r => r.entry.type === 'rule'));
      })
      .catch(() => {
        if (live) setLibrary([]);
      });
    return () => {
      live = false;
    };
  }, [campaign.id]);

  const building = describeRules(campaign.settings.rules, {
    allowHomebrew: campaign.settings.allowHomebrew,
  });
  const table = describeTableRules(state.rules, { omit: ['mode'] });
  const fight =
    state.encounter?.isActive && state.encounter.ruleOverrides
      ? patchedRuleKeys(state.encounter.ruleOverrides)
      : [];
  const fightLines = describeRuleKeys(state.rules, fight);
  const enforcing = state.rules.mode === 'enforce';

  const sections = useMemo(() => searchRules(query), [query]);
  const q = query.trim().toLowerCase();
  const conditions = q
    ? CONDITIONS.filter(
        c =>
          c.label.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q)
      )
    : CONDITIONS;
  const searching = q.length > 0;

  return (
    <div className="space-y-5 text-sm">
      {/* --- this table ------------------------------------------------- */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display-alt text-[0.7rem] uppercase tracking-[0.14em] text-gold/80">
            This table
          </h3>
          <span
            className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[0.62rem] uppercase tracking-[0.12em] ${
              enforcing
                ? 'border-danger/50 text-danger'
                : 'border-gold/50 text-gold-strong dark:text-gold'
            }`}
          >
            <Glyph name="gavel" size={11} />
            {enforcing ? 'Enforcing' : 'Advising'}
          </span>
        </div>

        {fightLines.length > 0 && state.encounter && (
          <div className="rounded-md border border-line bg-surface-2/60 px-3 py-2">
            <p className="text-xs text-ink-subtle">
              For {state.encounter.name} only
            </p>
            <ul className="mt-1 space-y-0.5 text-ink">
              {fightLines.map(line => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}

        {building.length + table.length === 0 ? (
          <p className="text-ink-muted">
            Played as printed. Nothing in the 2024 rules is changed here.
          </p>
        ) : (
          <ul className="space-y-1 text-ink-muted">
            {[...table, ...building].map(line => (
              <li key={line} className="flex gap-2">
                <span className="text-gold">※</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        )}
        {isStaff && (
          <Link
            href={`/campaigns/${campaign.id}/manage`}
            className="text-xs text-ink-subtle hover:text-ink"
          >
            Change them on the manage page
          </Link>
        )}
      </section>

      {/* --- house rules ------------------------------------------------ */}
      <section className="space-y-2">
        <h3 className="font-display-alt text-[0.7rem] uppercase tracking-[0.14em] text-gold/80">
          House rules
        </h3>
        {library === null ? (
          <p className="text-ink-subtle">Reading the table’s own rules…</p>
        ) : library.length === 0 && !campaign.settings.customRules.trim() ? (
          <div className="space-y-1">
            <p className="text-ink-muted">
              {isStaff
                ? 'None written down yet.'
                : 'None written down. The DM plays it as the book has it.'}
            </p>
            {isStaff && (
              <Link
                href="/creator/homebrew?type=rule"
                className="text-xs text-ink-subtle hover:text-ink"
              >
                Forge one, then approve it into this table’s library
              </Link>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {library.map(row => (
              <HouseRule key={row.id} row={row} />
            ))}
            {campaign.settings.customRules.trim() && (
              <li className="py-2">
                <p className="text-xs text-ink-subtle">From the DM’s notes</p>
                <p className="mt-1 whitespace-pre-wrap leading-relaxed text-ink-muted">
                  {campaign.settings.customRules}
                </p>
              </li>
            )}
          </ul>
        )}
      </section>

      {/* --- the book --------------------------------------------------- */}
      <section className="space-y-2">
        <h3 className="font-display-alt text-[0.7rem] uppercase tracking-[0.14em] text-gold/80">
          The book
        </h3>
        <Input
          aria-label="Search the rules"
          size="sm"
          placeholder="Cover, falling, Dodge, Prone…"
          value={query}
          onValueChange={setQuery}
          startContent={
            <Glyph name="magnifier" size={13} className="text-ink-subtle" />
          }
          isClearable
          onClear={() => setQuery('')}
        />
        {sections.length + conditions.length === 0 && (
          <p className="text-ink-muted">Nothing in the book says that.</p>
        )}
        {sections.map(section => (
          <details
            key={section.key}
            open={searching}
            className="group rounded-md border border-line"
          >
            <summary className="cursor-pointer select-none px-3 py-1.5 font-display text-sm text-ink">
              {section.title}
              <span className="ml-2 text-xs font-normal text-ink-subtle">
                {section.entries.length}
              </span>
            </summary>
            <dl className="space-y-3 border-t border-line px-3 py-2">
              {section.entries.map(entry => (
                <div key={entry.key}>
                  <dt className="flex items-baseline gap-2">
                    <span className="font-display text-sm text-ink">
                      {entry.title}
                    </span>
                    <span className="text-[0.65rem] uppercase tracking-[0.12em] text-ink-subtle">
                      {entry.cite}
                    </span>
                  </dt>
                  <dd className="mt-0.5 leading-relaxed text-ink-muted">
                    {entry.body}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        ))}
        {conditions.length > 0 && (
          <details
            open={searching}
            className="group rounded-md border border-line"
          >
            <summary className="cursor-pointer select-none px-3 py-1.5 font-display text-sm text-ink">
              Conditions
              <span className="ml-2 text-xs font-normal text-ink-subtle">
                {conditions.length}
              </span>
            </summary>
            <dl className="space-y-2 border-t border-line px-3 py-2">
              {conditions.map(c => (
                <div key={c.key}>
                  <dt
                    className={`font-display-alt text-[0.68rem] uppercase tracking-[0.12em] ${
                      c.tone === 'danger'
                        ? 'text-danger'
                        : 'text-gold-strong dark:text-gold'
                    }`}
                  >
                    {c.label}
                  </dt>
                  <dd className="text-ink-muted">{c.hint}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}
        <Marginalia>
          SRD 5.2, condensed — the section name says where
        </Marginalia>
      </section>
    </div>
  );
}

/** One house rule: the line, then the whole thing on request. */
function HouseRule({ row }: { row: LibraryEntry }) {
  const d = parseContentData('rule', row.entry.data) as RuleData;
  return (
    <li className="py-2">
      <details className="group">
        <summary className="cursor-pointer select-none">
          <span className="font-display text-sm text-ink">
            {row.entry.name}
          </span>
          {d.replaces && (
            <span className="ml-2 text-xs text-ink-subtle">
              replaces {d.replaces}
            </span>
          )}
          {/* The line is in the block once it is open. */}
          {d.summary && (
            <span className="mt-0.5 block text-ink-muted group-open:hidden">
              {d.summary}
            </span>
          )}
        </summary>
        <div className="mt-2 border-l-2 border-gold/25 pl-3">
          <StatBlock entry={row.entry} headless showSource={false} />
        </div>
      </details>
    </li>
  );
}
