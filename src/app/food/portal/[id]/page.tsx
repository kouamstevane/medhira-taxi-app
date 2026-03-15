import PortalClient from './PortalClient';

export const dynamic = 'force-static';
export const dynamicParams = false;

export async function generateStaticParams() {
  return [{ id: 'preview' }];
}

export default async function RestaurantPortalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  return <PortalClient id={id} />;
}
