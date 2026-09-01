'use client';

import { Button, Link } from '@heroui/react';
import { Icon } from '@iconify/react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { useAuth } from '@/@auth/context';
import { ThemeToggle } from './ThemeToggle';

interface NavItem {
  name: string;
  href: string;
  icon: string;
}

const navigationItems: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: 'ph:house-bold' },
  { name: 'Campaigns', href: '/campaigns', icon: 'ph:castle-turret-bold' },
  { name: 'Characters', href: '/characters', icon: 'ph:sword-bold' },
  { name: 'Creator', href: '/creator', icon: 'ph:sparkle-bold' },
  { name: 'Classes', href: '/classes', icon: 'ph:shield-bold' },
  { name: 'Spells', href: '/spells', icon: 'ph:magic-wand-bold' },
  { name: 'Marketplace', href: '/marketplace', icon: 'ph:storefront-bold' },
  { name: 'Account', href: '/account/profile', icon: 'ph:user-bold' },
];

export function SideNavigation() {
  const { logout } = useAuth();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`flex min-h-screen flex-col border-r border-line bg-surface transition-[width] duration-200 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      <div className="flex items-center justify-between border-b border-line px-3 py-4">
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2 text-ink">
            <Image
              src="/icons/hero-nexus-logo-no-bg.png"
              alt=""
              width={28}
              height={28}
              className="h-7 w-7"
            />
            <span className="font-display-alt text-sm font-semibold tracking-wide">
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

      <nav className="flex-1 space-y-1 p-3">
        {navigationItems.map(item => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md border-l-2 px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'border-gold bg-surface-2 font-medium text-ink'
                  : 'border-transparent text-ink-muted hover:bg-surface-2 hover:text-ink'
              }`}
              title={collapsed ? item.name : undefined}
            >
              <Icon icon={item.icon} width={18} className="shrink-0" />
              {!collapsed && <span className="truncate">{item.name}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-line p-3">
        <div className={collapsed ? 'flex justify-center' : ''}>
          <ThemeToggle />
        </div>
        <Button
          variant="light"
          size="sm"
          onPress={() => logout()}
          className="w-full justify-start text-ink-muted data-[hover=true]:text-danger"
          startContent={<Icon icon="ph:sign-out-bold" width={16} />}
        >
          {!collapsed && 'Sign out'}
        </Button>
      </div>
    </aside>
  );
}
