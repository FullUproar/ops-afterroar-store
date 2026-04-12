CREATE TABLE IF NOT EXISTS pos_tournaments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  store_id TEXT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  event_id TEXT REFERENCES pos_events(id),
  name TEXT NOT NULL,
  format TEXT,
  status TEXT NOT NULL DEFAULT 'registration',
  bracket_type TEXT NOT NULL DEFAULT 'single_elimination',
  max_players INT,
  current_round INT DEFAULT 0,
  total_rounds INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS pos_tournament_players (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tournament_id TEXT NOT NULL REFERENCES pos_tournaments(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES pos_customers(id),
  player_name TEXT NOT NULL,
  seed INT,
  wins INT DEFAULT 0,
  losses INT DEFAULT 0,
  draws INT DEFAULT 0,
  dropped BOOLEAN DEFAULT FALSE,
  standing INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS pos_tournament_matches (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tournament_id TEXT NOT NULL REFERENCES pos_tournaments(id) ON DELETE CASCADE,
  round_number INT NOT NULL,
  match_number INT NOT NULL,
  player1_id TEXT REFERENCES pos_tournament_players(id),
  player2_id TEXT REFERENCES pos_tournament_players(id),
  winner_id TEXT REFERENCES pos_tournament_players(id),
  player1_score INT DEFAULT 0,
  player2_score INT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  table_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_tourn_store ON pos_tournaments(store_id);
CREATE INDEX IF NOT EXISTS idx_pos_tourn_event ON pos_tournaments(event_id);
