import { UserDetail } from '@/components/admin/UserDetail';

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div>
      <UserDetail userId={id} />
    </div>
  );
}
