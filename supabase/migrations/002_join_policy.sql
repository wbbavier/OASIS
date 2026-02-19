-- ============================================================
-- 002_join_policy.sql
-- Adds RLS policies so:
--   1. A game creator can always read their own game (needed before
--      they appear in game_players).
--   2. Any authenticated user can read game metadata (needed for
--      the /join/[id] flow where the joiner is not yet in game_players).
-- ============================================================

-- Creator can always see their own game
CREATE POLICY "games_select_creator"
  ON public.games FOR SELECT
  TO authenticated
  USING (auth.uid() = created_by);

-- Any authenticated user can read game metadata (for join flow)
CREATE POLICY "games_select_authenticated"
  ON public.games FOR SELECT
  TO authenticated
  USING (true);

-- Any authenticated user can read game_players for any game
-- (needed so join-flow can show which civs are already claimed)
CREATE POLICY "game_players_select_authenticated"
  ON public.game_players FOR SELECT
  TO authenticated
  USING (true);
