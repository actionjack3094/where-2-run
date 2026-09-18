export type IdeologyVector = number[];

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
  created_at: string;
}

export interface Vote {
  id: string;
  debate_id: string;
  voter_id: string;
  candidate_id: string;
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
  created_at: string;
  updated_at: string;
  total_votes: number;
  debates_won: number;
  debates_played: number;
  win_percentage: number;
}

export type DebateCandidate = Pick<UserProfile, "id" | "username">;

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
      complete_expired_debates: {
        Args: Record<PropertyKey, never>;
        Returns: { debate_id: string; winner_id: string | null }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
