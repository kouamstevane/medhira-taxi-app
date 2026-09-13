"use client";
import React, { useState } from 'react';
import { Loader2, FileCheck } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { SelectField } from '@/components/forms/SelectField';
import { InputField } from '@/components/forms/InputField';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/useTranslation';
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
  const { t } = useTranslation();
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
      showWarning(t('driver.unsupportedFileFormat'));
      e.target.value = '';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showError(t('driver.fileTooLargeMax10'));
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
      showError(t('driver.workEligibilityRequired'));
      return;
    }

    if (!isVelo) {
      if (!files.licenseNumber || files.licenseNumber.trim().length < 4) {
        showError(t('driver.licenseNumberRequired'));
        return;
      }
      if (!files.driversAbstract) {
        showError(t('driver.driversAbstractRequired'));
        return;
      }
      if (!files.licenseClass) {
        showError(t('driver.licenseClassRequired'));
        return;
      }
      if (!files.licenseFront || !files.licenseBack) {
        showError(t('driver.licenseFrontBackRequired'));
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
      helperText={t('driver.ensureTextReadable')}
      onRemove={() => removeFile(key)}
    />
  );

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white">{t('driver.legalComplianceTitle')}</h2>
        <p className="text-[#9CA3AF] mt-2">{t('driver.legalComplianceSubtitle')}</p>
        <div className={cn(driverInfoBannerClassName, 'bg-[#f29200]/10 border-[#f29200]/20 text-slate-200 text-sm mt-4 font-medium flex items-center justify-center')}>
          <FileCheck className="mr-2" size={18} />
          {t('driver.checkDocReadability')}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Work eligibility */}
        <div className={driverSectionCardClassName}>
          <h3 className={driverSectionTitleClassName}>
            {t('driver.workEligibilitySection')}
          </h3>
          <p className="text-xs text-[#9CA3AF]">
            {t('driver.workEligibilityDesc')}
          </p>
          <div className="grid grid-cols-1 gap-4">
            {renderFileInput(t('driver.workEligibilityProof'), 'workEligibility')}
          </div>
        </div>

        {/* Section 2: Driving & License (hidden for bicycle couriers) */}
        {!isVelo && (
          <>
            <div className={driverSectionCardClassName}>
              <h3 className={driverSectionTitleClassName}>{t('driver.licenseClassAndDrivingSection')}</h3>
              <div className="grid grid-cols-1 gap-4">
                 <InputField
                  label={t('driver.driversLicenseNumber')}
                  value={files.licenseNumber}
                  onChange={(e) => setFiles((prev) => ({ ...prev, licenseNumber: e.target.value }))}
                  placeholder={t('driver.driversLicenseNumberPlaceholder')}
                  required
                />
                <SelectField
                  label={t('driver.licenseClassLabel')}
                  value={files.licenseClass}
                  onChange={(e) => setFiles((prev) => ({ ...prev, licenseClass: e.target.value }))}
                  options={[
                    { value: '', label: t('driver.selectLicenseClass') },
                    { value: 'Classe 4', label: t('driver.licenseClass4') },
                    { value: 'Classe 1', label: t('driver.licenseClass1') },
                    { value: 'Classe 2', label: t('driver.licenseClass2') },
                    { value: 'Classe 3', label: t('driver.licenseClass3') },
                    { value: 'Classe 5', label: t('driver.licenseClass5') },
                    { value: 'Autre', label: t('driver.licenseClassOther') },
                  ]}
                  required
                />
                <div className="mt-4">
                  <h4 className="text-sm font-semibold text-white mb-2">{t('driver.driversAbstractTitle')}</h4>
                  <p className="text-xs text-[#9CA3AF] mb-3">
                    {t('driver.driversAbstractDesc')}
                  </p>
                  {renderFileInput(t('driver.driversAbstractLabel'), 'driversAbstract')}
                </div>
              </div>
            </div>

            <div className={driverSectionCardClassName}>
              <h3 className={driverSectionTitleClassName}>{t('driver.licensePhotosSection')}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderFileInput(t('driver.licenseFront'), 'licenseFront')}
                {renderFileInput(t('driver.licenseBack'), 'licenseBack')}
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
            {t('common.back')}
          </button>
          <button
            type="submit"
            disabled={loading}
            className={cn(driverPrimaryButtonClassName, 'flex-[2]')}
          >
            {loading ? <Loader2 className="animate-spin mr-2" /> : null} {t('common.next')}
          </button>
        </div>
      </form>
    </div>
  );
}
