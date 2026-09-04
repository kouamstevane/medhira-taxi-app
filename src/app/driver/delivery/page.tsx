import { Suspense } from 'react'
import PageClient from './[orderId]/PageClient'
import { NetworkErrorView } from '@/components/ui'
import { isFirestoreNetworkError } from '@/utils/firestore-error-handler'

export const dynamic = 'force-static'

void [NetworkErrorView, isFirestoreNetworkError]

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <PageClient />
    </Suspense>
  )
}
