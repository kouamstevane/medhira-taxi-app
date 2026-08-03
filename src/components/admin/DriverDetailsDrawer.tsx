import type { ReactNode } from 'react';
import Image from 'next/image';
import type { DriverPrivate } from '@/types/firestore-collections';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import type { Driver } from '@/app/admin/drivers/page';

interface DetailFieldProps {
  label: string;
  value?: string | null;
  className?: string;
}

interface DocumentThumbnailProps {
  label: string;
  src: string;
  isProfile?: boolean;
}

export interface DriverDetailsDrawerProps {
  driver: Driver;
  privateData: DriverPrivate | null;
  rejectionReason: string;
  processing: boolean;
  onClose: () => void;
  onRejectionReasonChange: (value: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onSuspend: () => void;
  onUnsuspend: () => void;
  onDelete: () => void;
  getStatusBadge: (status: Driver['status']) => ReactNode;
}

const documentDefinitions = [
  { label: 'Photo de profil', key: 'biometricPhoto', isProfile: true },
  { label: 'Admissibilité au travail', key: 'workEligibility', isProfile: false },
  { label: 'Dossier de conduite', key: 'driversAbstract', isProfile: false },
  { label: 'Permis (Recto)', key: 'licenseFront', isProfile: false },
  { label: 'Permis (Verso)', key: 'licenseBack', isProfile: false },
  { label: 'Carte grise', key: 'carRegistration', isProfile: false },
  { label: 'Assurance', key: 'insurance', isProfile: false },
  { label: 'Contrôle Technique', key: 'techControl', isProfile: false },
  { label: 'Véhicule (Extérieur)', key: 'vehicleExterior', isProfile: false },
] as const;

function DetailField({ label, value, className = '' }: DetailFieldProps) {
  return (
    <div className={className}>
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</span>
      <p className="break-words text-sm font-medium leading-5 text-slate-200">{value || 'N/A'}</p>
    </div>
  );
}

function DocumentThumbnail({ label, src, isProfile = false }: DocumentThumbnailProps) {
  return (
    <div className="group min-w-0">
      <span className="mb-1.5 block truncate text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <div className="relative h-24 overflow-hidden rounded-xl border border-white/10 bg-white/[0.045] ring-1 ring-white/5 transition-all duration-300 group-hover:ring-primary/50 sm:h-32">
        <a href={src} target="_blank" rel="noopener noreferrer" className="block h-full w-full" aria-label={`${label} Agrandir`}>
          <Image
            src={src}
            alt={label}
            fill
            sizes="(max-width: 640px) 50vw, 220px"
            className={isProfile ? 'object-cover transition-transform duration-500 group-hover:scale-105' : 'object-contain p-1 transition-transform duration-500 group-hover:scale-[1.03]'}
          />
          <span className="absolute inset-x-2 bottom-2 rounded-lg bg-black/60 px-2 py-1 text-center text-[10px] font-semibold text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
            Agrandir
          </span>
        </a>
      </div>
    </div>
  );
}

function getDocumentUrl(value: unknown): string | undefined {
  if (typeof value === 'string') return value || undefined;
  if (value && typeof value === 'object' && 'url' in value && typeof value.url === 'string') {
    return value.url || undefined;
  }
  return undefined;
}

function formatApplicationDate(value: Driver['createdAt']): string {
  let date: Date | null = null;

  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'number' || typeof value === 'string') {
    date = new Date(value);
  } else if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    date = value.toDate();
  }

  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Date inconnue';
}

