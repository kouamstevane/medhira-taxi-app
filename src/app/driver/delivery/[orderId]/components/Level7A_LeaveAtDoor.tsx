'use client'
import { useState, useRef, useEffect } from 'react'
import { MaterialIcon } from '@/components/ui/MaterialIcon'
import type { FoodDeliveryOrder } from '@/types/firestore-collections'

interface Props {
  order: FoodDeliveryOrder
  confirmDelivery: (method: 'photo' | 'pin', payload: string) => Promise<void>
  uploadProofPhoto: (file: File) => Promise<string>
}

export default function Level7A_LeaveAtDoor({ order, confirmDelivery, uploadProofPhoto }: Props) {
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const blobUrlRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
      }
    }
  }, [])

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
    }
    const newUrl = URL.createObjectURL(f)
    blobUrlRef.current = newUrl
    setPhoto(f)
    setPreview(newUrl)
  }

  const handleConfirm = async () => {
    if (!photo) return
    setUploading(true)
    setError(null)
    try {
      const url = await uploadProofPhoto(photo)
      await confirmDelivery('photo', url)
    } catch {
      setError('Erreur lors du téléversement. Réessayez.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-white flex flex-col p-4">
      <div className="flex-1 space-y-6">
        <div className="text-center pt-8">
          <MaterialIcon name="door_front" className="text-primary text-[56px]" />
          <h2 className="text-xl font-bold mt-2">Déposer à la porte</h2>
          <p className="text-slate-400 text-sm mt-1">Prenez une photo de la commande déposée</p>
        </div>

        <label className="glass-card block p-6 rounded-2xl border border-dashed border-white/20 text-center cursor-pointer">
          <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
          {preview ? (
            <img src={preview} alt="Preuve" className="w-full max-h-48 object-cover rounded-xl" />
          ) : (
            <>
              <MaterialIcon name="photo_camera" className="text-slate-400 text-[48px] mb-2" />
              <p className="text-slate-400">Appuyer pour prendre une photo</p>
            </>
          )}
        </label>
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
      </div>
      <button
        onClick={handleConfirm}
        disabled={!photo || uploading}
        className="w-full h-14 flex items-center justify-center bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow disabled:opacity-40"
      >
        {uploading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Confirmer la livraison'}
      </button>
    </div>
  )
}
