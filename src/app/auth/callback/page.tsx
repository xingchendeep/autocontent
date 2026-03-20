'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/auth/client';

/**
 * Client-side auth callback page.
 * Supabase PKCE flow stores code_verifier in the browser,
 * so the code exchange MUST happen client-side.
 * 
 * The @supabase/ssr browser client automatically detects the
 * ?code= param and exchanges it for a session on initialization.
 */
export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    // Listen for auth state change — when code exchange completes,
    // SIGNED_IN event fires.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === 'SIGNED_IN') {
          router.replace('/dashboard');
        }
      }
    );

    // Also handle the case where the code exchange already happened
    // or there's an error
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error || !session) {
        // Give it a moment for the auto-exchange to complete
        setTimeout(() => {
          supabase.auth.getSession().then(({ data: { session: s2 } }) => {
            if (s2) {
              router.replace('/dashboard');
            } else {
              router.replace('/login?error=auth_failed');
            }
          });
        }, 2000);
      } else {
        router.replace('/dashboard');
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-zinc-500">正在验证登录…</p>
    </div>
  );
}
