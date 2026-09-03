'use client';

import { Button, Link } from '@heroui/react';
import { Icon } from '@iconify/react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { useAuth } from '@/@auth/context';
import { Marginalia } from './ui';
import { ThemeToggle } from './ThemeToggle';

interface NavItem {
  name: string;
  href: string;
  icon: string;
}

/** Primary: the things you own. Compendium: the reference shelves. */
const PRIMARY: NavItem[] = [
  { name: 'Table', href: '/dashboard', icon: 'ph:house-bold' },
  { name: 'Campaigns', href: '/campaigns', icon: 'ph:castle-turret-bold' },
  { name: 'Heroes', href: '/characters', icon: 'ph:sword-bold' },
];

const COMPENDIUM: NavItem[] = [
  { name: 'Forge', href: '/creator', icon: 'ph:sparkle-bold' },
  { name: 'Classes', href: '/classes', icon: 'ph:shield-bold' },
  { name: 'Spells', href: '/spells', icon: 'ph:magic-wand-bold' },
  { name: 'Market', href: '/marketplace', icon: 'ph:storefront-bold' },
];

export function SideNavigation() {
  const { logout, currentUser } = useAuth();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const firstName =
    currentUser?.name?.trim().split(/\s+/)[0] ||
    currentUser?.email?.split('@')[0] ||
    'traveller';

  function Row({ item }: { item: NavItem }) {
    const active =
      pathname === item.href || pathname.startsWith(item.href + '/');
    return (
      <Link
        href={item.href}
        title={collapsed ? item.name : undefined}
        className={`relative flex items-center gap-3 py-2.5 pl-5 pr-3 text-sm transition-colors ${
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
          onPress={() => setCollapsed(v => !v)}
        >
          <Icon
            icon={collapsed ? 'ph:caret-right-bold' : 'ph:caret-left-bold'}
            width={16}
          />
        </Button>
      </div>

      <nav className="flex-1 py-3">
        {PRIMARY.map(item => (
          <Row key={item.href} item={item} />
        ))}
        <div className="mx-5 my-3 h-px bg-line" />
        {COMPENDIUM.map(item => (
          <Row key={item.href} item={item} />
        ))}
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
