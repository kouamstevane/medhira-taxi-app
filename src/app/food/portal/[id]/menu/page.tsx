import MenuManagementClient from './MenuManagementClient';

export const dynamic = 'force-static';
export const dynamicParams = false;

export async function generateStaticParams() {
  return [{ id: 'preview' }];
}

export default async function MenuManagementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main>
      <MenuManagementClient id={id} />
    </main>
  );
}
