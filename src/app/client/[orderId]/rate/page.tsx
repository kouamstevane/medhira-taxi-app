'use client'
import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '@/config/firebase'
import { MaterialIcon } from '@/components/ui/MaterialIcon'

export default function RateDriverPage() {
  const params = useParams()
  const router = useRouter()
  const orderId = params.orderId as string
  const [score, setScore] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async () => {
    if (score === 0 || !auth.currentUser) return
    setSubmitting(true)
    try {
      await addDoc(collection(db, 'driver_ratings'), {
        orderId,
        clientId: auth.currentUser.uid,
        driverId: '', // Note: à récupérer depuis food_delivery_orders/{orderId}.driverId
        orderType: 'livraison',
        score,
        comment: comment.trim() || undefined,
        createdAt: serverTimestamp(),
      })
      setSubmitted(true)
      setTimeout(() => router.push('/'), 2000)
    } catch (err) {
      console.error('Erreur notation:', err)
    } finally {
      setSubmitting(false)
    }
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
          {[1,2,3,4,5].map((s) => (
            <button key={s}
              onClick={() => setScore(s)}
              onMouseEnter={() => setHovered(s)}
              onMouseLeave={() => setHovered(0)}>
              <MaterialIcon name="star"
                className={`text-[40px] transition-colors ${s <= (hovered || score) ? 'text-amber-400' : 'text-slate-600'}`} />
            </button>
          ))}
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Commentaire optionnel…"
          className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm resize-none"
          rows={3}
        />

        <button
          onClick={handleSubmit}
          disabled={score === 0 || submitting}
          className="w-full h-12 flex items-center justify-center bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow disabled:opacity-40"
        >
          {submitting ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Envoyer'}
        </button>

        <button onClick={() => router.push('/')} className="w-full text-center text-slate-500 text-sm">
          Passer
        </button>
      </div>
    </div>
  )
}
