export const dynamic = 'force-static'
export async function generateStaticParams() {
  return [{ id: 'preview' }]
}
import PortalClient from './PortalClient'
export default function Page() {
  return <PortalClient />
}
