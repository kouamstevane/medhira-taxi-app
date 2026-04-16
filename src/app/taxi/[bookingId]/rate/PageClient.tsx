'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { addDoc, collection, serverTimestamp, doc, getDoc } from 'firebase/firestore'
import { z } from 'zod'
import { auth, db } from '@/config/firebase'
import { MaterialIcon } from '@/components/ui/MaterialIcon'
import { CURRENCY_CODE, DEFAULT_LOCALE } from '@/utils/constants'

const ratingSchema = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
})

interface BookingData {
  driverId?: string
  driverName?: string
  driverPhone?: string
  carModel?: string
  carColor?: string
  carPlate?: string
  pickup: string
  destination: string
  price: number
  finalPrice?: number
  distance: number
  duration: number
  status: string
  userId: string
}

export default function RateTaxiRidePage() {
  const params = useParams()
  const router = useRouter()
  const rawBookingId = params.bookingId
  const bookingId = typeof rawBookingId === 'string' ? rawBookingId : ''
  const [score, setScore] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [booking, setBooking] = useState<BookingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    if (!bookingId) {
      setFetchError('Identifiant de course invalide.')
      setLoading(false)
      return
    }

    let cancelled = false

    const fetchBooking = async () => {
      try {
        const bookingRef = doc(db, 'bookings', bookingId)
        const bookingSnap = await getDoc(bookingRef)
        if (cancelled) return

        if (!bookingSnap.exists()) {
          setFetchError('Course introuvable. Vérifiez le lien ou contactez le support.')
          return
        }

        const data = bookingSnap.data() as BookingData

        if (data.status !== 'completed') {
          setFetchError('Cette course n\'est pas encore terminée.')
          return
        }

        if (!data.driverId) {
          setFetchError('Chauffeur non identifié pour cette course.')
          return
        }

        if (data.userId !== auth.currentUser?.uid) {
          setFetchError('Vous n\'êtes pas autorisé à évaluer cette course.')
          return
        }

        setBooking(data)
      } catch {
        if (cancelled) return
        setFetchError('Erreur de chargement. Veuillez réessayer.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchBooking()
    return () => { cancelled = true }
  }, [bookingId])

  const handleSubmit = async () => {
    if (!auth.currentUser || !booking?.driverId) return

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
        bookingId,
        orderId: bookingId,
        clientId: auth.currentUser.uid,
        driverId: booking.driverId,
        orderType: 'course',
        score,
        comment: comment.trim() || undefined,
        createdAt: serverTimestamp(),
      })
      setSubmitted(true)
      setTimeout(() => router.push('/historique'), 2000)
    } catch {
      setFetchError('Erreur lors de l\'envoi. Veuillez réessayer.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6 animate-pulse">
          <div className="h-12 w-12 bg-white/10 rounded-full mx-auto" />
          <div className="h-6 bg-white/10 rounded w-48 mx-auto" />
          <div className="h-4 bg-white/10 rounded w-64 mx-auto" />
          <div className="h-20 bg-white/10 rounded-xl" />
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

  if (fetchError && !booking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-white p-4">
        <div className="text-center space-y-4 max-w-sm">
          <MaterialIcon name="error_outline" className="text-red-400 text-[48px]" />
          <p className="text-slate-300">{fetchError}</p>
          <button
            onClick={() => router.push('/historique')}
            className="text-primary text-sm underline"
          >
            Retour à l&apos;historique
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
          <MaterialIcon name="local_taxi" className="text-primary text-[48px]" />
          <h1 className="text-xl font-bold mt-2">Notez votre course</h1>
          <p className="text-slate-400 text-sm mt-1">Votre avis aide à améliorer le service</p>
        </div>

        {booking && (
          <div className="glass-card rounded-xl border border-white/5 p-4 space-y-3">
            {booking.driverName && (
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <MaterialIcon name="person" className="text-primary text-[20px]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{booking.driverName}</p>
                  {booking.carModel && (
                    <p className="text-xs text-slate-400">{booking.carColor} {booking.carModel}</p>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2 relative">
              <div className="absolute left-[5px] top-2 bottom-6 w-[1.5px] bg-slate-700" />
              <div className="flex items-start gap-3">
                <div className="size-2.5 rounded-full bg-primary ring-3 ring-primary/20 z-10 mt-1" />
                <p className="text-xs text-slate-300 flex-1">{booking.pickup}</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="size-2.5 rounded-full border-2 border-white/60 z-10 mt-1" />
                <p className="text-xs text-slate-300 flex-1">{booking.destination}</p>
              </div>
            </div>

            <div className="border-t border-white/5 pt-2 flex justify-between items-center">
              <div className="text-xs text-slate-400">
                {booking.distance} km · {booking.duration} min
              </div>
              <p className="text-sm font-bold text-primary">
                {(booking.finalPrice ?? booking.price).toLocaleString(DEFAULT_LOCALE, { minimumFractionDigits: 2 })} {CURRENCY_CODE}
              </p>
            </div>
          </div>
        )}

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
          disabled={score === 0 || submitting || !booking?.driverId}
          className="w-full h-12 flex items-center justify-center bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow disabled:opacity-40"
        >
          {submitting ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Envoyer'}
        </button>

        <button onClick={() => router.push('/historique')} className="w-full text-center text-slate-500 text-sm">
          Passer
        </button>
      </div>
    </div>
  )
}
