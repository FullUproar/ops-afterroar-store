-- 031_pos_network.sql
-- Afterroar Network federation: cross-store tournaments, ELO ratings

CREATE TABLE IF NOT EXISTS pos_network_tournaments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  format TEXT,
  game TEXT DEFAULT 'MTG',
  host_store_id TEXT NOT NULL REFERENCES pos_stores(id),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  entry_fee_cents INT DEFAULT 0,
  max_players_per_store INT,
  prize_pool_description TEXT,
  status TEXT DEFAULT 'upcoming',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pos_network_tournament_stores (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  network_tournament_id TEXT NOT NULL REFERENCES pos_network_tournaments(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES pos_stores(id),
  local_tournament_id TEXT,
  player_count INT DEFAULT 0,
  joined_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pos_network_player_ratings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  player_name TEXT NOT NULL,
  customer_id TEXT,
  store_id TEXT NOT NULL REFERENCES pos_stores(id),
  game TEXT DEFAULT 'MTG',
  format TEXT,
  rating INT DEFAULT 1200,
  wins INT DEFAULT 0,
  losses INT DEFAULT 0,
  draws INT DEFAULT 0,
  events_played INT DEFAULT 0,
  last_played_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_network_tournaments_status ON pos_network_tournaments(status);
CREATE INDEX IF NOT EXISTS idx_network_tournament_stores ON pos_network_tournament_stores(network_tournament_id);
CREATE INDEX IF NOT EXISTS idx_network_player_ratings_game ON pos_network_player_ratings(game, format, rating DESC);
CREATE INDEX IF NOT EXISTS idx_network_player_ratings_store ON pos_network_player_ratings(store_id);
