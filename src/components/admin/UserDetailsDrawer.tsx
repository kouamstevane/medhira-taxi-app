'use client';

/* eslint-disable @next/next/no-img-element */

import type { DriverPrivate } from '@/types/firestore-collections';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import type { GroupedAdminUser } from '@/app/admin/users/adminUsersUi';

export interface AdminUserDriverProfile {
  phone?: string;
  licenseNumber?: string;
  city?: string;
  zipCode?: string;
  status?: string;
  driverType?: 'chauffeur' | 'livreur' | 'les_deux';
  car?: {
    brand?: string;
    model?: string;
    plate?: string;
    color?: string;
  };
}

export interface AdminUserRestaurantProfile {
  name?: string;
  description?: string;
  address?: string;
  phone?: string;
  email?: string;
  status?: string;
  cuisineType?: string[];
  imageUrl?: string;
  logoUrl?: string;
  coverImageUrl?: string;
}

export interface UserDetailsDrawerProps {
  user: GroupedAdminUser;
  driverProfile?: AdminUserDriverProfile | null;
  driverPrivate?: DriverPrivate | null;
  restaurantProfile?: AdminUserRestaurantProfile | null;
  onClose: () => void;
}

const roleLabels = {
  client: 'Client',
  driver: 'Chauffeur',
  restaurant: 'Restaurateur',
} as const;

const documentDefinitions = [
  { label: 'Photo biométrique', key: 'biometricPhoto', isProfile: true },
  { label: 'Admissibilité au travail', key: 'workEligibility', isProfile: false },
  { label: 'Dossier de conduite', key: 'driversAbstract', isProfile: false },
  { label: 'Permis (recto)', key: 'licenseFront', isProfile: false },
  { label: 'Permis (verso)', key: 'licenseBack', isProfile: false },
  { label: 'Carte grise', key: 'carRegistration', isProfile: false },
  { label: 'Assurance', key: 'insurance', isProfile: false },
  { label: 'Contrôle technique', key: 'techControl', isProfile: false },
  { label: 'Véhicule extérieur', key: 'vehicleExterior', isProfile: false },
] as const;

function formatDate(value: unknown): string {
  let date: Date | null = null;
  if (value instanceof Date) date = value;
  else if (typeof value === 'string' || typeof value === 'number') date = new Date(value);
  else if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') date = value.toDate();

  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Non renseignée';
}

function getDocumentUrl(value: unknown): string | undefined {
  if (typeof value === 'string') return value || undefined;
  if (value && typeof value === 'object' && 'url' in value && typeof value.url === 'string') return value.url || undefined;
  return undefined;
}

function DetailField({ label, value, className = '' }: { label: string; value?: string | null; className?: string }) {
  return (
    <div className={className}>
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <p className="break-words text-sm font-medium leading-5 text-slate-200">{value || 'Non renseigné'}</p>
    </div>
  );
}

