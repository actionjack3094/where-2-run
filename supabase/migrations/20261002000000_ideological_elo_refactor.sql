-- 1. Drop obsolete jury tables and constraints
DROP TABLE IF EXISTS jury_votes CASCADE;
DROP TABLE IF EXISTS jury_appeals CASCADE;
DROP TABLE IF EXISTS tier2_verifications CASCADE;

-- 2. Ideological Vector storage
CREATE TABLE IF NOT EXISTS user_ideologies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    vector_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tournament Participants (Decoupled per-election Elo)
CREATE TABLE IF NOT EXISTS tournament_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    election_id TEXT NOT NULL,
    elo_rating INTEGER NOT NULL DEFAULT 1200,
    matches_played INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, election_id)
);

-- 4. Debate Spectator Votes (Margin drives Elo G-Factor)
CREATE TABLE IF NOT EXISTS debate_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    debate_id TEXT NOT NULL,
    spectator_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    voted_for_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(debate_id, spectator_id)
);

-- 5. Row Level Security Policies
ALTER TABLE user_ideologies ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE debate_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read user ideologies" ON user_ideologies FOR SELECT USING (true);
CREATE POLICY "Users can update own ideology" ON user_ideologies FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Public read tournament participants" ON tournament_participants FOR SELECT USING (true);
CREATE POLICY "System/Authenticated insert participants" ON tournament_participants FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Public read debate votes" ON debate_votes FOR SELECT USING (true);
CREATE POLICY "Spectators can vote once per debate" ON debate_votes FOR INSERT WITH CHECK (auth.uid() = spectator_id);
