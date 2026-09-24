export type IdeologyVector = number[];

export type StanceAxis =
  | "economy"
  | "foreign_policy"
  | "social"
  | "environment"
  | "immigration";

export type StanceVector = Record<StanceAxis, number>;

export type VerificationTier =
  | "unverified"
  | "phone_verified"
  | "voter_verified"
  | "candidate_verified";

export type DistrictLevel = "local" | "state" | "federal" | string;

export type DebateStatus =
  | "waiting"
  | "matching"
  | "active"
  | "voting"
  | "completed"
  | "expired";

export interface District {
  id: string;
  name: string;
  level: DistrictLevel;
  pvi_score: number | null;
  historical_lean: string | null;
  median_ideology_vector: IdeologyVector | string | null;
  zip_code: string | null;
  state: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  username: string;
  ideology_vector: IdeologyVector | string | null;
  target_district_id: string | null;
  viability_score: number;
  tier: string | null;
  is_verified: boolean;
  verification_tier: VerificationTier | string;
  ocd_identifiers: string[];
  tier_2_verified: boolean;
  residency_state: string | null;
  residency_zip: string | null;
  is_eligible_federal: boolean;
  is_eligible_local: boolean;
  elo_rating: number;
  stance_vector: string | number[] | null;
  created_at: string;
  updated_at: string;
}

export interface Debate {
  id: string;
  district_id: string | null;
  election_id: string | null;
  election_question_id: string | null;
  topic: string;
  candidate_a_id: string | null;
  candidate_b_id: string | null;
  status: DebateStatus | string;
  current_round: number;
  expires_at: string;
  elo_applied_at: string | null;
  created_at: string;
}

export type FilingTreasurerRequirements = {
  form?: string;
  office?: string;
  notes?: string;
  steps?: string[];
};

export type FilingRequirements = {
  jurisdiction?: string;
  office?: string;
  level?: string;
  state?: string;
  filing_deadline?: string;
  residency_deadline?: string;
  residency?: string;
  petition_signatures?: number | string;
  filing_fee?: string;
  ballot_access?: string[];
  treasurer?: FilingTreasurerRequirements;
  source?: string;
};

export interface Election {
  id: string;
  slug: string;
  office_name: string;
  median_voter_vector: IdeologyVector | string | null;
  /** Republican primary electorate, six civic axes in [0, 1]. */
  primary_rep_vector?: IdeologyVector | string | null;
  /** Democratic primary electorate, six civic axes in [0, 1]. */
  primary_dem_vector?: IdeologyVector | string | null;
  /** General-election electorate, six civic axes in [0, 1]. */
  general_vector?: IdeologyVector | string | null;
  /** Partisan lean from −1 (deep D) to +1 (deep R). */
  pvi_score?: number | null;
  incumbent_name: string | null;
  filing_requirements: FilingRequirements | Record<string, unknown>;
  district_id: string | null;
  /** OCD-ID for the seat. Jury eligibility compares verified divisions to this id. */
  ocd_id?: string | null;
  /** Days of district residency required before election day. */
  residency_requirement_days?: number | null;
  /** Election day. Relocation deadline subtracts residency_requirement_days from this date. */
  election_date?: string | null;
  created_at: string;
  updated_at: string;
}

export type CampaignTargetStatus = "exploring" | "relocating" | "filed";

export interface CampaignTarget {
  id: string;
  user_id: string;
  election_id: string;
  status: CampaignTargetStatus | string;
  created_at: string;
}

export interface Argument {
  id: string;
  debate_id: string;
  author_id: string;
  round_number: number;
  content: string;
  consistency_score: number | null;
  consistency_critique: string | null;
  graded_at: string | null;
  created_at: string;
}

export type DebateEvaluationStatus = "evaluated" | "appealed" | "locked";

export interface DebateEvaluation {
  id: string;
  debate_id: string;
  candidate_id: string;
  primary_score: number | string;
  confidence_score: number | string;
  rubric_flag: string | null;
  addendum_text: string | null;
  ensemble_result: boolean | null;
  status: DebateEvaluationStatus | string;
  elo_rating?: number | null;
  created_at: string;
  updated_at: string;
}

export interface JuryAppeal {
  id: string;
  debate_id: string;
  voter_id: string;
  /** True validates the argument. False rejects it. */
  vote_direction: boolean;
  created_at: string;
}

export interface Vote {
  id: string;
  debate_id: string;
  voter_id: string;
  candidate_id: string;
  created_at: string;
}

export interface Comment {
  id: string;
  debate_id: string;
  author_id: string;
  body: string;
  created_at: string;
  ai_stance_score: number | string | null;
}

