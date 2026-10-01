import { createClient } from '@/lib/supabase/server';

export interface IdeologyScores {
  economic?: number;    // -100 (left) to 100 (right)
  social?: number;      // -100 (libertarian) to 100 (authoritarian)
  governance?: number;  // -100 (decentralized) to 100 (centralized)
}

/**
 * Calculates Euclidean distance between two ideological vectors.
 */
function calculateIdeologicalDistance(a: IdeologyScores, b: IdeologyScores): number {
  const dEco = (a.economic ?? 0) - (b.economic ?? 0);
  const dSoc = (a.social ?? 0) - (b.social ?? 0);
  const dGov = (a.governance ?? 0) - (b.governance ?? 0);
  return Math.sqrt(dEco * dEco + dSoc * dSoc + dGov * dGov);
}

/**
 * Matches a user to open primary elections nationwide based on ideological proximity.
 */
export async function matchUserToTournaments(userId: string) {
  const supabase = await createClient();

  // Fetch the candidate's ideological profile
  const { data: userIdeology } = await supabase
    .from('user_ideologies')
    .select('vector_data')
    .eq('user_id', userId)
    .single();

  if (!userIdeology?.vector_data) {
    throw new Error('User ideology profile not found. Complete deck questions first.');
  }

  // Fetch all active open primary elections nationwide
  const { data: openElections } = await supabase
    .from('elections')
    .select('id, title, state, district, target_ideology');

  if (!openElections || openElections.length === 0) return [];

  // Rank open elections by closest ideological proximity
  const rankedTournaments = openElections
    .map((election) => {
      const distance = calculateIdeologicalDistance(
        userIdeology.vector_data,
        (election.target_ideology as IdeologyScores) || {}
      );
      return { election, distance };
    })
    .sort((a, b) => a.distance - b.distance);

  return rankedTournaments;
}
