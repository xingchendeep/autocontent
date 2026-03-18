import { GenerationDetail } from '@/components/admin/GenerationDetail';

export default async function AdminGenerationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div>
      <GenerationDetail generationId={id} />
    </div>
  );
}