export type CommentWithAuthor = Comment & {
  author: Pick<UserProfile, "id" | "username"> | null;
};

export interface Pledge {
  id: string;
  candidate_id: string;
  donor_id: string | null;
  amount: number | string;
  donor_name: string;
  message: string | null;
  created_at: string;
}

export type CampaignPledgeStatus = "pending" | "captured" | "failed" | "canceled";

export interface CampaignPledge {
  id: string;
  donor_id: string;
  candidate_id: string;
  election_id: string;
  amount: number | string;
  unlock_condition: string | null;
  debate_id?: string | null;
  stripe_customer_id: string;
  stripe_payment_method_id: string | null;
  stripe_setup_intent_id: string | null;
  status: CampaignPledgeStatus | string;
  created_at: string;
  updated_at: string;
}

export type EscrowPledgeStatus = "vaulted" | "captured" | "failed" | "canceled";

export interface EscrowPledge {
  id: string;
  voter_id: string;
  election_id: string;
  pledged_amount: number | string;
  stripe_setup_intent_id: string;
  stripe_customer_id: string;
  stripe_payment_method_id: string | null;
  status: EscrowPledgeStatus | string;
  mandate_accepted_at: string;
  created_at: string;
  updated_at: string;
}

export interface Tier2Verification {
  user_id: string;
  /** AES-256-GCM ciphertext. Never returned to the client. */
  verified_address: string;
  ocd_ids: string[];
  verified_at: string;
}

