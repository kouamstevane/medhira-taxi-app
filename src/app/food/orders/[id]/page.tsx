import { Suspense } from 'react'
export const dynamic = 'force-static'
export async function generateStaticParams() {
  return [{ id: 'preview' }]
}
import OrderTrackingClient from './OrderTrackingClient'
export default function Page() {
  return (
    <main>
      <Suspense fallback={<div className="min-h-screen bg-background" />}><OrderTrackingClient /></Suspense>
    </main>
  )
}
