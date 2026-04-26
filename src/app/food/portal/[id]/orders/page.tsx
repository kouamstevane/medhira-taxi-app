export const dynamic = 'force-static'
export async function generateStaticParams() {
  return [{ id: 'preview' }]
}
import OrdersManagementClient from './OrdersManagementClient'
export default function Page() {
  return (
    <main>
      <OrdersManagementClient />
    </main>
  )
}
