'use client';

import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Link,
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
  NavbarMenu,
  NavbarMenuItem,
  NavbarMenuToggle,
  User,
} from '@heroui/react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { useAuth } from '@/@auth/context';
import { NAV_ITEMS } from '@/@auth/types/constants';
import { ThemeToggle } from './ThemeToggle';

export const Navigation = () => {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  let currentUser = null;
  let logout = async () => {};
  try {
    const auth = useAuth();
    currentUser = auth.currentUser;
    logout = auth.logout;
  } catch {
    /* auth context not mounted (SSR) */
  }

  const links = NAV_ITEMS.filter(
    item => !['Login', 'Register'].includes(item.name)
  );

  return (
    <Navbar
      isMenuOpen={isMenuOpen}
      onMenuOpenChange={setIsMenuOpen}
      maxWidth="xl"
      className="border-b border-line border-t-2 border-t-gold/70 bg-bg"
      classNames={{ wrapper: 'px-4 sm:px-6' }}
    >
      <NavbarContent>
        <NavbarMenuToggle className="text-ink-muted sm:hidden" />
        <NavbarBrand>
          <Link href="/" className="flex items-center gap-2 text-ink">
            <Image
              src="/icons/hero-nexus-logo-no-bg.png"
              alt=""
              width={32}
              height={32}
              className="h-8 w-8"
            />
            <span className="font-display-alt text-base font-semibold tracking-wide">
              Hero Nexus
            </span>
          </Link>
        </NavbarBrand>
      </NavbarContent>

      <NavbarContent className="hidden gap-6 sm:flex" justify="center">
        {links.map(item => {
          const isActive = pathname === item.href;
          return (
            <NavbarItem key={item.name}>
              <Link
                href={item.href}
                className={`text-sm font-medium transition-colors ${
                  isActive ? 'text-ink' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {item.name}
              </Link>
            </NavbarItem>
          );
        })}
      </NavbarContent>

      <NavbarContent justify="end">
        <NavbarItem>
          <ThemeToggle />
        </NavbarItem>
        {currentUser ? (
          <Dropdown placement="bottom-end">
            <DropdownTrigger>
              <User
                as="button"
                avatarProps={{
                  size: 'sm',
                  src: currentUser.image || undefined,
                  name:
                    currentUser.name ||
                    currentUser.email?.split('@')[0] ||
                    'User',
                }}
                className="transition-opacity hover:opacity-80"
                name={
                  currentUser.name || currentUser.email?.split('@')[0] || 'User'
                }
              />
            </DropdownTrigger>
            <DropdownMenu aria-label="Account">
              <DropdownItem key="dashboard" href="/dashboard">
                Dashboard
              </DropdownItem>
              <DropdownItem key="profile" href="/account/profile">
                Profile
              </DropdownItem>
              <DropdownItem key="settings" href="/account/settings">
                Settings
              </DropdownItem>
              <DropdownItem
                key="logout"
                color="danger"
                onPress={() => logout()}
              >
                Sign out
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        ) : (
          <NavbarItem>
            <Button
              as={Link}
              href="/login"
              size="sm"
              color="primary"
              variant="flat"
            >
              Sign in
            </Button>
          </NavbarItem>
        )}
      </NavbarContent>

      <NavbarMenu className="bg-bg pt-6">
        {links.map(item => (
          <NavbarMenuItem key={item.name}>
            <Link
              href={item.href}
              className="w-full text-ink"
              onPress={() => setIsMenuOpen(false)}
            >
              {item.name}
            </Link>
          </NavbarMenuItem>
        ))}
        {!currentUser && (
          <NavbarMenuItem>
            <Link href="/login" className="w-full text-ink">
              Sign in
            </Link>
          </NavbarMenuItem>
        )}
      </NavbarMenu>
    </Navbar>
  );
};
