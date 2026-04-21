'use client'
import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, limit } from 'firebase/firestore'
import { db, auth } from '@/config/firebase'
import { MaterialIcon } from '@/components/ui/MaterialIcon'
import type { CityDocument } from '@/types/firestore-collections'
import { useAdminAuth } from '@/hooks/useAdminAuth'

export default function AdminCitiesPage() {
  const [cities, setCities] = useState<(CityDocument & { id: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newCityId, setNewCityId] = useState('')
  const [newCityName, setNewCityName] = useState('')
  const isAdmin = useAdminAuth()

  useEffect(() => {
    if (!isAdmin) return
    const unsub = onSnapshot(query(collection(db, 'cities'), limit(100)), (snap) => {
      setCities(snap.docs.map(d => ({ id: d.id, ...d.data() as CityDocument })))
      setLoading(false)
    })
    return () => unsub()
  }, [isAdmin])

  const getAuthHeaders = async () => {
    const token = await auth.currentUser?.getIdToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  const manage = async (action: string, cityId: string) => {
    await fetch('/api/admin/manage-city', {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ action, cityId }),
    })
  }

  const createCity = async () => {
    if (!newCityId || !newCityName) return
    await fetch('/api/admin/manage-city', {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ action: 'create', cityId: newCityId, name: newCityName }),
    })
    setNewCityId('')
    setNewCityName('')
    setShowCreate(false)
  }

  if (isAdmin === null || loading) return <div className="flex justify-center pt-12"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>

  if (!isAdmin) return null

  return (
    <div className="min-h-screen bg-background text-white p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Gestion des villes</h1>
          <button onClick={() => setShowCreate(!showCreate)}
            className="px-4 h-9 bg-primary text-white text-sm font-bold rounded-xl">
            + Ajouter une ville
          </button>
        </div>

        {showCreate && (
          <div className="glass-card rounded-2xl border border-white/10 p-4 space-y-3">
            <h3 className="font-semibold text-white">Nouvelle ville</h3>
            <input value={newCityId} onChange={(e) => setNewCityId(e.target.value)}
              placeholder="ID (ex: calgary)" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-white text-sm" />
            <input value={newCityName} onChange={(e) => setNewCityName(e.target.value)}
              placeholder="Nom affiché (ex: Calgary)" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-white text-sm" />
            <div className="flex gap-3">
              <button onClick={() => setShowCreate(false)} className="flex-1 h-9 border border-white/10 text-slate-400 rounded-xl text-sm">Annuler</button>
              <button onClick={createCity} className="flex-1 h-9 bg-primary text-white font-bold rounded-xl text-sm">Créer</button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {cities.map((city) => (
            <div key={city.cityId} className="glass-card rounded-2xl border border-white/10 p-4 flex items-center justify-between">
              <div>
                <p className="font-bold text-white">{city.name}</p>
                <p className="text-xs text-slate-400">{city.cityId} — {city.currency}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-2 py-1 rounded-lg text-xs font-medium ${city.isActive ? 'bg-green-500/10 text-green-400' : 'bg-slate-500/10 text-slate-500'}`}>
                  {city.isActive ? 'Active' : 'Inactive'}
                </span>
                <button onClick={() => manage(city.isActive ? 'deactivate' : 'activate', city.cityId)}
                  className="px-3 h-8 bg-white/5 border border-white/10 text-slate-300 text-xs rounded-xl">
                  {city.isActive ? 'Désactiver' : 'Activer'}
                </button>
              </div>
            </div>
          ))}
          {cities.length === 0 && <p className="text-slate-500 text-center py-8">Aucune ville configurée.</p>}
        </div>
      </div>
    </div>
  )
}
