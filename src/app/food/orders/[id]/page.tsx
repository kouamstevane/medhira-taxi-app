import OrderTrackingClient from './OrderTrackingClient';

export const dynamic = 'force-static';
export const dynamicParams = false;

export async function generateStaticParams() {
  return [{ id: 'preview' }];
}

export default async function OrderTrackingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main>
      <OrderTrackingClient orderId={id} />
    </main>
  );
}
