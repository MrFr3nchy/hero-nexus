'use client';

import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectItem,
} from '@heroui/react';

import { Glyph } from '@/@shared/components/ui';
import type { EncounterRow, LiveState } from '@/server/session';
import { TABLE_RULE_FIELDS, type TableRulesPatch } from '../../lib/table-rules';
import { setFightRulesAction } from '../../rules-actions';

type Act = (p: Promise<{ ok: boolean; error?: string }>) => Promise<void>;

/**
 * This fight's rules. Staff only, on the initiative box.
 *
 * The handful of rules worth flipping mid-fight — advise or enforce,
 * flanking, the movement fence — each as a pick between "as the table has
 * it" and the rule's own values. A pick writes at once and announces
 * itself; nothing here needs a save button because a fight is not a form.
 *
 * `perFight` on the registry decides what appears, so a rule that later
 * earns a place here is one flag rather than another control.
 */
export function FightRules({
  encounter,
  state,
  act,
}: {
  encounter: EncounterRow;
  state: LiveState;
  act: Act;
}) {
  const fields = TABLE_RULE_FIELDS.filter(f => f.perFight);
  const overrides = encounter.ruleOverrides;
  const held = Object.keys(overrides).length;

  // The whole set goes back each time; the server replaces rather than
  // merges, so taking a key off is the same call as setting one.
  const set = (key: string, value: string | null) => {
    const next: Record<string, unknown> = { ...overrides };
    if (value === null) delete next[key];
    else next[key] = value;
    void act(
      setFightRulesAction(encounter.id, Object.keys(next).length ? next : null)
    );
  };

  return (
    <Popover placement="bottom-end">
      <PopoverTrigger>
        <Button
          size="sm"
          variant={held > 0 ? 'flat' : 'light'}
          className={
            held > 0 ? 'text-gold-strong dark:text-gold' : 'text-ink-muted'
          }
          startContent={<Glyph name="gavel" size={13} />}
          aria-label="Rules for this fight"
        >
          {held > 0 ? `This fight · ${held}` : 'This fight'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 border border-line bg-surface p-3">
        <div className="flex w-full flex-col gap-3">
          <p className="text-xs text-ink-subtle">
            What {encounter.name} does differently. Everything else follows the
            table.
          </p>
          {fields.map(field => {
            const own = readOverride(overrides, field.key);
            // `state.rules` is the effective set, so the table's own value is
            // only known for a key this fight is not overriding — and that
            // is the only time the label needs it.
            const tableLabel = own
              ? null
              : (field.options.find(o => o.value === field.read(state.rules))
                  ?.label ?? null);
            return (
              <Select
                key={field.key}
                size="sm"
                label={field.label}
                aria-label={field.label}
                selectedKeys={[own ?? 'table']}
                onSelectionChange={keys => {
                  const key = String(Array.from(keys)[0] ?? 'table');
                  set(field.key, key === 'table' ? null : key);
                }}
                classNames={{ trigger: 'h-10 min-h-10' }}
              >
                {[
                  <SelectItem
                    key="table"
                    textValue={
                      tableLabel
                        ? `As the table: ${tableLabel}`
                        : 'As the table'
                    }
                  >
                    {tableLabel
                      ? `As the table · ${tableLabel}`
                      : 'As the table'}
                  </SelectItem>,
                  ...field.options.map(o => (
                    <SelectItem
                      key={o.value}
                      textValue={o.label}
                      description={o.note}
                    >
                      {o.label}
                    </SelectItem>
                  )),
                ]}
              </Select>
            );
          })}
          {held > 0 && (
            <Button
              size="sm"
              variant="light"
              className="self-start text-ink-subtle"
              onPress={() => void act(setFightRulesAction(encounter.id, null))}
            >
              Back to the table’s rules
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** The override's value for a registry key, as the option string, or null. */
function readOverride(patch: TableRulesPatch, key: string): string | null {
  const v = (patch as Record<string, unknown>)[key];
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 'on' : 'off';
  return String(v);
}
