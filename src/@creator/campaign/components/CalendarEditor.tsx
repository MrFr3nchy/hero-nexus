'use client';

import { Button, Input, NumberInput, Select, SelectItem } from '@heroui/react';

import {
  CALENDAR_PRESETS,
  daysInYear,
  MAX_MONTHS,
  MAX_MOONS,
  MAX_WEEKDAYS,
  type CalendarDef,
} from '../lib/calendar';

/**
 * The calendar editor on the manage page (10).
 *
 * A preset to start from — the common year, Harptos — and then every part
 * of it is the DM's to change: month names and lengths, the days of the
 * week, hours in a day, the label after the year, the moons. A one-day
 * month is a festival day and reads by its name alone on the screen; a
 * zero-day month is one the year skips, so a festival can be turned off
 * without renumbering the rest.
 *
 * Controlled: the manage form owns the value and saves it with everything
 * else. Nothing here touches where the clock *stands* — that is the mode
 * bar's, because it moves every rest.
 */
export function CalendarEditor({
  value,
  onChange,
}: {
  value: CalendarDef;
  onChange: (next: CalendarDef) => void;
}) {
  const preset =
    CALENDAR_PRESETS.find(p => JSON.stringify(p.def) === JSON.stringify(value))
      ?.key ?? 'custom';
  const set = <K extends keyof CalendarDef>(key: K, v: CalendarDef[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Start from"
          description="A preset to begin with. Anything you change below makes it your own."
          selectedKeys={[preset]}
          onSelectionChange={keys => {
            const k = String(Array.from(keys)[0] ?? preset);
            const p = CALENDAR_PRESETS.find(x => x.key === k);
            if (p) onChange(structuredClone(p.def));
          }}
        >
          {[
            ...CALENDAR_PRESETS.map(p => (
              <SelectItem key={p.key} textValue={p.label} description={p.line}>
                {p.label}
              </SelectItem>
            )),
            <SelectItem
              key="custom"
              textValue="Custom"
              description="Your own months, week and day."
            >
              Custom
            </SelectItem>,
          ]}
        </Select>
        <Input
          label="Calendar name"
          value={value.name}
          onValueChange={v => set('name', v)}
        />
        <NumberInput
          label="Hours in a day"
          minValue={1}
          maxValue={100}
          value={value.hoursPerDay}
          onValueChange={v =>
            set(
              'hoursPerDay',
              Number.isFinite(v)
                ? Math.max(1, Math.min(100, Math.trunc(v)))
                : 24
            )
          }
        />
        <Input
          label="After the year"
          description="DR, AC — or nothing."
          value={value.epochLabel}
          onValueChange={v => set('epochLabel', v.slice(0, 12))}
        />
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-display-alt text-[0.7rem] uppercase tracking-[0.14em] text-gold/80">
            Months
          </h3>
          <span className="text-xs text-ink-subtle">
            {daysInYear(value)} days in the year
          </span>
        </div>
        <p className="mt-0.5 text-xs text-ink-subtle">
          One day is a festival and reads by its name. Zero days is a month the
          year skips.
        </p>
        <ul className="mt-2 space-y-1.5">
          {value.months.map((m, i) => (
            <li key={i} className="flex items-end gap-2">
              <Input
                size="sm"
                aria-label={`Month ${i + 1} name`}
                className="flex-1"
                value={m.name}
                onValueChange={v =>
                  set(
                    'months',
                    value.months.map((x, n) =>
                      n === i ? { ...x, name: v } : x
                    )
                  )
                }
              />
              <NumberInput
                size="sm"
                aria-label={`Month ${i + 1} days`}
                className="w-24"
                minValue={0}
                maxValue={400}
                value={m.days}
                onValueChange={v =>
                  set(
                    'months',
                    value.months.map((x, n) =>
                      n === i
                        ? {
                            ...x,
                            days: Number.isFinite(v)
                              ? Math.max(0, Math.min(400, Math.trunc(v)))
                              : x.days,
                          }
                        : x
                    )
                  )
                }
              />
              <Button
                size="sm"
                variant="light"
                isIconOnly
                aria-label="Remove month"
                className="text-ink-subtle"
                isDisabled={value.months.length <= 1}
                onPress={() =>
                  set(
                    'months',
                    value.months.filter((_, n) => n !== i)
                  )
                }
              >
                ×
              </Button>
            </li>
          ))}
        </ul>
        {value.months.length < MAX_MONTHS && (
          <Button
            size="sm"
            variant="flat"
            className="mt-2"
            onPress={() =>
              set('months', [
                ...value.months,
                { name: `Month ${value.months.length + 1}`, days: 30 },
              ])
            }
          >
            Add a month
          </Button>
        )}
      </div>

      <div>
        <h3 className="font-display-alt text-[0.7rem] uppercase tracking-[0.14em] text-gold/80">
          Days of the week
        </h3>
        <p className="mt-0.5 text-xs text-ink-subtle">
          They cycle over every day of the year, festivals included.
        </p>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {value.weekdays.map((w, i) => (
            <li key={i} className="flex items-center gap-1">
              <Input
                size="sm"
                aria-label={`Weekday ${i + 1}`}
                className="w-32"
                value={w}
                onValueChange={v =>
                  set(
                    'weekdays',
                    value.weekdays.map((x, n) => (n === i ? v : x))
                  )
                }
              />
              <Button
                size="sm"
                variant="light"
                isIconOnly
                aria-label="Remove weekday"
                className="text-ink-subtle"
                isDisabled={value.weekdays.length <= 1}
                onPress={() =>
                  set(
                    'weekdays',
                    value.weekdays.filter((_, n) => n !== i)
                  )
                }
              >
                ×
              </Button>
            </li>
          ))}
          {value.weekdays.length < MAX_WEEKDAYS && (
            <li>
              <Button
                size="sm"
                variant="flat"
                onPress={() =>
                  set('weekdays', [
                    ...value.weekdays,
                    `Day ${value.weekdays.length + 1}`,
                  ])
                }
              >
                Add a day
              </Button>
            </li>
          )}
        </ul>
      </div>

      <div>
        <h3 className="font-display-alt text-[0.7rem] uppercase tracking-[0.14em] text-gold/80">
          Moons
        </h3>
        <ul className="mt-2 space-y-1.5">
          {(value.moons ?? []).map((m, i) => (
            <li key={i} className="flex items-end gap-2">
              <Input
                size="sm"
                aria-label={`Moon ${i + 1} name`}
                className="flex-1"
                value={m.name}
                onValueChange={v =>
                  set(
                    'moons',
                    (value.moons ?? []).map((x, n) =>
                      n === i ? { ...x, name: v } : x
                    )
                  )
                }
              />
              <NumberInput
                size="sm"
                label="Cycle, days"
                className="w-28"
                minValue={2}
                maxValue={1000}
                value={m.cycleDays}
                onValueChange={v =>
                  set(
                    'moons',
                    (value.moons ?? []).map((x, n) =>
                      n === i
                        ? {
                            ...x,
                            cycleDays: Number.isFinite(v)
                              ? Math.max(2, Math.min(1000, Math.trunc(v)))
                              : x.cycleDays,
                          }
                        : x
                    )
                  )
                }
              />
              <NumberInput
                size="sm"
                label="Full on day"
                className="w-28"
                minValue={0}
                maxValue={1000}
                value={m.offset}
                onValueChange={v =>
                  set(
                    'moons',
                    (value.moons ?? []).map((x, n) =>
                      n === i
                        ? {
                            ...x,
                            offset: Number.isFinite(v)
                              ? Math.max(0, Math.min(1000, Math.trunc(v)))
                              : x.offset,
                          }
                        : x
                    )
                  )
                }
              />
              <Button
                size="sm"
                variant="light"
                isIconOnly
                aria-label="Remove moon"
                className="text-ink-subtle"
                onPress={() =>
                  set(
                    'moons',
                    (value.moons ?? []).filter((_, n) => n !== i)
                  )
                }
              >
                ×
              </Button>
            </li>
          ))}
        </ul>
        {(value.moons ?? []).length < MAX_MOONS && (
          <Button
            size="sm"
            variant="flat"
            className="mt-2"
            onPress={() =>
              set('moons', [
                ...(value.moons ?? []),
                {
                  name:
                    (value.moons ?? []).length === 0 ? 'The moon' : 'A moon',
                  cycleDays: 30,
                  offset: 0,
                },
              ])
            }
          >
            Add a moon
          </Button>
        )}
      </div>
    </div>
  );
}
