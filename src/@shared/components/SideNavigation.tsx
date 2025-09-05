'use client';

import { useAuth } from '@/@auth/context';
import { Button } from '@heroui/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

interface NavItem {
  name: string;
  href: string;
  icon: string;
  description: string;
}

const navigationItems: NavItem[] = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: '🏠',
    description: 'Overview of your characters and campaigns',
  },
  {
    name: 'Campaigns',
    href: '/campaigns',
    icon: '🏰',
    description: 'Manage your campaigns and join adventures',
  },
  {
    name: 'Characters',
    href: '/characters',
    icon: '🗡️',
    description: 'Manage your character collection',
  },
  {
    name: 'Spells',
    href: '/spells',
    icon: '🔮',
    description: 'Browse and create spells',
  },
  {
    name: 'Classes',
    href: '/classes',
    icon: '⚔️',
    description: 'Explore character classes',
  },
  {
    name: 'Items',
    href: '/items',
    icon: '🛡️',
    description: 'Weapons, armor, and magical items',
  },
  {
    name: 'Marketplace',
    href: '/marketplace',
    icon: '🛒',
    description: 'Browse public homebrew content',
  },
  {
    name: 'Creator',
    href: '/creator',
    icon: '✨',
    description: 'Create new content',
  },
  {
    name: 'Account',
    href: '/account/profile',
    icon: '👤',
    description: 'Manage your profile',
  },
  {
    name: 'Settings',
    href: '/account/settings',
    icon: '⚙️',
    description: 'App preferences and settings',
  },
];

export function SideNavigation() {
  const { logout } = useAuth();
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  return (
    <div
      className={`bg-gradient-to-b from-slate-900 via-purple-900 to-slate-900 min-h-screen transition-all duration-300 ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Header */}
      <div className="p-4 border-b border-purple-600/30">
        <div className="flex items-center justify-between">
          {!isCollapsed && (
            <div className="flex items-center space-x-2">
              <div className="text-2xl">✨</div>
              <h1 className="text-xl font-bold text-white">Hero Nexus</h1>
            </div>
          )}
          <Button
            isIconOnly
            variant="light"
            size="sm"
            onPress={() => setIsCollapsed(!isCollapsed)}
            className="text-purple-300 hover:text-white hover:bg-purple-600/20"
          >
            {isCollapsed ? '→' : '←'}
          </Button>
        </div>
      </div>

      {/* Navigation Items */}
      <nav className="p-4 space-y-2">
        {navigationItems.map(item => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + '/');

          return (
            <Link key={item.href} href={item.href}>
              <div
                className={`group flex items-center p-3 rounded-lg transition-all duration-200 ${
                  isActive
                    ? 'bg-purple-600/30 border border-purple-500/50 text-white'
                    : 'text-purple-200 hover:bg-purple-600/20 hover:text-white'
                }`}
              >
                <div className="text-2xl mr-3">{item.icon}</div>
                {!isCollapsed && (
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {item.name}
                    </div>
                    <div className="text-xs text-purple-300 truncate">
                      {item.description}
                    </div>
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* User Section */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-purple-600/30">
        {!isCollapsed && (
          <div className="mb-4">
            <div className="text-sm text-purple-300 mb-2">Welcome back!</div>
            <div className="text-xs text-purple-400">
              Ready for your next adventure?
            </div>
          </div>
        )}
        <Button
          color="danger"
          variant="light"
          size="sm"
          onPress={handleLogout}
          className="w-full justify-start text-red-300 hover:text-white hover:bg-red-600/20"
        >
          <div className="text-lg mr-2">🚪</div>
          {!isCollapsed && 'Sign Out'}
        </Button>
      </div>
    </div>
  );
}