export function UserDetailsDrawer({ user, driverProfile, driverPrivate, restaurantProfile, onClose }: UserDetailsDrawerProps) {
  const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Utilisateur';
  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || 'U';
  const profileImage = user.profileImageUrl || user.profileImage || user.photoURL;
  const documents = documentDefinitions.flatMap((document) => {
    const sourceKeys = document.key === 'licenseFront' ? ['licenseFront', 'licensePhoto'] : [document.key];
    const src = sourceKeys.map((key) => getDocumentUrl(driverPrivate?.documents?.[key])).find(Boolean);
    return src ? [{ ...document, src }] : [];
  });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-end" role="dialog" aria-modal="true" aria-labelledby="user-details-title">
      <button type="button" className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm" onClick={onClose} aria-label="Fermer les détails de l’utilisateur" />
      <aside className="relative flex h-full w-full max-w-2xl flex-col overflow-hidden border-l border-white/10 bg-[#0d0d0d] pb-20">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/5 bg-[#0d0d0d]/95 p-4 backdrop-blur-xl sm:p-6">
          <div className="flex min-w-0 items-center gap-3">
            {profileImage ? (
              <img src={profileImage} alt={`Photo de ${fullName}`} className="h-12 w-12 shrink-0 rounded-xl object-cover ring-1 ring-primary/30" />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-black text-primary ring-1 ring-primary/20">{initials}</div>
            )}
            <div className="min-w-0">
              <h2 id="user-details-title" className="truncate text-lg font-bold text-white sm:text-xl">{fullName}</h2>
              <div className="flex flex-wrap items-center gap-1.5">
                {user.roles.map((role) => <span key={role} className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-300">{roleLabels[role]}</span>)}
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer les détails de l’utilisateur" className="shrink-0 rounded-xl border border-white/10 bg-white/5 p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white">
            <MaterialIcon name="cancel" size="lg" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mb-6 grid grid-cols-3 divide-x divide-white/10 rounded-xl border border-white/10 bg-white/[0.025] py-3">
            <div className="px-3 sm:px-4"><span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">Rôles</span><span className="mt-1 block truncate text-xs font-semibold text-slate-200">{user.roles.length}</span></div>
            <div className="px-3 sm:px-4"><span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">Rôle actif</span><span className="mt-1 block truncate text-xs font-semibold text-slate-200">{user.activeRole ? roleLabels[user.activeRole] : 'Non renseigné'}</span></div>
            <div className="px-3 sm:px-4"><span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">Compte créé</span><span className="mt-1 block truncate text-xs font-semibold text-slate-200">{formatDate(user.createdAt)}</span></div>
          </div>

          <div className="space-y-8">
            <section aria-labelledby="user-personal-information-title">
              <div className="mb-3 flex items-center gap-2.5"><div className="rounded-lg bg-primary/10 p-1.5 text-primary"><MaterialIcon name="person" size="sm" /></div><h3 id="user-personal-information-title" className="text-base font-bold text-white">Informations personnelles</h3></div>
              <div className="grid grid-cols-2 gap-x-5 gap-y-4 rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <DetailField label="Prénom" value={user.firstName} />
                <DetailField label="Nom" value={user.lastName} />
                <DetailField label="Email" value={user.email} />
                <DetailField label="Téléphone" value={user.phoneNumber} />
                <DetailField label="Email vérifié" value={user.emailVerified === undefined ? undefined : user.emailVerified ? 'Oui' : 'Non'} />
                <DetailField label="Pays" value={user.country} />
                <DetailField label="Ville" value={user.city} />
                <DetailField label="Adresse" value={user.address} />
                <DetailField label="Bio" value={user.bio} className="col-span-2" />
              </div>
            </section>

            <section aria-labelledby="user-access-information-title">
              <div className="mb-3 flex items-center gap-2.5"><div className="rounded-lg bg-primary/10 p-1.5 text-primary"><MaterialIcon name="verified_user" size="sm" /></div><h3 id="user-access-information-title" className="text-base font-bold text-white">Accès et rôles</h3></div>
              <div className="grid grid-cols-2 gap-x-5 gap-y-4 rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <DetailField label="Identifiant utilisateur" value={user.id} className="col-span-2" />
                <DetailField label="État du compte" value={user.accountState} />
                <DetailField label="Dernier rôle actif" value={user.lastActiveRole ? roleLabels[user.lastActiveRole] : undefined} />
                {user.roles.map((role) => {
                  const details = user.roleDetails[role];
                  const value = role === 'restaurant' ? details?.restaurantId : role === 'driver' ? formatDate(details?.joinedAt) : details?.enabled === false ? 'Inactif' : 'Actif';
                  return <DetailField key={role} label={role === 'restaurant' ? 'Restaurant associé' : role === 'driver' ? 'Activation chauffeur' : 'Compte client'} value={value} />;
                })}
              </div>
            </section>

            {driverProfile && (
              <section aria-labelledby="user-driver-information-title">
                <div className="mb-3 flex items-center gap-2.5"><div className="rounded-lg bg-primary/10 p-1.5 text-primary"><MaterialIcon name="directions_car" size="sm" /></div><h3 id="user-driver-information-title" className="text-base font-bold text-white">Profil chauffeur</h3></div>
                <div className="grid grid-cols-2 gap-x-5 gap-y-4 rounded-xl border border-white/5 bg-white/[0.02] p-4">
                  <DetailField label="Type" value={driverProfile.driverType === 'les_deux' ? 'Chauffeur / Livreur' : driverProfile.driverType === 'livreur' ? 'Livreur' : 'Chauffeur'} />
                  <DetailField label="Statut" value={driverProfile.status} />
                  <DetailField label="Permis" value={driverProfile.licenseNumber} />
                  <DetailField label="Téléphone chauffeur" value={driverProfile.phone} />
                  <DetailField label="Ville" value={driverProfile.city} />
                  <DetailField label="Code postal" value={driverProfile.zipCode} />
                  <DetailField label="Véhicule" value={[driverProfile.car?.brand, driverProfile.car?.model].filter(Boolean).join(' ')} />
                  <DetailField label="Plaque / couleur" value={[driverProfile.car?.plate, driverProfile.car?.color].filter(Boolean).join(' · ')} />
                </div>
              </section>
            )}

            {restaurantProfile && (
              <section aria-labelledby="user-restaurant-information-title">
                <div className="mb-3 flex items-center gap-2.5"><div className="rounded-lg bg-primary/10 p-1.5 text-primary"><MaterialIcon name="restaurant" size="sm" /></div><h3 id="user-restaurant-information-title" className="text-base font-bold text-white">Profil restaurant</h3></div>
                <div className="grid grid-cols-2 gap-x-5 gap-y-4 rounded-xl border border-white/5 bg-white/[0.02] p-4">
                  <DetailField label="Nom" value={restaurantProfile.name} className="col-span-2" />
                  <DetailField label="Statut" value={restaurantProfile.status} />
                  <DetailField label="Téléphone" value={restaurantProfile.phone} />
                  <DetailField label="Email restaurant" value={restaurantProfile.email} />
                  <DetailField label="Adresse" value={restaurantProfile.address} />
                  <DetailField label="Cuisine" value={restaurantProfile.cuisineType?.join(', ')} className="col-span-2" />
                  <DetailField label="Description" value={restaurantProfile.description} className="col-span-2" />
                </div>
              </section>
            )}

            <section aria-labelledby="user-media-title">
              <div className="mb-3 flex items-center gap-2.5"><div className="rounded-lg bg-primary/10 p-1.5 text-primary"><MaterialIcon name="photo_library" size="sm" /></div><div><h3 id="user-media-title" className="text-base font-bold text-white">Photos et documents</h3><p className="mt-0.5 text-xs text-slate-500">Cliquez sur une image pour l’ouvrir en grand.</p></div></div>
              {(profileImage || restaurantProfile?.logoUrl || restaurantProfile?.coverImageUrl || restaurantProfile?.imageUrl || documents.length > 0) ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
                  {profileImage && <a href={profileImage} target="_blank" rel="noopener noreferrer" className="group"><span className="mb-1.5 block truncate text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Photo de profil</span><div className="h-32 overflow-hidden rounded-xl border border-white/10 bg-white/[0.045]"><img src={profileImage} alt={`Photo de profil de ${fullName}`} className="h-full w-full object-cover transition-transform group-hover:scale-105" /></div></a>}
                  {restaurantProfile?.logoUrl && <a href={restaurantProfile.logoUrl} target="_blank" rel="noopener noreferrer" className="group"><span className="mb-1.5 block truncate text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Logo restaurant</span><div className="h-32 overflow-hidden rounded-xl border border-white/10 bg-white/[0.045]"><img src={restaurantProfile.logoUrl} alt={`Logo de ${restaurantProfile.name || 'restaurant'}`} className="h-full w-full object-contain p-2 transition-transform group-hover:scale-105" /></div></a>}
                  {restaurantProfile?.coverImageUrl && <a href={restaurantProfile.coverImageUrl} target="_blank" rel="noopener noreferrer" className="group"><span className="mb-1.5 block truncate text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Couverture restaurant</span><div className="h-32 overflow-hidden rounded-xl border border-white/10 bg-white/[0.045]"><img src={restaurantProfile.coverImageUrl} alt={`Couverture de ${restaurantProfile.name || 'restaurant'}`} className="h-full w-full object-cover transition-transform group-hover:scale-105" /></div></a>}
                  {restaurantProfile?.imageUrl && <a href={restaurantProfile.imageUrl} target="_blank" rel="noopener noreferrer" className="group"><span className="mb-1.5 block truncate text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Image restaurant</span><div className="h-32 overflow-hidden rounded-xl border border-white/10 bg-white/[0.045]"><img src={restaurantProfile.imageUrl} alt={`Image de ${restaurantProfile.name || 'restaurant'}`} className="h-full w-full object-cover transition-transform group-hover:scale-105" /></div></a>}
                  {documents.map((document) => <a key={document.key} href={document.src} target="_blank" rel="noopener noreferrer" className="group"><span className="mb-1.5 block truncate text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{document.label}</span><div className="h-32 overflow-hidden rounded-xl border border-white/10 bg-white/[0.045]"><img src={document.src} alt={document.label} className={document.isProfile ? 'h-full w-full object-cover transition-transform group-hover:scale-105' : 'h-full w-full object-contain p-1 transition-transform group-hover:scale-[1.03]'} /></div></a>)}
                </div>
              ) : <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center"><p className="text-sm text-slate-500">Aucune photo ou document disponible.</p></div>}
            </section>
          </div>
        </div>

        <footer className="shrink-0 border-t border-white/10 bg-[#0d0d0d]/95 p-3 backdrop-blur-xl sm:p-4"><button type="button" onClick={onClose} className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-bold text-slate-200 transition-colors hover:bg-white/10">Fermer la fiche</button></footer>
      </aside>
    </div>
  );
}
