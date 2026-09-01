'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/@auth/context';
import {
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
  NavbarMenuToggle,
  NavbarMenuItem,
  Button,
  Link,
  User,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from '@heroui/react';
import { useState } from 'react';
import { NAV_ITEMS } from '@/@auth/types/constants';
import Image from 'next/image';

export const Navigation = () => {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Safely use auth context with fallback
  let currentUser = null;
  let logout = async () => {};

  try {
    const auth = useAuth();
    currentUser = auth.currentUser;
    logout = auth.logout;
  } catch {
    // Auth context not available (e.g., during SSR)
    console.log('Auth context not available');
  }

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Failed to log out:', error);
    }
  };

  return (
    <Navbar
      onMenuOpenChange={setIsMenuOpen}
      className="bg-gradient-to-r from-amber-900 via-orange-800 to-amber-900 border-b-4 border-amber-600 shadow-2xl"
      maxWidth="full"
    >
      <NavbarContent>
        <NavbarMenuToggle
          aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
          className="sm:hidden text-amber-100"
        />
        <NavbarBrand>
          <Link href="/" className="flex items-center space-x-3">
            <div className="relative">
              <Image
                src="/icons/hero-nexus-logo-no-bg.png"
                alt="Hero Nexus Logo"
                width={100}
                height={100}
              />
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-red-600 rounded-full border-2 border-amber-900 animate-pulse"></div>
            </div>
            <div>
              <p className="text-2xl font-bold bg-gradient-to-r from-yellow-300 to-orange-300 bg-clip-text text-transparent">
                Hero Nexus
              </p>
            </div>
          </Link>
        </NavbarBrand>
      </NavbarContent>

      <NavbarContent className="hidden sm:flex gap-4" justify="center">
        {NAV_ITEMS.map(item => {
          const isActive = pathname === item.href;
          return (
            <NavbarItem key={item.name} isActive={isActive}>
              <Link
                href={item.href}
                className={`${
                  isActive
                    ? 'text-amber-100 underline decoration-yellow-300 decoration-2 underline-offset-4'
                    : 'text-amber-100 hover:text-yellow-300'
                } font-semibold transition-colors duration-300`}
              >
                {item.name}
              </Link>
            </NavbarItem>
          );
        })}
      </NavbarContent>

      <NavbarContent justify="end">
        {currentUser ? (
          <Dropdown
            placement="bottom-end"
            className="bg-slate-900 border-amber-600 border-2 rounded-lg text-amber-100"
          >
            <DropdownTrigger>
              <User
                as="button"
                avatarProps={{
                  isBordered: true,
                  className: 'w-10 h-10',
                  src: currentUser.image || undefined,
                  name:
                    currentUser.name ||
                    currentUser.email?.split('@')[0] ||
                    'User',
                }}
                className="transition-transform cursor-pointer hover:scale-105"
                description={currentUser.email}
                name={
                  currentUser.name || currentUser.email?.split('@')[0] || 'User'
                }
              />
            </DropdownTrigger>
            <DropdownMenu aria-label="User actions">
              <DropdownItem key="profile" as={Link} href="/account/profile">
                Profile
              </DropdownItem>
              <DropdownItem key="settings" as={Link} href="/account/settings">
                Settings
              </DropdownItem>
              <DropdownItem key="logout" color="danger" onClick={handleLogout}>
                Log Out
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        ) : (
          <>
            <NavbarMenuItem>
              <Button
                as={Link}
                href="/login"
                color="primary"
                variant="flat"
                className="w-full"
                onPress={() => setIsMenuOpen(false)}
              >
                🔐 Login
              </Button>
            </NavbarMenuItem>
          </>
        )}
      </NavbarContent>
    </Navbar>
  );
};
