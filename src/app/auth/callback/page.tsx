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

    // PKCE flow: code arrives as a query param
    if (code) {
      supabase.auth
        .exchangeCodeForSession(code)
        .then(({ error: exchangeError }) => {
          if (exchangeError) {
            setError(exchangeError.message);
          } else {
            router.replace(next);
          }
        });
      return;
    }

    // Implicit flow: access_token arrives in the URL hash.
    // The Supabase client processes the hash automatically on init and fires
    // onAuthStateChange with SIGNED_IN. We just need to wait for it.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          router.replace(next);
        }
      }
    );

    // Fallback: if already signed in (session was in storage), redirect now.
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        router.replace(next);
      }
    });

    // If neither fires within 5 s, the link has genuinely expired.
    const timeout = setTimeout(() => {
      supabase.auth.getUser().then(({ data }) => {
        if (!data.user) {
          setError('No sign-in token found. The link may have expired.');
        }
      });
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
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
