import { Suspense } from 'react'
import PageClient from '../[orderId]/rate/PageClient'

export const dynamic = 'force-static'

export default function Page() {
  return <Suspense fallback={<div className="min-h-screen bg-background" />}><PageClient /></Suspense>
}
