"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Loader2, Camera } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { InputField } from '@/components/forms/InputField';
import { ERROR_MESSAGES } from '@/utils/constants';

const minDate = new Date();
minDate.setFullYear(minDate.getFullYear() - 18);

const step2Schema = z.object({
  firstName: z.string().min(2, "Prénom requis"),
  lastName: z.string().min(2, "Nom requis"),
  dob: z.string().min(1, "Date de naissance requise").refine((val) => {
    const date = new Date(val);
    return !isNaN(date.getTime()) && date <= minDate;
  }, "Vous devez avoir au moins 18 ans"),
  phone: z.string().regex(/^\+?[0-9\s\-()]{8,20}$/, ERROR_MESSAGES.INVALID_PHONE),
  ssn: z.string().regex(/^\d{3}[\s\-]?\d{3}[\s\-]?\d{3}$/, "NAS invalide (9 chiffres attendus, ex: 123 456 789)"),
});

export type Step2FormData = z.infer<typeof step2Schema>;

interface Step2IdentityProps {
  onNext: (data: Step2FormData, biometricsPhoto: File | null) => void;
  onBack: () => void;
  initialData?: Partial<Step2FormData>;
  initialPhoto?: File | null;
  loading?: boolean;
}

export default function Step2Identity({ onNext, onBack, initialData, initialPhoto, loading }: Step2IdentityProps) {
  const { showError } = useToast();
  const { register, handleSubmit, formState: { errors }, setValue } = useForm<Step2FormData>({
    resolver: zodResolver(step2Schema),
    defaultValues: {
      firstName: initialData?.firstName || '',
      lastName: initialData?.lastName || '',
      dob: initialData?.dob || '',
      phone: initialData?.phone || '',
      ssn: initialData?.ssn || '',
    }
  });

  const dayRef = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);

  const parsedInitial = initialData?.dob ? initialData.dob.split('-') : ['', '', ''];
  const [dayVal, setDayVal] = useState(parsedInitial[2] || '');
  const [monthVal, setMonthVal] = useState(parsedInitial[1] || '');
  const [yearVal, setYearVal] = useState(parsedInitial[0] || '');

  const assembleDob = useCallback((day: string, month: string, year: string) => {
    if (year.length === 4 && month.length === 2 && day.length === 2) {
      setValue('dob', `${year}-${month}-${day}`, { shouldValidate: true });
    } else {
      setValue('dob', '', { shouldValidate: false });
    }
  }, [setValue]);

  const handleDobFieldChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'day' | 'month' | 'year',
    maxLen: number,
    nextRef: React.RefObject<HTMLInputElement | null>,
  ) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, maxLen);
    e.target.value = raw;

    if (field === 'day') setDayVal(raw);
    else if (field === 'month') setMonthVal(raw);
    else setYearVal(raw);

    const d = field === 'day' ? raw : dayVal;
    const m = field === 'month' ? raw : monthVal;
    const y = field === 'year' ? raw : yearVal;
    assembleDob(d, m, y);

    if (raw.length === maxLen && nextRef.current) {
      nextRef.current.focus();
    }
  };

  const handleDobKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    prevRef: React.RefObject<HTMLInputElement | null>,
  ) => {
    if (e.key === 'Backspace' && (e.target as HTMLInputElement).value === '' && prevRef.current) {
      prevRef.current.focus();
    }
  };

  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(initialPhoto || null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  useEffect(() => {
    if (initialPhoto && !photoDataUrl) {
      const url = URL.createObjectURL(initialPhoto);
      setPhotoDataUrl(url);
    }
  }, [initialPhoto]);

  const photoDataUrlRef = useRef<string | null>(null);
  useEffect(() => {
    photoDataUrlRef.current = photoDataUrl;
  }, [photoDataUrl]);

  useEffect(() => {
    return () => {
      if (photoDataUrlRef.current && photoDataUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(photoDataUrlRef.current);
      }
    };
  }, []);

  const takePhoto = async () => {
    setPhotoError(null);

    if (Capacitor.isNativePlatform()) {
      try {
        const image = await CapacitorCamera.getPhoto({
          quality: 90,
          allowEditing: false,
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Camera,
        });

        if (image.dataUrl) {
          setPhotoDataUrl(image.dataUrl);
          const res = await fetch(image.dataUrl);
          const blob = await res.blob();
          const file = new File([blob], "biophoto.jpeg", { type: "image/jpeg" });
          setPhotoFile(file);
        }
      } catch (error: unknown) {
        console.error("Erreur lors de la prise de photo:", error);
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('User cancelled') || msg.includes('cancelled')) {
          return;
        } else if (msg.includes('permission')) {
          setPhotoError("Permission caméra refusée. Veuillez l'autoriser dans les paramètres.");
        } else {
          setPhotoError("Impossible de prendre la photo. Veuillez réessayer.");
        }
      }
    } else {
      const input = document.getElementById('web-camera-fallback') as HTMLInputElement;
      if (input) input.click();
    }
  };

  const handleWebPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setPhotoError("Seules les images sont acceptées.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setPhotoError("Image trop lourde (Max 10Mo).");
      return;
    }

    setPhotoError(null);

    setPhotoDataUrl(prev => {
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return null;
    });

    const url = URL.createObjectURL(file);
    setPhotoDataUrl(url);
    setPhotoFile(file);
  };

  const onSubmit = (data: Step2FormData) => {
    if (!photoFile) {
      showError("La photo biométrique est obligatoire pour finaliser votre inscription.");
      return;
    }
    onNext(data, photoFile);
  };

  const handleNameInput = (e: React.FormEvent<HTMLInputElement>) => {
    const target = e.target as HTMLInputElement;
    target.value = target.value.replace(/\b\w/g, l => l.toUpperCase());
  }

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white">Votre Profil Chauffeur</h2>
        <p className="text-[#9CA3AF] mt-2">Ces informations sont requises pour votre vérification légale.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

        <div className="bg-[#1A1A1A] p-6 rounded-xl border border-white/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.4)] space-y-4">
            <h3 className="text-lg font-semibold text-white border-b border-white/[0.08] pb-2">Identité</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InputField
                    {...register('firstName')}
                    label="Prénom"
                    onInput={handleNameInput}
                    error={errors.firstName?.message}
                    required
                />
                <InputField
                    {...register('lastName')}
                    label="Nom"
                    onInput={handleNameInput}
                    error={errors.lastName?.message}
                    required
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="w-full">
                    <label className="block text-sm font-medium text-[#9CA3AF] mb-2">
                        Date de naissance<span className="text-red-500 ml-1">*</span>
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            ref={dayRef}
                            name="dobDay"
                            type="text"
                            inputMode="numeric"
                            maxLength={2}
                            placeholder="JJ"
                            value={dayVal}
                            onChange={(e) => handleDobFieldChange(e, 'day', 2, monthRef)}
                            onKeyDown={(e) => handleDobKeyDown(e, dayRef)}
                            className="w-[4.5rem] px-3 py-3 border rounded-xl outline-none transition-all duration-200 bg-[#1A1A1A] text-white text-base text-center placeholder-[#4B5563] focus:ring-2 focus:ring-[#f29200] focus:border-[#f29200] border-white/[0.08] shadow-sm"
                        />
                        <span className="text-[#4B5563] text-lg font-medium select-none">/</span>
                        <input
                            ref={monthRef}
                            name="dobMonth"
                            type="text"
                            inputMode="numeric"
                            maxLength={2}
                            placeholder="MM"
                            value={monthVal}
                            onChange={(e) => handleDobFieldChange(e, 'month', 2, yearRef)}
                            onKeyDown={(e) => handleDobKeyDown(e, dayRef)}
                            className="w-[4.5rem] px-3 py-3 border rounded-xl outline-none transition-all duration-200 bg-[#1A1A1A] text-white text-base text-center placeholder-[#4B5563] focus:ring-2 focus:ring-[#f29200] focus:border-[#f29200] border-white/[0.08] shadow-sm"
                        />
                        <span className="text-[#4B5563] text-lg font-medium select-none">/</span>
                        <input
                            ref={yearRef}
                            name="dobYear"
                            type="text"
                            inputMode="numeric"
                            maxLength={4}
                            placeholder="AAAA"
                            value={yearVal}
                            onChange={(e) => handleDobFieldChange(e, 'year', 4, { current: null })}
                            onKeyDown={(e) => handleDobKeyDown(e, monthRef)}
                            className="w-[6rem] px-3 py-3 border rounded-xl outline-none transition-all duration-200 bg-[#1A1A1A] text-white text-base text-center placeholder-[#4B5563] focus:ring-2 focus:ring-[#f29200] focus:border-[#f29200] border-white/[0.08] shadow-sm"
                        />
                    </div>
                    <p className="mt-1 text-sm text-gray-500">Format : JJ / MM / AAAA</p>
                    {errors.dob?.message && (
                        <p className="mt-1 text-sm text-red-600 flex items-center">
                            <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            {errors.dob.message}
                        </p>
                    )}
                    <input type="hidden" {...register('dob')} />
                </div>
                <InputField
                    type="tel"
                    label="Numéro de Téléphone"
                    placeholder="+1 514 000 0000"
                    {...register('phone')}
                    helperText="Format international (+1 pour le Canada)"
                    required
                />
            </div>

            <InputField
                type="password"
                label="Numéro d'Assurance Sociale (NAS)"
                placeholder="Masqué par défaut"
                {...register('ssn')}
                error={errors.ssn?.message}
                required
            />
        </div>

        <div className="bg-[#1A1A1A] p-6 rounded-xl border border-white/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.4)] space-y-4">
             <h3 className="text-lg font-semibold text-white border-b border-white/[0.08] pb-2">Photo de profil</h3>
             <p className="text-sm text-[#9CA3AF]">Prenez un selfie sur le vif. Assurez-vous d'être bien éclairé et de cadrer votre visage et cou dans l'ovale virtuel.</p>

             <input
               id="web-camera-fallback"
               type="file"
               accept="image/*"
               capture="user"
               className="hidden"
               onChange={handleWebPhotoChange}
             />

             <div className="flex flex-col items-center justify-center py-4">
                 {photoDataUrl ? (
                     <div className="relative w-48 h-48 rounded-full overflow-hidden border-4 border-[#f29200]">
                         <img src={photoDataUrl} alt="Biometric" className="w-full h-full object-cover" />
                     </div>
                 ) : (
                      <div className="w-48 h-48 rounded-full bg-[#242424] flex items-center justify-center border-4 border-dashed border-white/20">
                          <Camera className="w-12 h-12 text-[#4B5563]" />
                      </div>
                 )}
                 <button
                    type="button"
                    onClick={takePhoto}
                     className="mt-4 px-6 py-2 bg-[#242424] text-white font-medium rounded-full hover:bg-white/10 transition-colors"
                >
                    {photoDataUrl ? 'Reprendre la photo' : 'Ouvrir la caméra'}
                </button>

                {photoError && (
                     <div className="mt-3 p-3 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-lg">
                         <p className="text-[#EF4444] text-sm text-center">{photoError}</p>
                    </div>
                )}
             </div>
        </div>

        <div className="flex gap-4 pt-4">
          <button
            type="button"
            onClick={onBack}
            className="w-1/3 bg-[#1A1A1A] border border-white/10 text-white font-bold py-4 rounded-xl hover:bg-white/5 transition-colors"
          >
            Retour
          </button>
          <button
            type="submit"
            disabled={loading}
            className="w-2/3 bg-[#f29200] text-white font-bold py-4 rounded-[28px] hover:bg-[#e68600] transition-colors shadow-[0_0_20px_rgba(242,146,0,0.4)] flex justify-center items-center"
          >
            {loading ? <Loader2 className="animate-spin mr-2" /> : null}
            Enregistrer le brouillon & Continuer
          </button>
        </div>
      </form>
    </div>
  );
}
