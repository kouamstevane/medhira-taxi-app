"use client";
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2 } from 'lucide-react';
import { imageCompressionService } from '@/services/image-compression.service';
import { useToast } from '@/hooks/useToast';
import { InputField } from '@/components/forms/InputField';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/useTranslation';
import { DriverDocumentUploadField } from './DriverDocumentUploadField';
import {
  driverPrimaryButtonClassName,
  driverSecondaryButtonClassName,
  driverSectionCardClassName,
  driverSectionTitleClassName,
} from './driverOnboardingStyles';

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

export default function Step3Vehicle({
  onNext,
  onBack,
  initialData,
  initialFiles,
  loading = false,
  driverType = 'chauffeur',
  onVehicleTypeChange,
}: Step3VehicleProps) {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();
  const isChauffeur = driverType === 'chauffeur' || driverType === 'les_deux';
  const maxAge = isChauffeur ? 10 : 15;
  const minYear = currentYear - maxAge;
  const productionYearErrorMessage = t('driver.vehicleProductionYearError', { year: minYear, maxAge });
  const vehicleSchema = React.useMemo(
    () => step3Schema.refine((data) => {
      const yearVal = parseInt(data.productionYear, 10);
      return !isNaN(yearVal) && yearVal >= minYear;
    }, {
      path: ['productionYear'],
      message: productionYearErrorMessage,
    }),
    [minYear, productionYearErrorMessage]
  );

  const deliveryVehicleOptions: { value: VehicleDeliveryType; label: string; icon: string }[] = [
    { value: 'velo', label: t('driver.vehicleBicycle'), icon: '🚲' },
    { value: 'scooter', label: t('driver.vehicleScooter'), icon: '🛵' },
    { value: 'moto', label: t('driver.vehicleMotorcycle'), icon: '🏍️' },
    { value: 'voiture', label: t('driver.vehicleCar'), icon: '🚗' },
  ];

  const [selectedDeliveryVehicle, setSelectedDeliveryVehicle] = React.useState<VehicleDeliveryType>('scooter');
  const { showError } = useToast();

  const { register, handleSubmit, formState: { errors } } = useForm<Step3FormData>({
    resolver: zodResolver(vehicleSchema),
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, key: keyof typeof files) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      showError(t('driver.unsupportedFileFormat'));
      return;
    }

    if (file.type === 'application/pdf') {
      if (file.size > 10 * 1024 * 1024) {
        showError(t('driver.pdfTooLargeMax10'));
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
    } catch {
      setFiles(prev => ({ ...prev, [key]: file }));
      showError(t('driver.compressionFailed', { name: file.name }));
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
      showError(t('driver.fourDoorsError'));
      return;
    }

    if (!files.registration || !files.techControl || !files.exteriorPhoto) {
      showError(t('driver.allVehicleDocsRequired'));
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
    <DriverDocumentUploadField
      label={label}
      inputId={`file-${key}`}
      accept={accept}
      required={required}
      file={files[key]}
      loading={compressionLoading === key}
      onChange={(e) => handleFileChange(e, key)}
      onRemove={() => removeFile(key)}
    />
  );

  if (driverType === 'livreur') {
    return (
      <div className="space-y-6">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-white">{t('driver.transportMethodTitle')}</h2>
          <p className="text-[#9CA3AF] mt-2">{t('driver.transportMethodSubtitle')}</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {deliveryVehicleOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSelectedDeliveryVehicle(opt.value)}
              className={cn(driverSectionCardClassName, 'p-6 text-center transition-all duration-200',
                selectedDeliveryVehicle === opt.value
                  ? 'bg-[#f29200]/10 border-[#f29200] text-white'
                  : 'bg-[#1A1A1A] border-white/[0.06] text-[#9CA3AF] hover:border-white/10'
              )}
            >
              <span className="text-3xl block mb-2">{opt.icon}</span>
              <span className="text-sm font-semibold">{opt.label}</span>
            </button>
          ))}
        </div>

        <div className="flex gap-4 pt-4">
          <button type="button" onClick={onBack} disabled={loading} className={cn(driverSecondaryButtonClassName, 'flex-[1]')}>
            {t('common.back')}
          </button>
          <button
            type="button"
            onClick={() => {
              onVehicleTypeChange?.(selectedDeliveryVehicle);
              onNext(null, {});
            }}
            disabled={loading}
            className={cn(driverPrimaryButtonClassName, 'flex-[2]')}
          >
            {t('common.next')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white">{t('driver.vehicleEligibilityTitle')}</h2>
        <p className="text-[#9CA3AF] mt-2">{t('driver.vehicleEligibilitySubtitle')}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className={driverSectionCardClassName}>
          <h3 className={driverSectionTitleClassName}>{t('driver.vehicleDetailsSection')}</h3>

          <div className="grid grid-cols-1 gap-4">
            <InputField
              type="number"
              {...register('productionYear')}
              label={t('driver.productionYear')}
              placeholder={t('driver.productionYearPlaceholder', { year: currentYear - 2 })}
              helperText={t('driver.vehicleAgeHelper', { year: minYear, maxAge })}
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
                    {t('driver.fourDoorsCheckbox')}
                  </label>
                  <span className="text-xs text-[#9CA3AF] mt-1">
                    {t('driver.fourDoorsDesc')}
                  </span>
                  {errors.hasFourDoors && (
                    <span className="text-red-500 text-xs mt-1">{errors.hasFourDoors.message}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={driverSectionCardClassName}>
          <h3 className={driverSectionTitleClassName}>{t('driver.vehicleDocumentsSection')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderFileInput(t('driver.docRegistration'), "registration")}
            {renderFileInput(t('driver.docTechControl'), "techControl")}
            {renderFileInput(t('driver.docExteriorPhoto'), "exteriorPhoto", true, "image/*")}
          </div>
          {renderFileInput(t('driver.docInsurancePro'), "insurance", false)}
        </div>

        <div className="flex gap-4 pt-4">
          <button type="button" onClick={onBack} disabled={loading} className={cn(driverSecondaryButtonClassName, 'flex-[1]')}>
            {t('common.back')}
          </button>
          <button type="submit" disabled={loading} className={cn(driverPrimaryButtonClassName, 'flex-[2]')}>
            {loading ? <Loader2 className="animate-spin mr-2" /> : null} {t('common.next')}
          </button>
        </div>
      </form>
    </div>
  );
}