export function DriverDetailsDrawer({
  driver,
  privateData,
  rejectionReason,
  processing,
  onClose,
  onRejectionReasonChange,
  onApprove,
  onReject,
  onSuspend,
  onUnsuspend,
  onDelete,
  getStatusBadge,
}: DriverDetailsDrawerProps) {
  const documents = documentDefinitions.flatMap((document) => {
    const sourceKey = document.key === 'licenseFront' ? ['licenseFront', 'licensePhoto'] : [document.key];
    const src = sourceKey.map((key) => getDocumentUrl(privateData?.documents?.[key])).find(Boolean);

    return src ? [{ ...document, src }] : [];
  });

  const profileType = driver.driverType === 'livreur'
    ? 'Livreur'
    : driver.driverType === 'les_deux'
      ? 'Chauffeur / Livreur'
      : 'Chauffeur';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end" role="dialog" aria-modal="true" aria-labelledby="driver-details-title">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} aria-hidden="true" />

      <aside className="relative flex h-full w-full max-w-2xl flex-col overflow-hidden border-l border-white/10 bg-[#0d0d0d] animate-in slide-in-from-right duration-500 motion-reduce:animate-none">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/5 bg-[#0d0d0d]/90 p-4 backdrop-blur-xl sm:p-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-primary to-[#ffae33] text-base font-black text-black shadow-[0_0_18px_rgba(242,146,0,0.25)]">
              {driver.firstName[0]}{driver.lastName[0]}
            </div>
            <div className="min-w-0">
              <h2 id="driver-details-title" className="truncate text-lg font-bold text-white sm:text-xl">{driver.firstName} {driver.lastName}</h2>
              <div className="flex min-w-0 items-center gap-2">
                {getStatusBadge(driver.status)}
                <span className="truncate text-[10px] font-mono text-slate-500">ID: {driver.id.substring(0, 8)}...</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer les détails du chauffeur"
            className="shrink-0 rounded-xl border border-white/10 bg-white/5 p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <MaterialIcon name="cancel" size="lg" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mb-6 grid grid-cols-3 divide-x divide-white/10 rounded-xl border border-white/10 bg-white/[0.025] py-3">
            <div className="px-3 sm:px-4">
              <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">Profil</span>
              <span className="mt-1 block truncate text-xs font-semibold text-slate-200">{profileType}</span>
            </div>
            <div className="px-3 sm:px-4">
              <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">Candidature</span>
              <span className="mt-1 block truncate text-xs font-semibold text-slate-200">{formatApplicationDate(driver.createdAt)}</span>
            </div>
            <div className="px-3 sm:px-4">
              <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">Documents disponibles</span>
              <span className="mt-1 block text-xs font-semibold text-slate-200">{documents.length} pièce{documents.length === 1 ? '' : 's'}</span>
            </div>
          </div>

          <div className="space-y-8 sm:space-y-10">
            <section aria-labelledby="personal-information-title">
              <div className="mb-3 flex items-center gap-2.5">
                <div className="rounded-lg bg-primary/10 p-1.5 text-primary"><MaterialIcon name="person" size="sm" /></div>
                <h3 id="personal-information-title" className="text-base font-bold text-white">Informations personnelles</h3>
              </div>
              <div className="grid grid-cols-2 gap-x-5 gap-y-4 rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <DetailField label="Prénom" value={driver.firstName} />
                <DetailField label="Nom" value={driver.lastName} />
                <DetailField label="Email" value={driver.email} className="col-span-2 sm:col-span-1" />
                <DetailField label="Téléphone" value={driver.phone || driver.phoneNumber} />
                <DetailField label="Numéro de permis" value={driver.licenseNumber || 'Non renseigné'} />
                <DetailField label="Classe de permis" value={privateData?.licenseClass || 'Non renseignée'} />
                <DetailField label="Numéro fiscal / SIRET" value={privateData?.taxId || 'Non renseigné'} />
                <DetailField label="Adresse de résidence" value={privateData?.address || 'Non renseignée'} className="col-span-2 sm:col-span-1" />
                <DetailField label="Ville" value={driver.city || 'Non renseignée'} />
                <DetailField label="Code postal" value={driver.zipCode || 'Non renseigné'} />
                <DetailField label="Province" value={privateData?.province || 'Non renseignée'} />
                <DetailField label="Pays" value={privateData?.country || 'Non renseigné'} />
              </div>
            </section>

            <section aria-labelledby="vehicle-information-title">
              <div className="mb-3 flex items-center gap-2.5">
                <div className="rounded-lg bg-primary/10 p-1.5 text-primary"><MaterialIcon name="directions_car" size="sm" /></div>
                <h3 id="vehicle-information-title" className="text-base font-bold text-white">Véhicule</h3>
              </div>
              <div className="grid grid-cols-2 gap-x-5 gap-y-4 rounded-xl border border-white/5 bg-white/[0.02] p-4 sm:grid-cols-3">
                <DetailField label="Marque / modèle" value={driver.car?.brand ? `${driver.car.brand} ${driver.car.model}` : (driver.car?.model || driver.carModel)} />
                <DetailField label="Plaque d'immatriculation" value={driver.car?.plate || driver.carPlate} />
                <DetailField label="Couleur" value={driver.car?.color || driver.carColor} />
                <DetailField label="Déclaration 4 portes VTC" value={privateData?.hasFourDoors ? 'Oui, certifié' : 'Non'} className="col-span-2 sm:col-span-1" />
              </div>
            </section>

            <section aria-labelledby="official-documents-title">
              <div className="mb-3 flex items-center gap-2.5">
                <div className="rounded-lg bg-primary/10 p-1.5 text-primary"><MaterialIcon name="description" size="sm" /></div>
                <div>
                  <h3 id="official-documents-title" className="text-base font-bold text-white">Documents officiels</h3>
                  <p className="mt-0.5 text-xs text-slate-500">Cliquez sur une pièce pour l'ouvrir en grand.</p>
                </div>
              </div>

              {documents.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
                  {documents.map((document) => (
                    <DocumentThumbnail key={document.key} label={document.label} src={document.src} isProfile={document.isProfile} />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center">
                  <p className="text-sm text-slate-500">Aucun document numérique disponible.</p>
                </div>
              )}
            </section>
          </div>
        </div>

        <footer className="shrink-0 border-t border-white/10 bg-[#0d0d0d]/95 p-3 backdrop-blur-xl sm:p-4">
          {driver.status === 'pending' ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <MaterialIcon name="verified_user" size="sm" />
                <h3 className="text-sm font-bold">Validation requise</h3>
              </div>
              <p className="text-[11px] leading-4 text-slate-400">L'approbation autorisera immédiatement ce chauffeur à accepter des courses.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={onApprove}
                  disabled={processing}
                  className="order-1 h-11 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 text-xs font-black uppercase tracking-wider text-black shadow-[0_0_18px_rgba(16,185,129,0.18)] transition-all hover:from-emerald-500 hover:to-emerald-400 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:order-2"
                >
                  {processing ? 'Traitement...' : 'Approuver le profil'}
                </button>
                <div className="order-2 flex gap-2 sm:order-1">
                  <input
                    aria-label="Motif détaillé du refus..."
                    value={rejectionReason}
                    onChange={(event) => onRejectionReasonChange(event.target.value)}
                    placeholder="Motif du refus..."
                    className="glass-input min-w-0 flex-1 rounded-xl px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                  />
                  <button
                    type="button"
                    onClick={onReject}
                    disabled={processing || !rejectionReason.trim()}
                    className="h-11 shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-300 transition-all hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-400 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                  >
                    Refuser
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {driver.isSuspended ? (
                <button type="button" onClick={onUnsuspend} className="h-11 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 text-[10px] font-bold uppercase tracking-wider text-emerald-400 transition-all hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
                  Lever la suspension
                </button>
              ) : (
                <button type="button" onClick={onSuspend} className="h-11 rounded-xl border border-orange-500/20 bg-orange-500/10 px-3 text-[10px] font-bold uppercase tracking-wider text-orange-400 transition-all hover:bg-orange-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">
                  Suspendre
                </button>
              )}
              <button type="button" onClick={onDelete} className="h-11 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 text-[10px] font-bold uppercase tracking-wider text-rose-400 transition-all hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400">
                Supprimer
              </button>
            </div>
          )}
        </footer>
      </aside>
    </div>
  );
}
