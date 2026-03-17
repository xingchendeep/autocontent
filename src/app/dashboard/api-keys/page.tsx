import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { listApiKeys } from '@/lib/api-keys';
import ApiKeysPanel from '@/components/dashboard/ApiKeysPanel';

export default async function ApiKeysPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const keys = await listApiKeys(session.id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-zinc-900">API Keys</h1>
        <p className="mt-1 text-sm text-zinc-500">
          用于通过 Open API 访问 AutoContent Pro 的密钥。密钥只在创建时显示一次，请妥善保存。
        </p>
      </div>
      <ApiKeysPanel initialKeys={keys} />
    </div>
  );
}
