"use client";
import React, { useState, useRef, useEffect } from 'react';
import { Loader2, UploadCloud, FileCheck, X } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { SelectField } from '@/components/forms/SelectField';
import { InputField } from '@/components/forms/InputField';
import { cn } from '@/lib/utils';
import {
  driverInfoBannerClassName,
  driverPrimaryButtonClassName,
  driverSecondaryButtonClassName,
  driverSectionCardClassName,
  driverSectionTitleClassName,
  driverUploadEmptyClassName,
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

  const [previews, setPreviews] = useState<Record<string, string>>({});
  const blobUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    if (initialFiles) {
      const newPreviews: Record<string, string> = {};
      Object.entries(initialFiles).forEach(([key, file]) => {
        if (file instanceof File) {
          if (file.type.startsWith('image/')) {
            const url = URL.createObjectURL(file);
            blobUrlsRef.current.push(url);
            newPreviews[key] = url;
          } else if (file.type === 'application/pdf') {
            newPreviews[key] = 'pdf';
          }
        }
      });
      setPreviews(newPreviews);
    }
  }, [initialFiles]);

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

    if (file.type.startsWith('image/')) {
      const oldUrl = previews[key];
      if (oldUrl && oldUrl !== 'pdf') {
        URL.revokeObjectURL(oldUrl);
        blobUrlsRef.current = blobUrlsRef.current.filter((u) => u !== oldUrl);
      }
      const url = URL.createObjectURL(file);
      blobUrlsRef.current.push(url);
      setPreviews((prev) => ({ ...prev, [key]: url }));
    } else if (file.type === 'application/pdf') {
      setPreviews((prev) => ({ ...prev, [key]: 'pdf' }));
    }
  };

  const removeFile = (key: keyof typeof files) => {
    setFiles((prev) => ({ ...prev, [key]: null }));
    setPreviews((prev) => {
      const newPreviews = { ...prev };
      if (newPreviews[key] && newPreviews[key] !== 'pdf') {
        URL.revokeObjectURL(newPreviews[key]);
      }
      delete newPreviews[key];
      return newPreviews;
    });
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
    <div className="border border-white/[0.06] rounded-xl p-4 bg-[#1A1A1A] flex flex-col items-center text-center">
      <label className="block text-sm font-medium text-[#9CA3AF] mb-2 w-full text-left">
        {label} <span className="text-red-500">*</span>
      </label>

      {previews[key] ? (
        <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-[#242424] border border-white/[0.06] flex items-center justify-center group">
          {previews[key] === 'pdf' ? (
            <div className="flex flex-col items-center justify-center p-4">
              <FileCheck className="w-12 h-12 text-blue-500 mb-2" />
              <span className="text-sm font-medium truncate max-w-[200px]">
                {files[key] instanceof File ? (files[key] as File).name : ''}
              </span>
            </div>
          ) : (
            <img src={previews[key]} alt="Preview" className="w-full h-full object-cover" />
          )}

          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <button type="button" onClick={() => removeFile(key)} className="bg-red-500 text-white p-2 rounded-full hover:bg-red-600">
              <X size={20} />
            </button>
          </div>
        </div>
      ) : (
        <div className={cn(driverUploadEmptyClassName, 'w-full aspect-video')}>
          <input
            type="file"
            id={`file-${key}`}
            accept={accept}
            onChange={(e) => handleFileChange(e, key)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <UploadCloud size={32} className="mb-2 text-[#4B5563]" />
          <span className="text-sm font-medium text-[#9CA3AF]">Cliquez pour ajouter</span>
          <span className="text-xs text-[#4B5563] mt-1">Image ou PDF (Max 10Mo)</span>
        </div>
      )}

      <p className="text-xs text-[#9CA3AF] mt-2">Assurez-vous que le texte soit lisible et sans reflet.</p>
    </div>
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
