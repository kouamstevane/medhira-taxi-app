import OrdersManagementClient from './OrdersManagementClient';

export const dynamic = 'force-static';
export const dynamicParams = false;

export async function generateStaticParams() {
  return [{ id: 'preview' }];
}

export default async function OrdersManagementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main>
      <OrdersManagementClient id={id} />
    </main>
  );
}
