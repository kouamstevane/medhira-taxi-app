import { Suspense } from 'react'
import OrderTrackingClient from '../[id]/OrderTrackingClient'

export const dynamic = 'force-static'

export default function Page() {
  return <main><Suspense fallback={<div className="min-h-screen bg-background" />}><OrderTrackingClient /></Suspense></main>
}
