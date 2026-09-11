'use client';

import { Button, Link } from '@heroui/react';
import { Icon } from '@iconify/react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { useAuth } from '@/@auth/context';
import { Glyph, Marginalia } from './ui';
import { ThemeToggle } from './ThemeToggle';

interface NavItem {
  name: string;
  href: string;
  icon: string;
  /** Where "one more of these" starts. Renders the row's `+`. */
  create?: string;
  /** What the `+` makes, for its tooltip and its label. */
  creates?: string;
}

/** Primary: the things you own. Compendium: the reference shelves. */
const PRIMARY: NavItem[] = [
  { name: 'Table', href: '/dashboard', icon: 'ph:house-bold' },
  {
    name: 'Campaigns',
    href: '/campaigns',
    icon: 'ph:castle-turret-bold',
    create: '/campaigns/create',
    creates: 'campaign',
  },
  {
    name: 'Heroes',
    href: '/characters',
    icon: 'ph:sword-bold',
    create: '/creator/character',
    creates: 'hero',
  },
];

/**
 * The shelves, each with the way to add to it.
 *
 * There is no "Forge" row any more. A hub whose whole job was two links to
 * pages this sidebar already reaches is a stop on the way to somewhere else;
 * the `+` on a shelf goes straight to the forge with that type selected, which
 * is what anyone clicking "Forge" was after. `/creator` still redirects, for
 * anything holding the old link.
 *
 * **Every kind the Forge can make is reachable from here.** That is the rule
 * this list answers to: the Forge could author eight `CONTENT_TYPES` while the
 * sidebar listed four, so a forged background or feat had nowhere to be looked
 * at and no `+` that would start one. Adding a type to `CONTENT_REGISTRY`
 * means adding it here — or, like `subclass`, deliberately housing it on
 * another shelf's page and saying why.
 *
 * Grouped rather than flat: eight rows in one run is a wall, and the split is
 * a real one. The first group is what a hero is assembled out of — every kind
 * the character builder picks from. The second is what the world is furnished
 * with.
 */
interface NavGroup {
  /** Straight, not the hand face: a nav label is load-bearing (rule 5). */
  label: string;
  items: NavItem[];
}

const COMPENDIUM: NavGroup[] = [
  {
    label: 'Character options',
    items: [
      {
        name: 'Classes',
        href: '/classes',
        icon: 'ph:shield-bold',
        create: '/creator/homebrew?type=class',
        creates: 'class',
      },
      {
        name: 'Species',
        href: '/species',
        icon: 'ph:tree-bold',
        create: '/creator/homebrew?type=species',
        creates: 'species',
      },
      {
        name: 'Backgrounds',
        href: '/backgrounds',
        icon: 'ph:scroll-bold',
        create: '/creator/homebrew?type=background',
        creates: 'background',
      },
      {
        name: 'Feats',
        href: '/feats',
        icon: 'ph:star-bold',
        create: '/creator/homebrew?type=feat',
        creates: 'feat',
      },
    ],
  },
  {
    label: 'Rules & world',
    items: [
      {
        name: 'Spells',
        href: '/spells',
        icon: 'ph:magic-wand-bold',
        create: '/creator/homebrew?type=spell',
        creates: 'spell',
      },
      {
        name: 'Items',
        href: '/items',
        icon: 'ph:treasure-chest-bold',
        create: '/creator/homebrew?type=item',
        creates: 'item',
      },
      {
        name: 'Bestiary',
        href: '/bestiary',
        icon: 'ph:paw-print-bold',
        create: '/creator/homebrew?type=creature',
        creates: 'creature',
      },
    ],
  },
];

/** Reached from the sidebar foot, below both groups. */
const LIBRARY: NavItem = {
  name: 'Library',
  href: '/library',
  icon: 'ph:books-bold',
};

/**
 * Every route this sidebar links to.
 *
 * Exported because `ConditionalLayout` decides which shell a route gets from a
 * list of private routes, and that list was maintained by hand — so adding
 * `/species`, `/backgrounds` and `/feats` here gave them a nav row that then
 * rendered them with the *public* top bar and no sidebar at all. Deriving that
 * list from this one means a route cannot be in the sidebar and not get the
 * sidebar; the two can no longer disagree.
 */
export const NAV_HREFS: string[] = [
  ...PRIMARY.map(i => i.href),
  ...COMPENDIUM.flatMap(g => g.items.map(i => i.href)),
  LIBRARY.href,
];

