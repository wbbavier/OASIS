'use client';
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { CivilizationDefinition } from '@/themes/schema';
import { CivGrid } from '@/components/lobby/CivGrid';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import alRassanTheme from '@/themes/al-rassan/theme.json';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function JoinPage({ params }: PageProps) {
  const { id: gameId } = use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [phase, setPhase] = useState<string | null>(null);
  const [alreadyJoined, setAlreadyJoined] = useState(false);
  const [civs, setCivs] = useState<CivilizationDefinition[]>([]);
  const [disabledIds, setDisabledIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(`/auth?next=/join/${gameId}`);
    }
  }, [authLoading, user, router, gameId]);

  useEffect(() => {
    if (!user) return;

    async function load() {
      setLoading(true);
      setError(null);

      // Load game metadata
      const { data: game, error: gameError } = await supabase
        .from('games')
        .select('phase, theme_id')
        .eq('id', gameId)
        .single();

      if (gameError || !game) {
        setError(gameError?.message ?? 'Game not found');
        setLoading(false);
        return;
      }

      setPhase(game.phase);

      // Check if already a player
      const { data: existing } = await supabase
        .from('game_players')
        .select('civilization_id')
        .eq('game_id', gameId)
        .eq('player_id', user!.id)
        .maybeSingle();

      if (existing) {
        setAlreadyJoined(true);
        setLoading(false);
        return;
      }

      if (game.phase !== 'lobby') {
        setLoading(false);
        return;
      }

      // Load claimed civs
      const { data: playerRows, error: playersError } = await supabase
        .from('game_players')
        .select('civilization_id')
        .eq('game_id', gameId);

      if (playersError) {
        setError(playersError.message);
        setLoading(false);
        return;
      }

      const claimed = new Set(
        (playerRows ?? []).map((r: { civilization_id: string }) => r.civilization_id)
      );
      setDisabledIds(claimed);
      setCivs(alRassanTheme.civilizations as unknown as CivilizationDefinition[]);
      setLoading(false);
    }

    load();
  }, [user, gameId]);

  // Redirect if already joined
  useEffect(() => {
    if (alreadyJoined) {
      router.replace(`/game/${gameId}`);
    }
  }, [alreadyJoined, gameId, router]);

  async function handleJoin() {
    if (!selectedId || !user) return;
    setSubmitting(true);
    setError(null);

    const { error: insertError } = await supabase.from('game_players').insert({
      game_id: gameId,
      player_id: user.id,
      civilization_id: selectedId,
    });

    if (insertError) {
      setError(insertError.message);
      setSubmitting(false);
      return;
    }

    router.push(`/game/${gameId}`);
  }

  if (authLoading || loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Spinner size={32} className="text-indigo-400" />
      </main>
    );
  }

  if (!user) return null;

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
        <p className="text-red-400">{error}</p>
        <Link href="/" className="text-sm text-indigo-400 underline">
          Back to home
        </Link>
      </main>
    );
  }

  if (phase && phase !== 'lobby') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
        <p className="text-lg font-semibold text-stone-200">Game already started</p>
        <p className="text-stone-400">This game is no longer accepting new players.</p>
        <Link href="/" className="text-sm text-indigo-400 underline">
          Back to home
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-8">
      <div>
        <h1 className="text-2xl font-bold text-stone-100">Join game</h1>
        <p className="mt-1 text-stone-400">Choose your civilization to join this game.</p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <CivGrid
        civs={civs}
        disabledIds={disabledIds}
        selectedId={selectedId}
        onSelect={(id) => setSelectedId(id === selectedId ? null : id)}
      />

      <div className="flex justify-end">
        <Button onClick={handleJoin} disabled={!selectedId || submitting}>
          {submitting ? (
            <span className="flex items-center gap-2">
              <Spinner size={16} /> Joining…
            </span>
          ) : (
            'Join game'
          )}
        </Button>
      </div>
    </main>
  );
}
