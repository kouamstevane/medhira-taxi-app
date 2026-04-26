export const dynamic = 'force-static'
export async function generateStaticParams() { return [{ docKey: '_' }] }
import PageClient from './PageClient'
export default function Page() {
  return <PageClient />
}
