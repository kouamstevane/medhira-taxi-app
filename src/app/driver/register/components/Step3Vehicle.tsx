"use client";
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, UploadCloud, X } from 'lucide-react';
import { imageCompressionService } from '@/services/image-compression.service';
import { useToast } from '@/hooks/useToast';
import { InputField } from '@/components/forms/InputField';

const step3Schema = z.object({
  productionYear: z.string()
    .regex(/^(19|20)\d{2}$/, "Année invalide (ex: 2021)"),
  hasFourDoors: z.boolean().optional(),
});

export type Step3FormData = z.infer<typeof step3Schema>;

type VehicleDeliveryType = 'velo' | 'scooter' | 'moto' | 'voiture';

export type Step3Files = {
  registration?: File;
  insurance?: File;
  techControl?: File;
  exteriorPhoto?: File;
};

interface Step3VehicleProps {
  onNext: (data: Step3FormData | null, files: Step3Files) => void;
  onBack: () => void;
  initialData?: Partial<Step3FormData>;
  initialFiles?: Step3Files;
  loading?: boolean;
  driverType?: 'chauffeur' | 'livreur' | 'les_deux';
  onVehicleTypeChange?: (vehicleType: VehicleDeliveryType) => void;
}

const DELIVERY_VEHICLE_OPTIONS: { value: VehicleDeliveryType; label: string; icon: string }[] = [
  { value: 'velo', label: 'Vélo', icon: '🚲' },
  { value: 'scooter', label: 'Scooter', icon: '🛵' },
  { value: 'moto', label: 'Moto', icon: '🏍️' },
  { value: 'voiture', label: 'Voiture', icon: '🚗' },
];

