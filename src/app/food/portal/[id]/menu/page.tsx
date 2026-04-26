export const dynamic = 'force-static'
export async function generateStaticParams() {
  return [{ id: 'preview' }]
}
import MenuManagementClient from './MenuManagementClient'
export default function Page() {
  return (
    <main>
      <MenuManagementClient />
    </main>
  )
}
