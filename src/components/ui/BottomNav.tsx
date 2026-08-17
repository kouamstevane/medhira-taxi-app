'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getRestaurantPortalPath } from '@/app/food/portal/restaurant-portal-paths';
import { MaterialIcon } from './MaterialIcon';
import { cn } from '@/lib/utils';

interface NavItem {
  readonly href: string;
  readonly icon: string;
  readonly label: string;
}

interface BottomNavProps {
  readonly items?: readonly NavItem[];
  readonly className?: string;
}

const defaultUserItems: NavItem[] = [
  { href: '/dashboard', icon: 'home', label: 'Accueil' },
  { href: '/historique', icon: 'history', label: 'Historique' },
  { href: '/wallet', icon: 'account_balance_wallet', label: 'Wallet' },
  { href: '/profil', icon: 'person', label: 'Profil' },
];

export const driverNavItems: NavItem[] = [
  { href: '/driver/dashboard',  icon: 'home',        label: 'Accueil'    },
  { href: '/driver/activite',   icon: 'bar_chart',   label: 'Activité'   },
  { href: '/driver/documents',  icon: 'folder_open', label: 'Documents'  },
  { href: '/driver/profile',    icon: 'person',      label: 'Profil'     },
];

export const portalNavItems = (restaurantId: string): NavItem[] => [
  { href: getRestaurantPortalPath(restaurantId), icon: 'dashboard', label: 'Dashboard' },
  { href: getRestaurantPortalPath(restaurantId, 'orders'), icon: 'receipt_long', label: 'Commandes' },
  { href: getRestaurantPortalPath(restaurantId, 'menu'), icon: 'menu_book', label: 'Menu' },
  { href: getRestaurantPortalPath(restaurantId, 'settings'), icon: 'settings', label: 'Paramètres' },
];

export const adminNavItems: NavItem[] = [
  { href: '/admin/users', icon: 'people', label: 'Utilisateurs' },
  { href: '/admin/drivers', icon: 'drive_eta', label: 'Chauffeurs' },
  { href: '/admin/restaurants', icon: 'restaurant', label: 'Restaurants' },
];

export function BottomNav({ items = defaultUserItems, className }: BottomNavProps) {
  const pathname = usePathname();
  const activeItemPath = items
    .map((item) => item.href.split('?')[0])
    .filter((itemPath) => pathname === itemPath || pathname.startsWith(itemPath + '/'))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <>
      <nav
        className={cn(
          'fixed bottom-0 left-0 right-0 z-50',
          'pointer-events-none',
          'bg-[#0D0D0D]/96 backdrop-blur-xl border-t border-white/5 shadow-[0_-10px_30px_rgba(0,0,0,0.28)]',
          'px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2',
          className
        )}
      >
        <div className="mx-auto flex max-w-md items-center justify-between">
          {items.map((item) => {
            const itemPath = item.href.split('?')[0];
            const isActive = itemPath === activeItemPath;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'pointer-events-auto flex min-w-[52px] flex-col items-center gap-0.5 transition-colors',
                  isActive ? 'text-primary' : 'text-slate-400'
                )}
              >
                <MaterialIcon
                  name={item.icon}
                  filled={false}
                  className="text-[24px]"
                />
                <span
                  className={cn(
                    'text-[10px] leading-none tracking-wide',
                    isActive ? 'font-bold' : 'font-medium'
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
      <div aria-hidden="true" className="h-20" data-testid="bottom-nav-spacer" />
    </>
  );
}