export default function Step3Vehicle({
  onNext,
  onBack,
  initialData,
  initialFiles,
  loading = false,
  driverType = 'chauffeur',
  onVehicleTypeChange,
}: Step3VehicleProps) {
  const currentYear = new Date().getFullYear();
  const isChauffeur = driverType === 'chauffeur' || driverType === 'les_deux';
  const maxAge = isChauffeur ? 10 : 15;
  const minYear = currentYear - maxAge;

  const [selectedDeliveryVehicle, setSelectedDeliveryVehicle] = React.useState<VehicleDeliveryType>('scooter');
  const { showInfo, showError } = useToast();

  const { register, handleSubmit, formState: { errors } } = useForm<Step3FormData>({
    resolver: zodResolver(step3Schema),
    defaultValues: {
      productionYear: initialData?.productionYear || '',
      hasFourDoors: initialData?.hasFourDoors || false,
    }
  });

  const [files, setFiles] = useState<{
    registration: File | null;
    insurance: File | null;
    techControl: File | null;
    exteriorPhoto: File | null;
  }>({
    registration: initialFiles?.registration || null,
    insurance: initialFiles?.insurance || null,
    techControl: initialFiles?.techControl || null,
    exteriorPhoto: initialFiles?.exteriorPhoto || null,
  });

  const [compressionLoading, setCompressionLoading] = useState<string | null>(null);
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, key: keyof typeof files) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      showError("Format de fichier non supporté (JPEG, PNG, WebP, PDF uniquement).");
      return;
    }

    if (file.type === 'application/pdf') {
      if (file.size > 10 * 1024 * 1024) {
        showError("Le PDF ne doit pas dépasser 10Mo.");
        return;
      }
      setFiles(prev => ({ ...prev, [key]: file }));
      return;
    }

    try {
      setCompressionLoading(key);
      const compressedResult = await imageCompressionService.compressImage(file, {
        maxWidth: 1920,
        quality: 0.8,
      });
      setFiles(prev => ({ ...prev, [key]: compressedResult.file }));
    } catch (err) {
      setFiles(prev => ({ ...prev, [key]: file }));
      showError("La compression a échoué pour " + file.name);
    } finally {
      setCompressionLoading(null);
    }
  };

  const removeFile = (key: keyof typeof files) => {
    setFiles(prev => ({ ...prev, [key]: null }));
    const fileInput = document.getElementById(`file-${key}`) as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  const onSubmit = (data: Step3FormData) => {
    if (isChauffeur && !data.hasFourDoors) {
      showError("Votre véhicule doit posséder 4 portes indépendantes pour le service VTC.");
      return;
    }

    const yearVal = parseInt(data.productionYear, 10);
    if (isNaN(yearVal) || yearVal < minYear) {
      showError(`Le véhicule doit être de l'année ${minYear} ou plus récent (${maxAge} ans max pour le rôle choisi).`);
      return;
    }

    if (!files.registration || !files.techControl || !files.exteriorPhoto) {
      showError("Veuillez fournir tous les documents obligatoires (Carte grise, Contrôle technique, Photo extérieur).");
      return;
    }

    onNext(data, {
      registration: files.registration,
      insurance: files.insurance || undefined,
      techControl: files.techControl,
      exteriorPhoto: files.exteriorPhoto,
    });
  };

  const renderFileInput = (label: string, key: keyof typeof files, required = true, accept = "image/*,application/pdf") => (
    <div className="border border-white/[0.06] rounded-xl p-4 bg-[#1A1A1A] relative">
      <label className="block text-sm font-medium text-[#9CA3AF] mb-2">
        {label} {required ? <span className="text-red-500">*</span> : <span className="text-[#4B5563] text-xs">(facultatif)</span>}
      </label>

      {files[key] ? (
        <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.05]">
          <span className="text-sm font-medium truncate max-w-[180px] text-slate-300">
            {files[key]?.name}
          </span>
          <button type="button" onClick={() => removeFile(key)} className="text-red-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition-colors">
            Supprimer
          </button>
        </div>
      ) : (
        <div className="relative border-2 border-dashed border-white/[0.1] rounded-xl p-6 flex flex-col items-center justify-center bg-white/[0.01] hover:bg-white/[0.02] transition-colors cursor-pointer">
          <input
            type="file"
            id={`file-${key}`}
            accept={accept}
            onChange={(e) => handleFileChange(e, key)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          {compressionLoading === key ? (
            <Loader2 className="animate-spin text-[#f29200] w-8 h-8" />
          ) : (
            <UploadCloud className="text-slate-500 w-8 h-8 mb-2" />
          )}
          <span className="text-xs text-slate-400">Cliquez pour ajouter</span>
        </div>
      )}
    </div>
  );

  if (driverType === 'livreur') {
    return (
      <div className="space-y-6">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-white">Moyen de transport</h2>
          <p className="text-[#9CA3AF] mt-2">Sélectionnez votre véhicule pour la livraison.</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {DELIVERY_VEHICLE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSelectedDeliveryVehicle(opt.value)}
              className={`p-6 rounded-2xl border text-center transition-all duration-200 ${
                selectedDeliveryVehicle === opt.value
                  ? 'bg-[#f29200]/10 border-[#f29200] text-white'
                  : 'bg-[#1A1A1A] border-white/[0.06] text-[#9CA3AF] hover:border-white/10'
              }`}
            >
              <span className="text-3xl block mb-2">{opt.icon}</span>
              <span className="text-sm font-semibold">{opt.label}</span>
            </button>
          ))}
        </div>

        <div className="flex gap-4 pt-4">
          <button type="button" onClick={onBack} disabled={loading} className="w-1/3 bg-[#1A1A1A] border border-white/10 text-white font-bold py-4 rounded-xl hover:bg-white/5 transition-colors">
            Retour
          </button>
          <button
            type="button"
            onClick={() => {
              onVehicleTypeChange?.(selectedDeliveryVehicle);
              onNext(null, {});
            }}
            disabled={loading}
            className="w-2/3 bg-[#f29200] text-white font-bold py-4 rounded-[28px] shadow-[0_0_20px_rgba(242,146,0,0.4)] hover:bg-[#e68600] transition-colors"
          >
            Continuer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white">Éligibilité Véhicule</h2>
        <p className="text-[#9CA3AF] mt-2">Veuillez renseigner les détails de votre véhicule.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="bg-[#1A1A1A] p-6 rounded-xl border border-white/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.4)] space-y-4">
          <h3 className="text-lg font-semibold text-white border-b border-white/[0.08] pb-2">Détails Véhicule</h3>

          <div className="grid grid-cols-1 gap-4">
            <InputField
              type="number"
              {...register('productionYear')}
              label="Année de production"
              placeholder={`Ex: ${currentYear - 2}`}
              helperText={`Véhicule de ${minYear} ou plus récent (${maxAge} ans max pour le rôle choisi)`}
              error={errors.productionYear?.message}
              required
            />

            {isChauffeur && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] mt-2">
                <input
                  type="checkbox"
                  id="hasFourDoors"
                  {...register('hasFourDoors')}
                  className="mt-1 w-5 h-5 rounded border-white/10 text-[#f29200] focus:ring-[#f29200] accent-[#f29200] cursor-pointer bg-[#1A1A1A]"
                />
                <div className="flex flex-col">
                  <label htmlFor="hasFourDoors" className="text-sm font-semibold text-white cursor-pointer select-none">
                    Mon véhicule dispose de 4 portes indépendantes
                  </label>
                  <span className="text-xs text-[#9CA3AF] mt-1">
                    Exigence réglementaire obligatoire pour tous les services VTC (les voitures à 2 ou 3 portes sont interdites).
                  </span>
                  {errors.hasFourDoors && (
                    <span className="text-red-500 text-xs mt-1">{errors.hasFourDoors.message}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-[#1A1A1A] p-6 rounded-xl border border-white/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.4)] space-y-4">
          <h3 className="text-lg font-semibold text-white border-b border-white/[0.08] pb-2">Documents Véhicule</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderFileInput("Carte Grise (Recto/Verso)", "registration")}
            {renderFileInput("Contrôle Technique", "techControl")}
            {renderFileInput("Photo Extérieur (Plaque visible)", "exteriorPhoto", true, "image/*")}
          </div>
          {renderFileInput("Assurance Pro", "insurance", false)}
        </div>

        <div className="flex gap-4 pt-4">
          <button type="button" onClick={onBack} disabled={loading} className="w-1/3 bg-[#1A1A1A] border border-white/10 text-white font-bold py-4 rounded-xl hover:bg-white/5 transition-colors">
            Retour
          </button>
          <button type="submit" disabled={loading} className="w-2/3 bg-[#f29200] text-white font-bold py-4 rounded-[28px] shadow-[0_0_20px_rgba(242,146,0,0.4)] hover:bg-[#e68600] transition-colors flex justify-center items-center">
            {loading ? <Loader2 className="animate-spin mr-2" /> : null} Continuer
          </button>
        </div>
      </form>
    </div>
  );
}
