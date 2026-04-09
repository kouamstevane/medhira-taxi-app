// src/app/driver/documents/[docKey]/page.tsx
'use client'
import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { auth, storage, db } from '@/config/firebase'
import { MaterialIcon } from '@/components/ui/MaterialIcon'
import { retryWithBackoff } from '@/utils/retry'

const DOC_LABELS: Record<string, string> = {
  photoProfile: 'Photo de profil',
  permitConduire: 'Permis de conduire',
  casierJudiciaire: 'Casier judiciaire',
  historiqueConduire: 'Historique chauffeur',
  preuvePermitTravail: 'Permis de travail',
  plaqueImmatriculation: "Plaque d'immatriculation",
  permitCommercial: 'Permis commercial',
  plaqueImmatriculationCommerciale: 'Plaque commerciale',
  visiteTechniqueCommerciale: 'Visite technique commerciale',
  certificatVille: 'Certificat ville',
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
    if (!file || !auth.currentUser) return
    setUploading(true)
    setError(null)
    try {
      const uid = auth.currentUser.uid
      const storageRef = ref(storage, `driver_documents/${uid}/${docKey}_${Date.now()}`)

      const downloadUrl = await retryWithBackoff(
        async () => {
          await uploadBytes(storageRef, file)
          return getDownloadURL(storageRef)
        },
        { maxAttempts: 3, baseDelay: 1000 }
      )

      await updateDoc(doc(db, 'drivers', uid), {
        [`documents.${docKey}.url`]: downloadUrl,
        [`documents.${docKey}.status`]: 'pending',
        [`documents.${docKey}.submittedAt`]: serverTimestamp(),
        [`documents.${docKey}.rejectionReason`]: null,
        updatedAt: serverTimestamp(),
      })

      setSuccess(true)
      setTimeout(() => router.push('/driver/documents'), 2000)
    } catch (err) {
      setError('Erreur lors du téléversement. Réessayez.')
      console.error(err)
    } finally {
      setUploading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <MaterialIcon name="check_circle" className="text-green-400 text-[64px]" />
          <p className="text-white font-bold">Document soumis !</p>
          <p className="text-slate-400 text-sm">Redirection en cours…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-white p-4">
      <div className="max-w-lg mx-auto">
        <button onClick={() => router.back()} className="mb-6 flex items-center gap-2 text-slate-400">
          <MaterialIcon name="arrow_back" className="text-[20px]" />
          Retour
        </button>

        <h1 className="text-xl font-bold mb-2">{DOC_LABELS[docKey] ?? docKey}</h1>
        <p className="text-slate-400 text-sm mb-6">Téléversez une nouvelle version de ce document.</p>

        <label className="glass-card block p-6 rounded-2xl border border-dashed border-white/20 text-center cursor-pointer hover:border-primary/40 transition-all">
          <input
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <MaterialIcon name="upload_file" className="text-slate-400 text-[48px] mb-3" />
          {file ? (
            <p className="text-white font-medium">{file.name}</p>
          ) : (
            <p className="text-slate-400">Cliquez pour sélectionner un fichier</p>
          )}
          <p className="text-xs text-slate-500 mt-1">Image ou PDF</p>
        </label>

        {error && <p className="text-red-400 text-sm text-center mt-3">{error}</p>}

        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="w-full h-14 mt-6 flex items-center justify-center bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {uploading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            'Soumettre le document'
          )}
        </button>
      </div>
    </div>
  )
}
