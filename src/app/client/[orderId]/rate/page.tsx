'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { addDoc, collection, serverTimestamp, doc, getDoc } from 'firebase/firestore'
import { z } from 'zod'
import { auth, db } from '@/config/firebase'
import { MaterialIcon } from '@/components/ui/MaterialIcon'

const ratingSchema = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
})

export default function RateDriverPage() {
  const params = useParams()
  const router = useRouter()
  const rawOrderId = params.orderId
  const orderId = typeof rawOrderId === 'string' ? rawOrderId : ''
  const [score, setScore] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [driverId, setDriverId] = useState<string | null>(null)
  const [loadingOrderId, setLoadingOrderId] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    if (!orderId) {
      setFetchError('Identifiant de commande invalide.')
      setLoadingOrderId(false)
      return
    }

    let cancelled = false

    const fetchDriverId = async () => {
      try {
        const deliveryOrderRef = doc(db, 'food_delivery_orders', orderId)
        const deliveryOrderSnap = await getDoc(deliveryOrderRef)
        if (cancelled) return

        if (!deliveryOrderSnap.exists()) {
          setFetchError('Commande introuvable. Vérifiez le lien ou contactez le support.')
          return
        }

        const data = deliveryOrderSnap.data()
        if (data?.driverId) {
          setDriverId(data.driverId)
        } else {
          setFetchError('Livreur non identifié pour cette commande.')
        }
      } catch {
        if (cancelled) return
        setFetchError('Erreur de chargement. Veuillez réessayer.')
      } finally {
        if (!cancelled) setLoadingOrderId(false)
      }
    }

    fetchDriverId()
    return () => { cancelled = true }
  }, [orderId])

  const handleSubmit = async () => {
    if (!auth.currentUser || !driverId) return

    const validation = ratingSchema.safeParse({
      score,
      comment: comment.trim() || undefined,
    })
    if (!validation.success) {
      setFetchError('Données invalides. Veuillez corriger votre évaluation.')
      return
    }

    setSubmitting(true)
    try {
      await addDoc(collection(db, 'driver_ratings'), {
        orderId,
        clientId: auth.currentUser.uid,
        driverId,
        orderType: 'livraison',
        score,
        comment: comment.trim() || undefined,
        createdAt: serverTimestamp(),
      })
      setSubmitted(true)
      setTimeout(() => router.push('/client/orders'), 2000)
    } catch {
      setFetchError('Erreur lors de l\'envoi. Veuillez réessayer.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingOrderId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6 animate-pulse">
          <div className="h-12 w-12 bg-white/10 rounded-full mx-auto" />
          <div className="h-6 bg-white/10 rounded w-48 mx-auto" />
          <div className="h-4 bg-white/10 rounded w-64 mx-auto" />
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((s) => (
              <div key={s} className="h-10 w-10 bg-white/10 rounded" />
            ))}
          </div>
          <div className="h-24 bg-white/10 rounded-xl" />
          <div className="h-12 bg-white/10 rounded-2xl" />
        </div>
      </div>
    )
  }

  if (fetchError && !driverId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-white p-4">
        <div className="text-center space-y-4 max-w-sm">
          <MaterialIcon name="error_outline" className="text-red-400 text-[48px]" />
          <p className="text-slate-300">{fetchError}</p>
          <button
            onClick={() => router.push('/client/orders')}
            className="text-primary text-sm underline"
          >
            Retour à mes commandes
          </button>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-white">
        <div className="text-center space-y-4">
          <MaterialIcon name="check_circle" className="text-green-400 text-[64px]" />
          <p className="text-xl font-bold">Merci pour votre évaluation !</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-white flex flex-col items-center justify-center p-4">
      <div className="glass-card rounded-2xl border border-white/10 p-6 w-full max-w-sm space-y-6">
        <div className="text-center">
          <MaterialIcon name="delivery_dining" className="text-primary text-[48px]" />
          <h1 className="text-xl font-bold mt-2">Notez votre livreur</h1>
          <p className="text-slate-400 text-sm mt-1">Votre avis aide à améliorer le service</p>
        </div>

        <div className="flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((s) => (
            <button key={s}
              onClick={() => setScore(s)}
              onMouseEnter={() => setHovered(s)}
              onMouseLeave={() => setHovered(0)}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center">
              <MaterialIcon name="star"
                className={`text-[40px] transition-colors ${s <= (hovered || score) ? 'text-amber-400' : 'text-slate-600'}`} />
            </button>
          ))}
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Commentaire optionnel…"
          maxLength={500}
          className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm resize-none"
          rows={3}
        />

        {fetchError && (
          <p className="text-red-400 text-sm text-center">{fetchError}</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={score === 0 || submitting || !driverId}
          className="w-full h-12 flex items-center justify-center bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow disabled:opacity-40"
        >
          {submitting ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Envoyer'}
        </button>

        <button onClick={() => router.push('/client/orders')} className="w-full text-center text-slate-500 text-sm">
          Passer
        </button>
      </div>
    </div>
  )
}
