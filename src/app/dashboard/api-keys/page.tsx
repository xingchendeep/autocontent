import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { listApiKeys } from '@/lib/api-keys';
import { getPlanCapability } from '@/lib/billing/plan-capability';
import ApiKeysPanel from '@/components/dashboard/ApiKeysPanel';
import { ApiGuide } from '@/components/dashboard/ApiGuide';
import Link from 'next/link';

export default async function ApiKeysPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const [keys, capability] = await Promise.all([
    listApiKeys(session.id),
    getPlanCapability(session.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-zinc-900">API Keys</h1>
        <p className="mt-1 text-sm text-zinc-500">
          用于通过 Open API 访问 AutoContent Pro 的密钥。密钥只在创建时显示一次，请妥善保存。
        </p>
      </div>

      <div className="mb-6">
        <ApiGuide />
      </div>

      {!capability.canUseApi && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          当前套餐不支持 API 访问。
          <Link href="/dashboard/subscription" className="ml-1 text-blue-600 hover:underline">升级套餐</Link>
        </div>
      )}

      <ApiKeysPanel initialKeys={keys} disabled={!capability.canUseApi} />
    </div>
  );
}