export interface Candidate {
  id: string;
  display_name: string;
  office_sought: string | null;
  bio: string | null;
  residency_state: string | null;
  ideology_vector: IdeologyVector | string;
  pac_agreement_accepted: boolean;
  pac_agreement_accepted_at: string | null;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface CandidateStats {
  id: string;
  username: string;
  ideology_vector: IdeologyVector | string | null;
  target_district_id: string | null;
  viability_score: number;
  tier: string | null;
  is_verified: boolean;
  verification_tier: VerificationTier | string;
  created_at: string;
  updated_at: string;
  total_votes: number;
  debates_won: number;
  debates_played: number;
  win_percentage: number;
  total_pledged: number | string;
  elo_rating: number;
  stance_vector: string | number[] | null;
}

export interface ElectabilityScore {
  id: string;
  user_id: string;
  district_id: string;
  ideological_match_pct: number | string;
  debate_win_rate: number | string;
  total_escrow_pledged: number | string;
  legal_eligibility_integer: number;
  electability_multiplier: number | string;
  created_at: string;
  updated_at: string;
}

export interface ElectionRequirement {
  id: string;
  election_id: string;
  state: string;
  office: string;
  residency_deadline: string;
  filing_deadline: string;
  escrow_goal: number | string;
  created_at: string;
}

export type JurisdictionalLevel = "federal" | "state" | "local";

export type CivicPostStatus = "open" | "challenged" | "debating";

export type CivicStance = "Affirmative" | "Negative";

export interface CivicPost {
  id: string;
  author_id: string;
  district_id: string;
  claim: string;
  stance: string;
  argument: string;
  ideology_vector: IdeologyVector | string | null;
  status: CivicPostStatus | string;
  created_at: string;
}

export interface ElectionQuestion {
  id: string;
  election_id: string;
  author_id: string | null;
  prompt: string;
  jurisdictional_level: JurisdictionalLevel | string;
  primary_axis: string;
  applicable_ocd_ids: string[];
  information_gain_score: number | string;
  created_at: string;
}

export interface UserStance {
  id: string;
  user_id: string;
  question_id: string;
  election_id: string;
  position_score: number | string;
  position_label: string;
  primary_axis: string;
  created_at: string;
}

export type CoalitionMemberStatus = "pending" | "active";

export interface Coalition {
  id: string;
  name: string;
  charter_statement: string;
  founder_id: string;
  created_at: string;
}

export interface CoalitionMember {
  id: string;
  coalition_id: string;
  candidate_id: string;
  status: CoalitionMemberStatus | string;
  created_at: string;
}

export interface CoalitionEndorsement {
  id: string;
  endorser_id: string;
  endorsed_id: string;
  created_at: string;
}

export interface MatchedFeedPost {
  post_id?: string;
  id?: string;
  claim: string;
  argument: string;
  similarity: number | string;
}

export type PrimaryOpponentRow = {
  id: string;
  username: string;
  verification_tier: string | null;
  elo_rating: number;
  target_district_id: string | null;
  stance_vector: string | number[] | null;
  cosine_distance: number;
  similarity: number;
};

export type MatchedDistrictRow = {
  id: string;
  name: string;
  level: DistrictLevel | string;
  pvi_score: number | string | null;
  historical_lean: string | null;
  median_ideology_vector: IdeologyVector | string | null;
  zip_code: string | null;
  state: string | null;
  cosine_distance: number | string;
  similarity: number | string;
};

export type DebateCandidate = Pick<UserProfile, "id" | "username"> & {
  elo_rating?: number;
};

export type DebateWithCandidates = Debate & {
  candidate_a: DebateCandidate | DebateCandidate[] | null;
  candidate_b: DebateCandidate | DebateCandidate[] | null;
};

type DistrictRow = Omit<District, "median_ideology_vector"> & {
  median_ideology_vector: string | IdeologyVector | null;
};

type UserProfileRow = Omit<UserProfile, "ideology_vector"> & {
  ideology_vector: string | IdeologyVector | null;
};

type CandidateStatsRow = Omit<CandidateStats, "ideology_vector"> & {
  ideology_vector: string | IdeologyVector | null;
};

type CandidateRow = Omit<Candidate, "ideology_vector"> & {
  ideology_vector: string | IdeologyVector;
};

type DbFields<T> = { [K in keyof T]: T[K] };

type AsDbTable<
  T extends {
    Row: object;
    Insert: object;
    Update: object;
    Relationships: readonly unknown[];
  },
> = {
  Row: DbFields<T["Row"]>;
  Insert: DbFields<T["Insert"]>;
  Update: DbFields<T["Update"]>;
  Relationships: T["Relationships"];
};

/**
 * Supabase client generics require each table row to be a mapped type.
 * Interface-based rows collapse inserts to `never` and fail `next build`.
 */
export type AppDatabase = {
  public: {
    Tables: {
      [K in keyof Database["public"]["Tables"]]: AsDbTable<Database["public"]["Tables"][K]>;
    };
    Views: Database["public"]["Views"];
    Functions: Database["public"]["Functions"];
    Enums: Database["public"]["Enums"];
    CompositeTypes: Database["public"]["CompositeTypes"];
  };
};

export interface Database {
  public: {
    Tables: {
      districts: {
        Row: DistrictRow;
        Insert: Partial<DistrictRow> & Pick<DistrictRow, "name" | "level">;
        Update: Partial<DistrictRow>;
        Relationships: [];
      };
      users: {
        Row: UserProfileRow;
        Insert: Partial<UserProfileRow> & Pick<UserProfileRow, "id" | "username">;
        Update: Partial<UserProfileRow>;
        Relationships: [];
      };
      candidates: {
        Row: CandidateRow;
        Insert: Partial<CandidateRow> & Pick<CandidateRow, "id" | "display_name" | "ideology_vector">;
        Update: Partial<CandidateRow>;
        Relationships: [
          {
            foreignKeyName: "candidates_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      elections: {
        Row: Election;
        Insert: Partial<Election> & Pick<Election, "slug" | "office_name">;
        Update: Partial<Election>;
        Relationships: [
          {
            foreignKeyName: "elections_district_id_fkey";
            columns: ["district_id"];
            isOneToOne: false;
            referencedRelation: "districts";
            referencedColumns: ["id"];
          },
        ];
      };
      campaign_targets: {
        Row: CampaignTarget;
        Insert: Partial<CampaignTarget> &
          Pick<CampaignTarget, "user_id" | "election_id">;
        Update: Partial<CampaignTarget>;
        Relationships: [
          {
            foreignKeyName: "campaign_targets_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "campaign_targets_election_id_fkey";
            columns: ["election_id"];
            isOneToOne: false;
            referencedRelation: "elections";
            referencedColumns: ["id"];
          },
        ];
      };
      debates: {
        Row: Debate;
        Insert: Partial<Debate> & Pick<Debate, "topic">;
        Update: Partial<Debate>;
        Relationships: [
          {
            foreignKeyName: "debates_district_id_fkey";
            columns: ["district_id"];
            isOneToOne: false;
            referencedRelation: "districts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "debates_election_id_fkey";
            columns: ["election_id"];
            isOneToOne: false;
            referencedRelation: "elections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "debates_candidate_a_id_fkey";
            columns: ["candidate_a_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "debates_candidate_b_id_fkey";
            columns: ["candidate_b_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      arguments: {
        Row: Argument;
        Insert: Partial<Argument> &
          Pick<Argument, "debate_id" | "author_id" | "round_number" | "content">;
        Update: Partial<Argument>;
        Relationships: [
          {
            foreignKeyName: "arguments_debate_id_fkey";
            columns: ["debate_id"];
            isOneToOne: false;
            referencedRelation: "debates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "arguments_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      debate_evaluations: {
        Row: DebateEvaluation;
        Insert: Partial<DebateEvaluation> &
          Pick<
            DebateEvaluation,
            "debate_id" | "candidate_id" | "primary_score" | "confidence_score"
          >;
        Update: Partial<DebateEvaluation>;
        Relationships: [
          {
            foreignKeyName: "debate_evaluations_debate_id_fkey";
            columns: ["debate_id"];
            isOneToOne: false;
            referencedRelation: "debates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "debate_evaluations_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      jury_appeals: {
        Row: JuryAppeal;
        Insert: Partial<JuryAppeal> &
          Pick<JuryAppeal, "debate_id" | "voter_id" | "vote_direction">;
        Update: Partial<JuryAppeal>;
        Relationships: [
          {
            foreignKeyName: "jury_appeals_debate_id_fkey";
            columns: ["debate_id"];
            isOneToOne: false;
            referencedRelation: "debates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "jury_appeals_voter_id_fkey";
            columns: ["voter_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      votes: {
        Row: Vote;
        Insert: Partial<Vote> & Pick<Vote, "debate_id" | "voter_id" | "candidate_id">;
        Update: Partial<Vote>;
        Relationships: [
          {
            foreignKeyName: "votes_debate_id_fkey";
            columns: ["debate_id"];
            isOneToOne: false;
            referencedRelation: "debates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "votes_voter_id_fkey";
            columns: ["voter_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "votes_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      comments: {
        Row: Comment;
        Insert: Partial<Comment> & Pick<Comment, "debate_id" | "author_id" | "body">;
        Update: Partial<Comment>;
        Relationships: [
          {
            foreignKeyName: "comments_debate_id_fkey";
            columns: ["debate_id"];
            isOneToOne: false;
            referencedRelation: "debates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      pledges: {
        Row: Pledge;
        Insert: Partial<Pledge> & Pick<Pledge, "candidate_id" | "amount">;
        Update: Partial<Pledge>;
        Relationships: [
          {
            foreignKeyName: "pledges_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pledges_donor_id_fkey";
            columns: ["donor_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      campaign_pledges: {
        Row: CampaignPledge;
        Insert: Partial<CampaignPledge> &
          Pick<
            CampaignPledge,
            "donor_id" | "candidate_id" | "election_id" | "amount" | "stripe_customer_id"
          >;
        Update: Partial<CampaignPledge>;
        Relationships: [
          {
            foreignKeyName: "campaign_pledges_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "campaign_pledges_election_id_fkey";
            columns: ["election_id"];
            isOneToOne: false;
            referencedRelation: "elections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "campaign_pledges_debate_id_fkey";
            columns: ["debate_id"];
            isOneToOne: false;
            referencedRelation: "debates";
            referencedColumns: ["id"];
          },
        ];
      };
      escrow_pledges: {
        Row: EscrowPledge;
        Insert: Partial<EscrowPledge> &
          Pick<
            EscrowPledge,
            | "voter_id"
            | "election_id"
            | "pledged_amount"
            | "stripe_setup_intent_id"
            | "stripe_customer_id"
          >;
        Update: Partial<EscrowPledge>;
        Relationships: [
          {
            foreignKeyName: "escrow_pledges_voter_id_fkey";
            columns: ["voter_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "escrow_pledges_election_id_fkey";
            columns: ["election_id"];
            isOneToOne: false;
            referencedRelation: "elections";
            referencedColumns: ["id"];
          },
        ];
      };
      tier2_verifications: {
        Row: Tier2Verification;
        Insert: Partial<Tier2Verification> &
          Pick<Tier2Verification, "user_id" | "verified_address" | "ocd_ids">;
        Update: Partial<Tier2Verification>;
        Relationships: [
          {
            foreignKeyName: "tier2_verifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      election_questions: {
        Row: ElectionQuestion;
        Insert: Partial<ElectionQuestion> &
          Pick<
            ElectionQuestion,
            "election_id" | "prompt" | "jurisdictional_level" | "primary_axis"
          >;
        Update: Partial<ElectionQuestion>;
        Relationships: [
          {
            foreignKeyName: "election_questions_election_id_fkey";
            columns: ["election_id"];
            isOneToOne: false;
            referencedRelation: "elections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "election_questions_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      user_stances: {
        Row: UserStance;
        Insert: Partial<UserStance> &
          Pick<
            UserStance,
            | "user_id"
            | "question_id"
            | "election_id"
            | "position_score"
            | "position_label"
            | "primary_axis"
          >;
        Update: Partial<UserStance>;
        Relationships: [
          {
            foreignKeyName: "user_stances_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_stances_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "election_questions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_stances_election_id_fkey";
            columns: ["election_id"];
            isOneToOne: false;
            referencedRelation: "elections";
            referencedColumns: ["id"];
          },
        ];
      };
      civic_posts: {
        Row: CivicPost;
        Insert: Partial<CivicPost> &
          Pick<CivicPost, "author_id" | "district_id" | "claim" | "stance" | "argument">;
        Update: Partial<CivicPost>;
        Relationships: [
          {
            foreignKeyName: "civic_posts_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      electability_scores: {
        Row: ElectabilityScore;
        Insert: Partial<Omit<ElectabilityScore, "electability_multiplier">> &
          Pick<ElectabilityScore, "user_id" | "district_id">;
        Update: Partial<
          Omit<ElectabilityScore, "electability_multiplier" | "id" | "user_id" | "district_id">
        >;
        Relationships: [
          {
            foreignKeyName: "electability_scores_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "electability_scores_district_id_fkey";
            columns: ["district_id"];
            isOneToOne: false;
            referencedRelation: "districts";
            referencedColumns: ["id"];
          },
        ];
      };
      election_requirements: {
        Row: ElectionRequirement;
        Insert: Partial<ElectionRequirement> &
          Pick<
            ElectionRequirement,
            "election_id" | "state" | "office" | "residency_deadline" | "filing_deadline"
          >;
        Update: Partial<ElectionRequirement>;
        Relationships: [
          {
            foreignKeyName: "election_requirements_election_id_fkey";
            columns: ["election_id"];
            isOneToOne: true;
            referencedRelation: "districts";
            referencedColumns: ["id"];
          },
        ];
      };
      coalitions: {
        Row: Coalition;
        Insert: Partial<Coalition> &
          Pick<Coalition, "name" | "charter_statement" | "founder_id">;
        Update: Partial<Coalition>;
        Relationships: [
          {
            foreignKeyName: "coalitions_founder_id_fkey";
            columns: ["founder_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      coalition_members: {
        Row: CoalitionMember;
        Insert: Partial<CoalitionMember> &
          Pick<CoalitionMember, "coalition_id" | "candidate_id">;
        Update: Partial<CoalitionMember>;
        Relationships: [
          {
            foreignKeyName: "coalition_members_coalition_id_fkey";
            columns: ["coalition_id"];
            isOneToOne: false;
            referencedRelation: "coalitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "coalition_members_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      coalition_endorsements: {
        Row: CoalitionEndorsement;
        Insert: Partial<CoalitionEndorsement> &
          Pick<CoalitionEndorsement, "endorser_id" | "endorsed_id">;
        Update: Partial<CoalitionEndorsement>;
        Relationships: [
          {
            foreignKeyName: "coalition_endorsements_endorser_id_fkey";
            columns: ["endorser_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "coalition_endorsements_endorsed_id_fkey";
            columns: ["endorsed_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      candidate_stats: {
        Row: CandidateStatsRow;
        Insert: Partial<CandidateStatsRow>;
        Update: Partial<CandidateStatsRow>;
        Relationships: [];
      };
    };
    Functions: {
      calculate_debate_winner: {
        Args: { debate_uuid: string };
        Returns: string | null;
      };
      calculate_electability: {
        Args: { p_user_id: string; p_district_id: string };
        Returns: number | string;
      };
      complete_expired_debates: {
        Args: Record<PropertyKey, never>;
        Returns: { debate_id: string; winner_id: string | null }[];
      };
      apply_debate_elo: {
        Args: { debate_uuid: string };
        Returns: undefined;
      };
      lock_arbitration_elo: {
        Args: { p_debate_id: string; p_candidate_id: string };
        Returns: { elo_rating: number; locked: boolean }[];
      };
      normalize_zip: {
        Args: { value: string };
        Returns: string | null;
      };
      get_matched_feed: {
        Args: {
          viewer_embedding: string;
          target_district: string;
          match_count: number;
        };
        Returns: MatchedFeedPost[];
      };
      find_primary_opponents: {
        Args: {
          p_user_id: string;
          match_count?: number;
        };
        Returns: PrimaryOpponentRow[];
      };
      match_districts: {
        Args: {
          query_embedding: string;
          match_threshold: number;
          match_count: number;
        };
        Returns: MatchedDistrictRow[];
      };
      calculate_user_compatibility: {
        Args: { user_a: string; user_b: string };
        Returns: number | null;
      };
      update_ideology_vector_ema: {
        Args: {
          p_user_id: string;
          p_stance_vector: string;
          p_alpha?: number;
        };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
