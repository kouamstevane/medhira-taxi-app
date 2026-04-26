export const dynamic = 'force-static'
export async function generateStaticParams() {
  return [{ id: 'preview' }]
}
import RestaurantClient from './RestaurantClient'
export default function Page() {
  return (
    <main>
      <RestaurantClient />
    </main>
  )
}
