'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Spinner } from '@/components/ui/Spinner';

function CallbackInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    const next = searchParams.get('next') ?? '/';

    if (!code) {
      setError('No code found in URL. The link may have expired.');
      return;
    }

    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ error: exchangeError }) => {
        if (exchangeError) {
          setError(exchangeError.message);
        } else {
          router.replace(next);
        }
      });
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-red-400">{error}</p>
        <a href="/auth" className="text-sm text-indigo-400 underline">
          Try signing in again
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <Spinner size={32} className="text-indigo-400" />
      <p className="text-stone-400">Signing you in…</p>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <Suspense
        fallback={
          <div className="flex flex-col items-center gap-4">
            <Spinner size={32} className="text-indigo-400" />
            <p className="text-stone-400">Loading…</p>
          </div>
        }
      >
        <CallbackInner />
      </Suspense>
    </main>
  );
}
