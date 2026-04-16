export const dynamic = 'force-static'
export async function generateStaticParams() { return [{ bookingId: '_' }] }
import PageClient from './PageClient'
export default function Page() {
  return <PageClient />
}
