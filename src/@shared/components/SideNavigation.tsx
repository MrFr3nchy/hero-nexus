'use client';

import { Button, Link } from '@heroui/react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useAuth } from '@/@auth/context';
import { Glyph, type GlyphName, Marginalia } from './ui';
import { ThemeToggle } from './ThemeToggle';

interface NavItem {
  name: string;
  href: string;
  icon: GlyphName;
  /** Where "one more of these" starts. Renders the row's `+`. */
  create?: string;
  /** What the `+` makes, for its tooltip and its label. */
  creates?: string;
}

/** Primary: the things you own. Compendium: the reference shelves. */
const PRIMARY: NavItem[] = [
  { name: 'Table', href: '/dashboard', icon: 'house' },
  {
    name: 'Campaigns',
    href: '/campaigns',
    icon: 'castle',
    create: '/campaigns/create',
    creates: 'campaign',
  },
  {
    name: 'Heroes',
    href: '/characters',
    icon: 'sword',
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
        icon: 'shield',
        create: '/creator/homebrew?type=class',
        creates: 'class',
      },
      {
        name: 'Species',
        href: '/species',
        icon: 'tree',
        create: '/creator/homebrew?type=species',
        creates: 'species',
      },
      {
        name: 'Backgrounds',
        href: '/backgrounds',
        icon: 'scroll',
        create: '/creator/homebrew?type=background',
        creates: 'background',
      },
      {
        name: 'Feats',
        href: '/feats',
        icon: 'star',
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
        icon: 'wand',
        create: '/creator/homebrew?type=spell',
        creates: 'spell',
      },
      {
        name: 'Items',
        href: '/items',
        icon: 'chest',
        create: '/creator/homebrew?type=item',
        creates: 'item',
      },
      {
        name: 'Bestiary',
        href: '/bestiary',
        icon: 'paw',
        create: '/creator/homebrew?type=creature',
        creates: 'creature',
      },
      {
        name: 'House rules',
        href: '/house-rules',
        icon: 'gavel',
        create: '/creator/homebrew?type=rule',
        creates: 'rule',
      },
    ],
  },
];

/** Where a fold made by hand is kept between visits. */
const FOLD_KEY = 'hero-nexus:spine-folded';

/** Reached from the sidebar foot, below both groups. */
const LIBRARY: NavItem = {
  name: 'Library',
  href: '/library',
  icon: 'books',
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

/**
 * One shelf row. Hoisted out of `SideNavigation` so React sees the same
 * component type across renders — defined inside, every re-render remounted
 * every row, which is what made the fold snap instead of transition.
 */
function Row({
  item,
  collapsed,
  pathname,
}: {
  item: NavItem;
  collapsed: boolean;
  pathname: string;
}) {
  const active = pathname === item.href || pathname.startsWith(item.href + '/');
  return (
    <div className="group relative flex items-stretch">
      <Link
        href={item.href}
        title={collapsed ? item.name : undefined}
        className={`relative flex flex-1 items-center gap-3 py-2.5 text-sm transition-colors ${
          collapsed ? 'justify-center px-0' : 'pl-5 pr-3'
        } ${
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
        <Glyph name={item.icon} size={17} />
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

export function SideNavigation() {
  const { logout, currentUser } = useAuth();
  const pathname = usePathname();
  /*
   * Folded to its icon strip on the screen route. The screen is the one page
   * a table operates for four hours, and a 15rem column of shelves it is not
   * reading is a fifth of a laptop given to the compendium. The hand control
   * still works there; this only sets where it starts. A convention broken
   * on purpose.
   */
  const onScreen = /^\/campaigns\/[^/]+\/screen/.test(pathname);
  const [collapsedByHand, setCollapsedByHand] = useState<boolean | null>(null);
  // A fold made by hand outlives the tab: the reader who tucked the spine
  // away did not ask for it back on every reload.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(FOLD_KEY);
      if (saved === '1' || saved === '0') setCollapsedByHand(saved === '1');
    } catch {
      /* storage blocked — the fold just does not persist */
    }
  }, []);
  const collapsed = collapsedByHand ?? onScreen;
  const setCollapsed = (next: boolean) => {
    setCollapsedByHand(next);
    try {
      window.localStorage.setItem(FOLD_KEY, next ? '1' : '0');
    } catch {
      /* see above */
    }
  };

  const firstName =
    currentUser?.name?.trim().split(/\s+/)[0] ||
    currentUser?.email?.split('@')[0] ||
    'traveler';

  return (
    <aside
      className={`sticky top-0 flex h-screen shrink-0 flex-col bg-surface transition-[width] duration-200 ${
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
          <Glyph
            name={collapsed ? 'chevron-right' : 'chevron-left'}
            size={16}
          />
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {PRIMARY.map(item => (
          <Row
            key={item.href}
            item={item}
            collapsed={collapsed}
            pathname={pathname}
          />
        ))}
        <div className={`my-3 h-px bg-line ${collapsed ? 'mx-3' : 'mx-5'}`} />
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
              <Row
                key={item.href}
                item={item}
                collapsed={collapsed}
                pathname={pathname}
              />
            ))}
          </div>
        ))}
        <div className={`my-3 h-px bg-line ${collapsed ? 'mx-3' : 'mx-5'}`} />
        <Row item={LIBRARY} collapsed={collapsed} pathname={pathname} />
      </nav>

      {/*
        Folded, the strip is 4rem wide and three controls do not fit on one
        row — the theme toggle used to hang past the spine over the page.
        So the foot stacks: one control per row, each centred on the icon
        column the nav rows above use.
      */}
      <div
        className={`flex border-t border-line py-3 ${
          collapsed ? 'flex-col items-center gap-1 px-2' : 'flex-col px-3'
        }`}
      >
        {!collapsed && currentUser && (
          <Marginalia className="mb-2 px-2 !text-[1.05rem]">
            Signed in as {firstName}
          </Marginalia>
        )}
        <div
          className={`flex items-center ${
            collapsed ? 'flex-col gap-1' : 'justify-between gap-1'
          }`}
        >
          <Link
            href="/account"
            title="Account"
            aria-label={collapsed ? 'Account' : undefined}
            className={`flex items-center gap-2 rounded-md py-1.5 text-sm transition-colors ${
              collapsed ? 'h-8 w-8 justify-center' : 'px-2'
            } ${
              pathname.startsWith('/account')
                ? 'text-ink'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Glyph name="person" size={16} />
            {!collapsed && <span>Account</span>}
          </Link>
          <ThemeToggle />
        </div>
        <Button
          variant="light"
          size="sm"
          isIconOnly={collapsed}
          onPress={() => logout()}
          aria-label="Sign out"
          title={collapsed ? 'Sign out' : undefined}
          className={`mt-1 text-ink-muted data-[hover=true]:text-danger ${
            collapsed ? '' : 'w-full justify-start'
          }`}
          startContent={
            collapsed ? undefined : <Glyph name="sign-out" size={16} />
          }
        >
          {collapsed ? <Glyph name="sign-out" size={16} /> : 'Sign out'}
        </Button>
      </div>
    </aside>
  );
}
