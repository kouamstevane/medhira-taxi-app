'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db, getFirebaseStorage } from '@/config/firebase'
import { MaterialIcon } from '@/components/ui/MaterialIcon'
import { retryWithBackoff } from '@/utils/retry'
import { DRIVER_DOCUMENT_KEYS, type DriverDocumentKey } from '@/features/driver-documents/catalog'

export const CANONICAL_UPLOADABLE_DOCUMENT_KEYS = DRIVER_DOCUMENT_KEYS
type AllowedDocKey = DriverDocumentKey

const DOC_LABELS: Record<AllowedDocKey, string> = {
  biometricPhoto: 'Photo biométrique',
  carRegistration: 'Carte grise',
  insurance: 'Assurance',
  techControl: 'Contrôle technique',
  vehicleExterior: 'Photo extérieure du véhicule',
  workEligibility: "Preuve d'admissibilité au travail",
  driversAbstract: "Dossier de conduite (Driver's Abstract)",
  licenseFront: 'Permis de conduire (recto)',
  licenseBack: 'Permis de conduire (verso)',
}

export default function DocumentReuploadPage() {
  const params = useParams()
  const router = useRouter()
  const docKey = params.docKey as string
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleUpload = async () => {
    if (!file || !auth.currentUser) {
      return
    }

    if (!CANONICAL_UPLOADABLE_DOCUMENT_KEYS.includes(docKey as AllowedDocKey)) {
      setError('Type de document non reconnu')
      return
    }

    setUploading(true)
    setError(null)

    try {
      const uid = auth.currentUser.uid
      const storageRef = ref(getFirebaseStorage(), `driver_documents/${uid}/${docKey}_${Date.now()}`)

      const downloadUrl = await retryWithBackoff(
        async () => {
          await uploadBytes(storageRef, file)
          return getDownloadURL(storageRef)
        },
        { maxAttempts: 3, baseDelay: 1000 },
      )

      await setDoc(doc(db, 'drivers', uid, 'private', 'personal'), {
        documents: {
          [docKey]: {
            url: downloadUrl,
            status: 'pending',
            submittedAt: serverTimestamp(),
            rejectionReason: null,
            reviewedAt: null,
            approvedAt: null,
            approvedBy: null,
            rejectedAt: null,
            rejectedBy: null,
          },
        },
        updatedAt: serverTimestamp(),
      }, { merge: true })

      setSuccess(true)
      setTimeout(() => router.push('/driver/documents'), 2000)
    } catch (uploadError) {
      setError('Erreur lors du téléversement. Réessayez.')
      console.error(uploadError)
    } finally {
      setUploading(false)
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="space-y-3 text-center">
          <MaterialIcon name="check_circle" className="text-[64px] text-green-400" />
          <p className="font-bold text-white">Document soumis !</p>
          <p className="text-sm text-slate-400">Redirection en cours...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-4 text-white">
      <div className="mx-auto max-w-lg">
        <button onClick={() => router.back()} className="mb-6 flex items-center gap-2 text-slate-400">
          <MaterialIcon name="arrow_back" className="text-[20px]" />
          Retour
        </button>

        <h1 className="mb-2 text-xl font-bold">{DOC_LABELS[docKey as AllowedDocKey] ?? docKey}</h1>
        <p className="mb-6 text-sm text-slate-400">Téléversez une nouvelle version de ce document.</p>

        <label className="glass-card block cursor-pointer rounded-2xl border border-dashed border-white/20 p-6 text-center transition-all hover:border-primary/40">
          <input
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <MaterialIcon name="upload_file" className="mb-3 text-[48px] text-slate-400" />
          {file ? (
            <p className="font-medium text-white">{file.name}</p>
          ) : (
            <p className="text-slate-400">Cliquez pour sélectionner un fichier</p>
          )}
          <p className="mt-1 text-xs text-slate-500">Image ou PDF</p>
        </label>

        {error && <p className="mt-3 text-center text-sm text-red-400">{error}</p>}

        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="primary-glow mt-6 flex h-14 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-primary to-[#ffae33] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {uploading ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            'Soumettre le document'
          )}
        </button>
      </div>
    </div>
  )
}
