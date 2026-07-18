"use client";
import React, { useState } from 'react';
import { Loader2, FileCheck } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { SelectField } from '@/components/forms/SelectField';
import { InputField } from '@/components/forms/InputField';
import { cn } from '@/lib/utils';
import { DriverDocumentUploadField } from './DriverDocumentUploadField';
import {
  driverInfoBannerClassName,
  driverPrimaryButtonClassName,
  driverSecondaryButtonClassName,
  driverSectionCardClassName,
  driverSectionTitleClassName,
} from './driverOnboardingStyles';

export type Step4Files = {
  workEligibility: File;
  driversAbstract?: File;
  licenseClass?: string;
  licenseNumber?: string;
  licenseFront?: File;
  licenseBack?: File;
};

interface Step4ComplianceProps {
  onNext: (files: Step4Files) => void;
  onBack: () => void;
  initialFiles?: Partial<Step4Files>;
  loading?: boolean;
  driverType?: 'chauffeur' | 'livreur' | 'les_deux';
  vehicleType?: 'velo' | 'scooter' | 'moto' | 'voiture';
}

export default function Step4Compliance({
  onNext,
  onBack,
  initialFiles,
  loading = false,
  driverType = 'chauffeur',
  vehicleType = 'voiture',
}: Step4ComplianceProps) {
  const { showError, showWarning } = useToast();
  const isVelo = driverType === 'livreur' && vehicleType === 'velo';

  const [files, setFiles] = useState<{
    workEligibility: File | null;
    driversAbstract: File | null;
    licenseClass: string;
    licenseNumber: string;
    licenseFront: File | null;
    licenseBack: File | null;
  }>({
    workEligibility: initialFiles?.workEligibility || null,
    driversAbstract: initialFiles?.driversAbstract || null,
    licenseClass: initialFiles?.licenseClass || '',
    licenseNumber: initialFiles?.licenseNumber || '',
    licenseFront: initialFiles?.licenseFront || null,
    licenseBack: initialFiles?.licenseBack || null,
  });

  const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, key: keyof typeof files) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      showWarning('Format non supporté. Utilisez JPEG, PNG, WebP ou PDF.');
      e.target.value = '';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showError('Fichier trop lourd (Max 10Mo)');
      return;
    }

    setFiles((prev) => ({ ...prev, [key]: file }));
  };

  const removeFile = (key: keyof typeof files) => {
    setFiles((prev) => ({ ...prev, [key]: null }));
    const fileInput = document.getElementById(`file-${key}`) as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!files.workEligibility) {
      showError("Le document d'admissibilité au travail est obligatoire.");
      return;
    }

    if (!isVelo) {
      if (!files.licenseNumber || files.licenseNumber.trim().length < 4) {
        showError("Le numéro de votre permis de conduire est requis.");
        return;
      }
      if (!files.driversAbstract) {
        showError("Le dossier de conduite (Driver's Abstract) est obligatoire.");
        return;
      }
      if (!files.licenseClass) {
        showError('La classe de votre permis de conduire est requise.');
        return;
      }
      if (!files.licenseFront || !files.licenseBack) {
        showError('Les photos recto/verso de votre permis de conduire sont obligatoires.');
        return;
      }
    }

    onNext({
      workEligibility: files.workEligibility,
      driversAbstract: isVelo ? undefined : files.driversAbstract || undefined,
      licenseClass: isVelo ? undefined : files.licenseClass || undefined,
      licenseNumber: isVelo ? undefined : files.licenseNumber || undefined,
      licenseFront: isVelo ? undefined : files.licenseFront || undefined,
      licenseBack: isVelo ? undefined : files.licenseBack || undefined,
    });
  };

  const renderFileInput = (label: string, key: keyof typeof files, accept = 'image/*,application/pdf') => (
    <DriverDocumentUploadField
      label={label}
      inputId={`file-${key}`}
      accept={accept}
      file={files[key] instanceof File ? files[key] : null}
      onChange={(e) => handleFileChange(e, key)}
      helperText="Assurez-vous que le texte soit lisible et sans reflet."
      onRemove={() => removeFile(key)}
    />
  );

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white">Conformité Légale</h2>
        <p className="text-[#9CA3AF] mt-2">Vos documents d'identité pour validation de votre profil.</p>
        <div className={cn(driverInfoBannerClassName, 'bg-[#f29200]/10 border-[#f29200]/20 text-slate-200 text-sm mt-4 font-medium flex items-center justify-center')}>
          <FileCheck className="mr-2" size={18} />
          Vérifiez la lisibilité de vos documents avant d'envoyer.
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Admissibilité au travail */}
        <div className={driverSectionCardClassName}>
          <h3 className={driverSectionTitleClassName}>
            Preuve d'admissibilité au travail
          </h3>
          <p className="text-xs text-[#9CA3AF]">
            Veuillez téléverser un document prouvant votre droit de travailler (Passeport, Certificat de naissance, Résidence
            permanente ou Permis de travail).
          </p>
          <div className="grid grid-cols-1 gap-4">
            {renderFileInput('Preuve d\'admissibilité', 'workEligibility')}
          </div>
        </div>

        {/* Section 2: Conduite & Permis (masqué pour les livreurs vélo) */}
        {!isVelo && (
          <>
            <div className={driverSectionCardClassName}>
              <h3 className={driverSectionTitleClassName}>Classe de Permis & Conduite</h3>
              <div className="grid grid-cols-1 gap-4">
                 <InputField
                  label="Numéro de permis de conduire"
                  value={files.licenseNumber}
                  onChange={(e) => setFiles((prev) => ({ ...prev, licenseNumber: e.target.value }))}
                  placeholder="Ex: A-1234-567890-12"
                  required
                />
                <SelectField
                  label="Classe du permis de conduire"
                  value={files.licenseClass}
                  onChange={(e) => setFiles((prev) => ({ ...prev, licenseClass: e.target.value }))}
                  options={[
                    { value: '', label: 'Sélectionnez la classe de votre permis' },
                    { value: 'Classe 4', label: 'Classe 4 (Commercial / Rideshare)' },
                    { value: 'Classe 1', label: 'Classe 1 (Professionnel / Poids lourd)' },
                    { value: 'Classe 2', label: 'Classe 2 (Autobus)' },
                    { value: 'Classe 3', label: 'Classe 3 (Camion lourd)' },
                    { value: 'Classe 5', label: 'Classe 5 (Standard / Véhicule léger)' },
                    { value: 'Autre', label: 'Autre / Équivalent' },
                  ]}
                  required
                />
                <div className="mt-4">
                  <h4 className="text-sm font-semibold text-white mb-2">Dossier de conduite récent (Driver's Abstract)</h4>
                  <p className="text-xs text-[#9CA3AF] mb-3">
                    Téléversez l'extrait officiel de votre dossier de conduite de moins de 30 jours.
                  </p>
                  {renderFileInput('Dossier de conduite', 'driversAbstract')}
                </div>
              </div>
            </div>

            <div className={driverSectionCardClassName}>
              <h3 className={driverSectionTitleClassName}>Permis de Conduire (Photos)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderFileInput('Recto', 'licenseFront')}
                {renderFileInput('Verso', 'licenseBack')}
              </div>
            </div>
          </>
        )}

        <div className="flex gap-4 pt-4">
          <button
            type="button"
            onClick={onBack}
            disabled={loading}
            className={cn(driverSecondaryButtonClassName, 'flex-[1]')}
          >
            Retour
          </button>
          <button
            type="submit"
            disabled={loading}
            className={cn(driverPrimaryButtonClassName, 'flex-[2]')}
          >
            {loading ? <Loader2 className="animate-spin mr-2" /> : null} Valider les documents
          </button>
        </div>
      </form>
    </div>
  );
}
