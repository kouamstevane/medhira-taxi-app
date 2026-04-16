export const dynamic = 'force-static'
export async function generateStaticParams() { return [{ uid: '_' }] }
import PageClient from './PageClient'
export default function Page() {
  return <PageClient />
}
