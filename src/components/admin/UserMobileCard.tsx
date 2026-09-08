'use client';

import React from 'react';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import type { AdminManageableRole } from '@/app/admin/users/adminUsersUi';

export interface UserMobileCardUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  roles: Array<'client' | 'driver' | 'restaurant'>;
  roleUserIds: Partial<Record<'client' | 'driver' | 'restaurant', string>>;
}

export interface UserMobileCardProps {
  user: UserMobileCardUser;
  isProcessing: boolean;
  isDisabled: boolean;
  onRemoveRole: (userId: string, role: AdminManageableRole) => void;
  onSelect: () => void;
}

const roleMetadata = {
  restaurant: {
    label: 'Restaurateur',
    icon: 'restaurant',
    className: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  },
  driver: {
    label: 'Chauffeur',
    icon: 'directions_car',
    className: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  },
  client: {
    label: 'Client',
    icon: 'person',
    className: 'bg-white/5 text-slate-400 border-white/10',
  },
} as const;

export function UserMobileCard({
  user,
  isProcessing,
  isDisabled,
  onRemoveRole,
  onSelect,
}: UserMobileCardProps) {
  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || 'U';
  const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Utilisateur';
  const hasRestaurantRole = user.roles.includes('restaurant');
  const manageableRoles = user.roles.filter(
    (role): role is AdminManageableRole => role === 'restaurant' || role === 'driver',
  );

  return (
    <article className="rounded-xl bg-white/[0.025] px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-xs font-bold text-primary">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-white">{fullName}</h3>
          <p className="truncate text-[11px] text-slate-400">{user.email}</p>
          {user.phoneNumber && <p className="truncate text-[10px] text-slate-500">{user.phoneNumber}</p>}
        </div>
        <div className="flex max-w-[58%] shrink-0 flex-wrap justify-end gap-1">
          {user.roles.map((role) => {
            const metadata = roleMetadata[role];
            return (
              <span key={role} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${metadata.className}`}>
                <MaterialIcon name={metadata.icon} size="sm" />
                {metadata.label}
              </span>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={onSelect}
        className="mt-2 flex min-h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-white/[0.04] px-2 py-1.5 text-[11px] font-semibold text-slate-300 transition-colors hover:bg-white/[0.08]"
      >
        <MaterialIcon name="chevron_right" size="sm" />
        Ouvrir la fiche complète
      </button>

      <div className="mt-2.5 flex flex-wrap gap-2">
        {hasRestaurantRole && (
          <a
            href="/admin/restaurants/"
            className="flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/5 px-2 py-1.5 text-[11px] font-bold text-slate-300 transition-all hover:bg-white/10"
          >
            <MaterialIcon name="store" size="sm" />
            Gérer dans Restaurants
          </a>
        )}
        {manageableRoles.map((role) => {
          const roleUserId = user.roleUserIds[role] ?? user.id;
          const roleLabel = role === 'restaurant' ? 'restaurateur' : 'chauffeur';
          return (
            <button
              key={role}
              type="button"
              onClick={() => onRemoveRole(roleUserId, role)}
              disabled={isDisabled}
              className="flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-destructive/20 bg-destructive/10 px-2 py-1.5 text-[11px] font-bold text-destructive transition-all hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <MaterialIcon name="person_remove" size="sm" />
              {isProcessing ? 'Mise à jour…' : `Retirer accès ${roleLabel}`}
            </button>
          );
        })}
      </div>
    </article>
  );
}
