'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  { href: '/wallet/historique', icon: 'account_balance_wallet', label: 'Wallet' },
  { href: '/profil', icon: 'person', label: 'Profil' },
];

export const driverNavItems: NavItem[] = [
  { href: '/driver/dashboard', icon: 'home', label: 'Accueil' },
  { href: '/driver/historique', icon: 'history', label: 'Historique' },
  { href: '/driver/gains', icon: 'payments', label: 'Gains' },
  { href: '/driver/profile', icon: 'person', label: 'Profil' },
];

export const portalNavItems = (restaurantId: string): NavItem[] => [
  { href: `/food/portal/${restaurantId}`, icon: 'dashboard', label: 'Dashboard' },
  { href: `/food/portal/${restaurantId}/orders`, icon: 'receipt_long', label: 'Commandes' },
  { href: `/food/portal/${restaurantId}/menu`, icon: 'menu_book', label: 'Menu' },
];

export const adminNavItems: NavItem[] = [
  { href: '/admin/users', icon: 'people', label: 'Utilisateurs' },
  { href: '/admin/drivers', icon: 'drive_eta', label: 'Chauffeurs' },
  { href: '/admin/restaurants', icon: 'restaurant', label: 'Restaurants' },
];

export function BottomNav({ items = defaultUserItems, className }: BottomNavProps) {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50',
        'bg-[#0D0D0D] backdrop-blur-xl border-t border-white/5',
        'px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3',
        className
      )}
    >
      <div className="flex items-center justify-between max-w-lg mx-auto">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-1 min-w-[60px] transition-colors',
                isActive ? 'text-primary' : 'text-slate-400'
              )}
            >
              <MaterialIcon
                name={item.icon}
                filled={isActive}
                className="text-[28px]"
              />
              <span
                className={cn(
                  'text-[11px] tracking-wide',
                  isActive ? 'font-bold' : 'font-medium'
                )}
              >
                {item.label}
              </span>
              {isActive && (
                <div className="w-1 h-1 bg-primary rounded-full" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
