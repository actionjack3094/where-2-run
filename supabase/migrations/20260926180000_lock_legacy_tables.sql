-- Deny anon and authenticated access to leftover sports-app tables.
-- service_role and security definer functions still bypass RLS.

ALTER TABLE public.gear_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_combines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_contracts ENABLE ROW LEVEL SECURITY;
