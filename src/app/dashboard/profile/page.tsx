import { ProfileForm } from '@/components/dashboard/ProfileForm';

export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-xl font-bold text-zinc-900">个人中心</h1>
      <ProfileForm />
    </div>
  );
}
