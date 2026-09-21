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
  topic: string;
  candidate_a_id: string | null;
  candidate_b_id: string | null;
  status: DebateStatus | string;
  current_round: number;
  expires_at: string;
  elo_applied_at: string | null;
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
        Relationships: [
          {
            foreignKeyName: "users_target_district_id_fkey";
            columns: ["target_district_id"];
            isOneToOne: false;
            referencedRelation: "districts";
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
    };
    Views: {
      candidate_stats: {
        Row: CandidateStatsRow;
        Insert: Partial<CandidateStatsRow>;
        Update: Partial<CandidateStatsRow>;
        Relationships: [
          {
            foreignKeyName: "users_target_district_id_fkey";
            columns: ["target_district_id"];
            isOneToOne: false;
            referencedRelation: "districts";
            referencedColumns: ["id"];
          },
        ];
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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
