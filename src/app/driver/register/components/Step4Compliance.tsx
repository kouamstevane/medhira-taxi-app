"use client";
import React, { useState, useRef, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, UploadCloud, FileCheck, X } from 'lucide-react';
import { useToast } from '@/hooks/useToast';

const fileSchema = z.custom<File>((v) => v instanceof File, {
  message: "Document obligatoire"
});

const step4Schema = z.object({
  idFront: fileSchema,
  idBack: fileSchema,
  licenseFront: fileSchema,
  licenseBack: fileSchema,
});

export type Step4Files = z.infer<typeof step4Schema>;

interface Step4ComplianceProps {
  onNext: (files: Step4Files) => void;
  onBack: () => void;
  initialFiles?: Partial<Step4Files>;
  loading?: boolean;
}

export default function Step4Compliance({ onNext, onBack, initialFiles, loading }: Step4ComplianceProps) {
  const { showError, showWarning } = useToast();
  
  const [files, setFiles] = useState<{
    idFront: File | null;
    idBack: File | null;
    licenseFront: File | null;
    licenseBack: File | null;
  }>({
    idFront: initialFiles?.idFront || null,
    idBack: initialFiles?.idBack || null,
    licenseFront: initialFiles?.licenseFront || null,
    licenseBack: initialFiles?.licenseBack || null,
  });

  const [previews, setPreviews] = useState<Record<string, string>>({});
  const blobUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  // Gérer les previews pour les fichiers initiaux
  React.useEffect(() => {
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
      showError("Fichier trop lourd (Max 10Mo)");
      return;
    }

    setFiles(prev => ({ ...prev, [key]: file }));

    // Générer une preview
    if (file.type.startsWith('image/')) {
        const oldUrl = previews[key];
        if (oldUrl && oldUrl !== 'pdf') {
            URL.revokeObjectURL(oldUrl);
            blobUrlsRef.current = blobUrlsRef.current.filter(u => u !== oldUrl);
        }
        const url = URL.createObjectURL(file);
        blobUrlsRef.current.push(url);
        setPreviews(prev => ({ ...prev, [key]: url }));
    } else if (file.type === 'application/pdf') {
        // Simple preview logic for PDF
        setPreviews(prev => ({ ...prev, [key]: 'pdf' }));
    }
  };

  const removeFile = (key: keyof typeof files) => {
    setFiles(prev => ({ ...prev, [key]: null }));
    setPreviews(prev => {
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
    const result = step4Schema.safeParse(files);
    
    if (!result.success) {
      showError("Tous les documents de conformité légale sont obligatoires.");
      return;
    }
    
    onNext(result.data);
  };

  const renderFileInput = (label: string, key: keyof typeof files, accept = "image/*,application/pdf") => (
    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 flex flex-col items-center text-center">
      <label className="block text-sm font-medium text-gray-700 mb-2 w-full text-left">
        {label} <span className="text-red-500">*</span>
      </label>
      
      {previews[key] ? (
        <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-gray-200 bg-white shadow-sm flex items-center justify-center group">
          {previews[key] === 'pdf' ? (
              <div className="flex flex-col items-center justify-center p-4">
                  <FileCheck className="w-12 h-12 text-blue-500 mb-2" />
                  <span className="text-sm font-medium truncate max-w-[200px]">{files[key]?.name}</span>
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
        <div className="relative w-full aspect-video border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center hover:bg-gray-100 transition-colors cursor-pointer bg-white">
          <input 
            type="file" 
            id={`file-${key}`}
            accept={accept} 
            onChange={(e) => handleFileChange(e, key)} 
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
          />
          <UploadCloud size={32} className="mb-2 text-gray-400" />
          <span className="text-sm font-medium text-gray-600">Cliquez pour ajouter</span>
          <span className="text-xs text-gray-400 mt-1">Image ou PDF (Max 10Mo)</span>
        </div>
      )}
      
      <p className="text-xs text-gray-500 mt-2">
          Assurez-vous que le texte soit lisible et sans reflet.
      </p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-[#101010]">Conformité Légale</h2>
        <p className="text-gray-500 mt-2">Vos documents d'identité pour validation de votre profil.</p>
        <div className="bg-blue-50 text-blue-800 p-3 rounded-lg text-sm mt-4 font-medium flex items-center justify-center">
             <FileCheck className="mr-2" size={18} />
             Vérifiez la lisibilité de vos documents avant d'envoyer.
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Card 1: Identité */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
            <h3 className="text-lg font-semibold text-[#101010] border-b pb-2">Pièce d'Identité ou Passeport</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderFileInput("Recto", "idFront")}
                {renderFileInput("Verso", "idBack")}
            </div>
        </div>

        {/* Card 2: Permis */}
         <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
            <h3 className="text-lg font-semibold text-[#101010] border-b pb-2">Permis de Conduire</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderFileInput("Recto", "licenseFront")}
                {renderFileInput("Verso", "licenseBack")}
            </div>
        </div>

        <div className="flex gap-4 pt-4">
           <button type="button" onClick={onBack} disabled={loading} className="w-1/3 bg-gray-200 text-[#101010] font-bold py-4 rounded-xl hover:bg-gray-300 transition-colors">
            Retour
          </button>
          <button type="submit" disabled={loading} className="w-2/3 bg-[#f29200] text-white font-bold py-4 rounded-xl hover:bg-[#e68600] transition-colors flex justify-center items-center">
             {loading ? <Loader2 className="animate-spin mr-2" /> : null} Valider les documents
          </button>
        </div>
      </form>
    </div>
  );
}
