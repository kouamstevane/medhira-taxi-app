import { Suspense } from 'react'
import RestaurantClient from './RestaurantClient'

export const dynamic = 'force-static'
export async function generateStaticParams() {
  return [{ id: 'preview' }]
}
export default function Page() {
  return (
    <main>
      <Suspense fallback={<div className="min-h-screen bg-background" />}>
        <RestaurantClient />
      </Suspense>
    </main>
  )
}
