'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const redirectTo =
      typeof window !== 'undefined'
        ? `${window.location.origin}/auth/callback`
        : '/auth/callback';

    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });

    setLoading(false);
    if (signInError) {
      setError(signInError.message);
    } else {
      setSent(true);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-stone-100">OASIS</h1>
          <p className="mt-2 text-stone-400">Sign in to continue</p>
        </div>

        {sent ? (
          <Card>
            <div className="text-center">
              <div className="mb-3 text-4xl">✉️</div>
              <h2 className="mb-2 font-semibold text-stone-100">Check your email</h2>
              <p className="text-sm text-stone-400">
                We sent a sign-in link to <strong className="text-stone-200">{email}</strong>.
                Click the link to continue.
              </p>
            </div>
          </Card>
        ) : (
          <Card>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <Input
                id="email"
                label="Email address"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
              {error && <p className="text-sm text-red-400">{error}</p>}
              <Button type="submit" disabled={loading || !email}>
                {loading ? 'Sending…' : 'Send magic link'}
              </Button>
            </form>
          </Card>
        )}
      </div>
    </main>
  );
}
