-- ============================================================
-- 001_initial_schema.sql
-- Initial schema for the OASIS civilization simulation game.
-- All tables use Row Level Security (RLS).
--
-- ORDER MATTERS: game_players must be created before the games
-- RLS policies that reference it (to avoid "relation does not exist").
-- ============================================================

-- ============================================================
-- PROFILES
-- Extends auth.users. Auto-created on sign-up via trigger.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT NOT NULL,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_all"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- GAMES (table + insert policy only)
-- SELECT/UPDATE policies that reference game_players are added
-- AFTER game_players is created below.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.games (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id      TEXT NOT NULL,
  name          TEXT NOT NULL,
  phase         TEXT NOT NULL DEFAULT 'lobby'
                  CHECK (phase IN ('lobby', 'active', 'paused', 'completed')),
  game_state    JSONB,
  created_by    UUID NOT NULL REFERENCES public.profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "games_insert_creator"
  ON public.games FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- ============================================================
-- GAME_PLAYERS
-- Must exist before the games SELECT/UPDATE policies below.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.game_players (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id         UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  civilization_id TEXT NOT NULL,
  is_ready        BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (game_id, player_id),
  UNIQUE (game_id, civilization_id)
);

ALTER TABLE public.game_players ENABLE ROW LEVEL SECURITY;

-- Note: no select policy here — 002_join_policy.sql adds
-- game_players_select_authenticated (USING true) which avoids the
-- infinite recursion that a self-referencing subquery would cause.

CREATE POLICY "game_players_insert_self"
  ON public.game_players FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = player_id);

CREATE POLICY "game_players_update_self"
  ON public.game_players FOR UPDATE
  TO authenticated
  USING (auth.uid() = player_id)
  WITH CHECK (auth.uid() = player_id);

-- ============================================================
-- GAMES — SELECT / UPDATE policies (safe now that game_players exists)
-- ============================================================

CREATE POLICY "games_select_members"
  ON public.games FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.game_players gp
      WHERE gp.game_id = games.id
        AND gp.player_id = auth.uid()
    )
  );

CREATE POLICY "games_update_members"
  ON public.games FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.game_players gp
      WHERE gp.game_id = games.id
        AND gp.player_id = auth.uid()
    )
  );

-- ============================================================
-- TURN_ORDERS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.turn_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id         UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  civilization_id TEXT NOT NULL,
  turn_number     INTEGER NOT NULL,
  orders          JSONB NOT NULL,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (game_id, civilization_id, turn_number)
);

ALTER TABLE public.turn_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "turn_orders_select_members"
  ON public.turn_orders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.game_players gp
      WHERE gp.game_id = turn_orders.game_id
        AND gp.player_id = auth.uid()
    )
  );

CREATE POLICY "turn_orders_insert_own"
  ON public.turn_orders FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = player_id
    AND EXISTS (
      SELECT 1 FROM public.game_players gp
      WHERE gp.game_id = turn_orders.game_id
        AND gp.player_id = auth.uid()
    )
  );

CREATE POLICY "turn_orders_update_own"
  ON public.turn_orders FOR UPDATE
  TO authenticated
  USING (auth.uid() = player_id)
  WITH CHECK (auth.uid() = player_id);

CREATE POLICY "turn_orders_delete_own"
  ON public.turn_orders FOR DELETE
  TO authenticated
  USING (auth.uid() = player_id);

-- ============================================================
-- TURN_HISTORY
-- ============================================================

CREATE TABLE IF NOT EXISTS public.turn_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id         UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  turn_number     INTEGER NOT NULL,
  summary         JSONB NOT NULL,
  resolved_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (game_id, turn_number)
);

ALTER TABLE public.turn_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "turn_history_select_members"
  ON public.turn_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.game_players gp
      WHERE gp.game_id = turn_history.game_id
        AND gp.player_id = auth.uid()
    )
  );

CREATE POLICY "turn_history_insert_members"
  ON public.turn_history FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.game_players gp
      WHERE gp.game_id = turn_history.game_id
        AND gp.player_id = auth.uid()
    )
  );

-- ============================================================
-- INVITES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.invites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id         UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  invite_code     TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(8), 'hex'),
  created_by      UUID NOT NULL REFERENCES public.profiles(id),
  civilization_id TEXT,
  claimed_by      UUID REFERENCES public.profiles(id),
  claimed_at      TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invites_select_all"
  ON public.invites FOR SELECT
  USING (true);

CREATE POLICY "invites_insert_members"
  ON public.invites FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM public.game_players gp
      WHERE gp.game_id = invites.game_id
        AND gp.player_id = auth.uid()
    )
  );

CREATE POLICY "invites_update_claim"
  ON public.invites FOR UPDATE
  TO authenticated
  USING (claimed_by IS NULL)
  WITH CHECK (auth.uid() = claimed_by);

-- ============================================================
-- PERFORMANCE INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_game_players_game_id     ON public.game_players(game_id);
CREATE INDEX IF NOT EXISTS idx_game_players_player_id   ON public.game_players(player_id);
CREATE INDEX IF NOT EXISTS idx_turn_orders_game_id      ON public.turn_orders(game_id);
CREATE INDEX IF NOT EXISTS idx_turn_orders_player_id    ON public.turn_orders(player_id);
CREATE INDEX IF NOT EXISTS idx_turn_history_game_id     ON public.turn_history(game_id);
CREATE INDEX IF NOT EXISTS idx_invites_invite_code      ON public.invites(invite_code);
CREATE INDEX IF NOT EXISTS idx_invites_game_id          ON public.invites(game_id);
CREATE INDEX IF NOT EXISTS idx_games_created_by         ON public.games(created_by);
CREATE INDEX IF NOT EXISTS idx_games_phase              ON public.games(phase);
CREATE INDEX IF NOT EXISTS idx_invites_claimed_by       ON public.invites(claimed_by);
