export const dynamic = 'force-static'
export async function generateStaticParams() {
  return [{ id: 'preview' }]
}
import OrderTrackingClient from './OrderTrackingClient'
export default function Page() {
  return (
    <main>
      <OrderTrackingClient />
    </main>
  )
}