export function SideNavigation() {
  const { logout, currentUser } = useAuth();
  const pathname = usePathname();
  /*
   * Folded to its icon strip on the screen route. The screen is the one page
   * a table operates for four hours, and a 15rem column of shelves it is not
   * reading is a fifth of a laptop given to the compendium. The hand control
   * still works there; this only sets where it starts. Named in
   * docs/handoff/the-three-tables/README.md as a convention broken on purpose.
   */
  const onScreen = /^\/campaigns\/[^/]+\/screen/.test(pathname);
  const [collapsedByHand, setCollapsedByHand] = useState<boolean | null>(null);
  const collapsed = collapsedByHand ?? onScreen;
  const setCollapsed = (next: boolean) => setCollapsedByHand(next);

  const firstName =
    currentUser?.name?.trim().split(/\s+/)[0] ||
    currentUser?.email?.split('@')[0] ||
    'traveller';

  function Row({ item }: { item: NavItem }) {
    const active =
      pathname === item.href || pathname.startsWith(item.href + '/');
    return (
      <div className="group relative flex items-stretch">
        <Link
          href={item.href}
          title={collapsed ? item.name : undefined}
          className={`relative flex flex-1 items-center gap-3 py-2.5 pl-5 pr-3 text-sm transition-colors ${
            active
              ? 'bg-gold font-medium text-bg'
              : 'text-ink-muted hover:bg-surface-2/70 hover:text-ink'
          }`}
        >
          {active && (
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 w-1 bg-danger"
            />
          )}
          <Icon icon={item.icon} width={17} className="shrink-0" />
          {!collapsed && <span className="truncate">{item.name}</span>}
        </Link>
        {/*
          The way to add to the shelf you are looking at, on the shelf itself.
          Collapsed there is no room for it, and the row's own link still
          reaches the page that carries the same control.
        */}
        {item.create && !collapsed && (
          <Link
            href={item.create}
            aria-label={`Forge a new ${item.creates}`}
            title={`New ${item.creates}`}
            className={`flex items-center px-3 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 ${
              active
                ? 'bg-gold text-bg hover:text-bg/70'
                : 'text-ink-subtle hover:bg-surface-2/70 hover:text-gold-strong'
            }`}
          >
            <Glyph name="plus" size={15} />
          </Link>
        )}
      </div>
    );
  }

  return (
    <aside
      className={`relative flex min-h-screen flex-col bg-surface transition-[width] duration-200 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* spine edge */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-[3px] bg-gradient-to-b from-transparent via-gold/40 to-transparent"
      />

      <div className="flex items-center justify-between border-b border-line px-3 py-4">
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image
              src="/icons/hero-nexus-logo-no-bg.png"
              alt=""
              width={28}
              height={28}
              className="h-7 w-7"
            />
            <span className="font-display-alt text-sm font-semibold tracking-wide text-gold-strong">
              Hero Nexus
            </span>
          </Link>
        )}
        <Button
          isIconOnly
          size="sm"
          variant="light"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="text-ink-muted"
          onPress={() => setCollapsed(!collapsed)}
        >
          <Icon
            icon={collapsed ? 'ph:caret-right-bold' : 'ph:caret-left-bold'}
            width={16}
          />
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {PRIMARY.map(item => (
          <Row key={item.href} item={item} />
        ))}
        <div className="mx-5 my-3 h-px bg-line" />
        {COMPENDIUM.map(group => (
          <div key={group.label} className="mb-1">
            {/*
              Collapsed there is no room for a word, and the icons still read
              in the order the groups put them in.
            */}
            {!collapsed && (
              <h2 className="px-5 pb-1 pt-2 font-display-alt text-[0.6rem] uppercase tracking-[0.14em] text-ink-subtle">
                {group.label}
              </h2>
            )}
            {group.items.map(item => (
              <Row key={item.href} item={item} />
            ))}
          </div>
        ))}
        <div className="mx-5 my-3 h-px bg-line" />
        <Row item={LIBRARY} />
      </nav>

      <div className="border-t border-line px-3 py-3">
        {!collapsed && currentUser && (
          <Marginalia className="mb-2 px-2 !text-[1.05rem]">
            Signed in as {firstName}
          </Marginalia>
        )}
        <div className="flex items-center justify-between gap-1">
          <Link
            href="/account/profile"
            title="Account"
            className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
              pathname.startsWith('/account')
                ? 'text-ink'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Icon icon="ph:user-bold" width={16} />
            {!collapsed && <span>Account</span>}
          </Link>
          <ThemeToggle />
        </div>
        <Button
          variant="light"
          size="sm"
          onPress={() => logout()}
          className="mt-1 w-full justify-start text-ink-muted data-[hover=true]:text-danger"
          startContent={<Icon icon="ph:sign-out-bold" width={16} />}
        >
          {!collapsed && 'Sign out'}
        </Button>
      </div>
    </aside>
  );
}
