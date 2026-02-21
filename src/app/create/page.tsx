'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

export default function CreatePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [name, setName] = useState('');
  const [fogOfWar, setFogOfWar] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/auth');
    }
  }, [authLoading, user, router]);

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Spinner size={32} className="text-indigo-400" />
      </main>
    );
  }

  if (!user) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);

    const { data, error: insertError } = await supabase
      .from('games')
      .insert({
        name: name.trim(),
        theme_id: 'al-rassan',
        created_by: user!.id,
        phase: 'lobby',
        game_state: null,
      })
      .select('id')
      .single();

    if (insertError || !data) {
      setError(insertError?.message ?? 'Failed to create game');
      setSubmitting(false);
      return;
    }

    router.push(`/game/${data.id}/pick-civ`);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-8 p-8">
      <div className="flex items-center gap-4">
        <Link href="/" className="text-stone-400 hover:text-stone-200">
          ← Back
        </Link>
        <h1 className="text-2xl font-bold text-stone-100">Create a game</h1>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <Input
            id="game-name"
            label="Game name"
            type="text"
            placeholder="e.g. Al Rassan — Spring campaign"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />

          <div className="rounded-lg border border-stone-700 bg-stone-800 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500 mb-2">
              Theme
            </p>
            <p className="font-semibold text-stone-200">The Lions of Al Rassan</p>
            <p className="mt-1 text-sm text-stone-400">
              A turn-based civilization game set in a fantasy analog of medieval Iberia. Three
              faiths and five kingdoms circle one another as a golden age ends.
            </p>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={fogOfWar}
              onChange={(e) => setFogOfWar(e.target.checked)}
              className="h-4 w-4 rounded border-stone-600 bg-stone-800 text-indigo-500 focus:ring-indigo-500" />
            <div>
              <span className="text-sm font-medium text-stone-200">Fog of War</span>
              <p className="text-xs text-stone-400">Hide unexplored regions of the map</p>
            </div>
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <Button type="submit" disabled={submitting || !name.trim()}>
            {submitting ? (
              <span className="flex items-center gap-2">
                <Spinner size={16} /> Creating…
              </span>
            ) : (
              'Create game'
            )}
          </Button>
        </form>
      </Card>
    </main>
  );
}
