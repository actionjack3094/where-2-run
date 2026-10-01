export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      arbitration_cases: {
        Row: {
          debate_id: string
          holds_elo: boolean
          id: string
          kind: string
          opened_at: string
          report_id: string | null
          resolution_note: string | null
          resolved_at: string | null
          reviewer_id: string | null
          status: string
        }
        Insert: {
          debate_id: string
          holds_elo?: boolean
          id?: string
          kind: string
          opened_at?: string
          report_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          reviewer_id?: string | null
          status?: string
        }
        Update: {
          debate_id?: string
          holds_elo?: boolean
          id?: string
          kind?: string
          opened_at?: string
          report_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          reviewer_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "arbitration_cases_debate_id_fkey"
            columns: ["debate_id"]
            isOneToOne: false
            referencedRelation: "debates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arbitration_cases_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "community_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arbitration_cases_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "candidate_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arbitration_cases_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      arguments: {
        Row: {
          author_id: string
          consistency_critique: string | null
          consistency_score: number | null
          content: string
          created_at: string
          debate_id: string
          graded_at: string | null
          id: string
          round_number: number
        }
        Insert: {
          author_id: string
          consistency_critique?: string | null
          consistency_score?: number | null
          content: string
          created_at?: string
          debate_id: string
          graded_at?: string | null
          id?: string
          round_number: number
        }
        Update: {
          author_id?: string
          consistency_critique?: string | null
          consistency_score?: number | null
          content?: string
          created_at?: string
          debate_id?: string
          graded_at?: string | null
          id?: string
          round_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "arguments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "candidate_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arguments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arguments_debate_id_fkey"
            columns: ["debate_id"]
            isOneToOne: false
            referencedRelation: "debates"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_pledges: {
        Row: {
          amount: number
          candidate_id: string
          created_at: string
          debate_id: string | null
          disbursed_at: string | null
          donor_id: string
          election_id: string
          id: string
          status: string
          stripe_customer_id: string | null
          stripe_payment_method_id: string | null
          stripe_session_id: string | null
          stripe_setup_intent_id: string | null
          unlock_condition: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          candidate_id: string
          created_at?: string
          debate_id?: string | null
          disbursed_at?: string | null
          donor_id: string
          election_id: string
          id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          stripe_session_id?: string | null
          stripe_setup_intent_id?: string | null
          unlock_condition?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          candidate_id?: string
          created_at?: string
          debate_id?: string | null
          disbursed_at?: string | null
          donor_id?: string
          election_id?: string
          id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          stripe_session_id?: string | null
          stripe_setup_intent_id?: string | null
          unlock_condition?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_pledges_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidate_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_pledges_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_pledges_debate_id_fkey"
            columns: ["debate_id"]
            isOneToOne: false
            referencedRelation: "debates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_pledges_election_id_fkey"
            columns: ["election_id"]
            isOneToOne: false
            referencedRelation: "elections"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_targets: {
        Row: {
          alignment_streak: number
          candidacy_document_url: string | null
          committee_name: string | null
          created_at: string
          donation_url: string | null
          election_id: string
          escrow_status: string
          id: string
          is_locked: boolean
          official_candidate_id: string | null
          pledged_escrow: number
          status: string
          user_id: string
        }
        Insert: {
          alignment_streak?: number
          candidacy_document_url?: string | null
          committee_name?: string | null
          created_at?: string
          donation_url?: string | null
          election_id: string
          escrow_status?: string
          id?: string
          is_locked?: boolean
          official_candidate_id?: string | null
          pledged_escrow?: number
          status?: string
          user_id: string
        }
        Update: {
          alignment_streak?: number
          candidacy_document_url?: string | null
          committee_name?: string | null
          created_at?: string
          donation_url?: string | null
          election_id?: string
          escrow_status?: string
          id?: string
          is_locked?: boolean
          official_candidate_id?: string | null
          pledged_escrow?: number
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_targets_election_id_fkey"
            columns: ["election_id"]
            isOneToOne: false
            referencedRelation: "elections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_targets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "candidate_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_targets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          bio: string | null
          claimed_by: string | null
          created_at: string
          display_name: string
          id: string
          ideology_vector: string | null
          office_sought: string | null
          onboarding_completed: boolean
          pac_agreement_accepted: boolean
          pac_agreement_accepted_at: string | null
          residency_state: string | null
          updated_at: string
        }
        Insert: {
          bio?: string | null
          claimed_by?: string | null
          created_at?: string
          display_name: string
          id: string
          ideology_vector?: string | null
          office_sought?: string | null
          onboarding_completed?: boolean
          pac_agreement_accepted?: boolean
          pac_agreement_accepted_at?: string | null
          residency_state?: string | null
          updated_at?: string
        }
        Update: {
          bio?: string | null
          claimed_by?: string | null
          created_at?: string
          display_name?: string
          id?: string
          ideology_vector?: string | null
          office_sought?: string | null
          onboarding_completed?: boolean
          pac_agreement_accepted?: boolean
          pac_agreement_accepted_at?: string | null
          residency_state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidates_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "candidate_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidates_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidates_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "candidate_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidates_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          club_rank_points: number | null
          created_at: string | null
          id: string
          logo_url: string | null
          manager_id: string
          name: string
          primary_color: string | null
          secondary_color: string | null
          tag: string
          tier: string | null
        }
        Insert: {
          club_rank_points?: number | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          manager_id: string
          name: string
          primary_color?: string | null
          secondary_color?: string | null
          tag: string
          tier?: string | null
        }
        Update: {
          club_rank_points?: number | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          manager_id?: string
          name?: string
          primary_color?: string | null
          secondary_color?: string | null
          tag?: string
          tier?: string | null
        }
        Relationships: []
      }
      coalition_endorsements: {
        Row: {
          created_at: string
          endorsed_id: string
          endorser_id: string
          id: string
        }
        Insert: {
          created_at?: string
          endorsed_id: string
          endorser_id: string
          id?: string
        }
        Update: {
          created_at?: string
          endorsed_id?: string
          endorser_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coalition_endorsements_endorsed_id_fkey"
            columns: ["endorsed_id"]
            isOneToOne: false
            referencedRelation: "candidate_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coalition_endorsements_endorsed_id_fkey"
            columns: ["endorsed_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coalition_endorsements_endorser_id_fkey"
            columns: ["endorser_id"]
            isOneToOne: false
            referencedRelation: "candidate_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coalition_endorsements_endorser_id_fkey"
            columns: ["endorser_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      coalition_members: {
        Row: {
          candidate_id: string
          coalition_id: string
          created_at: string
          id: string
          status: string
        }
        Insert: {
          candidate_id: string
          coalition_id: string
          created_at?: string
          id?: string
          status?: string
        }
        Update: {
          candidate_id?: string
          coalition_id?: string
          created_at?: string
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "coalition_members_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidate_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coalition_members_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coalition_members_coalition_id_fkey"
            columns: ["coalition_id"]
            isOneToOne: false
            referencedRelation: "coalitions"
            referencedColumns: ["id"]
          },
        ]
      }
      coalitions: {
        Row: {
          charter_statement: string
          created_at: string
          founder_id: string
          id: string
          name: string
        }
        Insert: {
          charter_statement: string
          created_at?: string
          founder_id: string
          id?: string
          name: string
        }
        Update: {
          charter_statement?: string
          created_at?: string
          founder_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "coalitions_founder_id_fkey"
            columns: ["founder_id"]
            isOneToOne: false
            referencedRelation: "candidate_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coalitions_founder_id_fkey"
            columns: ["founder_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          ai_stance_score: number | null
          author_id: string
          body: string
          created_at: string
          debate_id: string
          id: string
        }
        Insert: {
          ai_stance_score?: number | null
          author_id: string
          body: string
          created_at?: string
          debate_id: string
          id?: string
        }
        Update: {
          ai_stance_score?: number | null
          author_id?: string
          body?: string
          created_at?: string
          debate_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "candidate_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_debate_id_fkey"
            columns: ["debate_id"]
            isOneToOne: false
            referencedRelation: "debates"
            referencedColumns: ["id"]
          },
        ]
      }
      community_reports: {
        Row: {
          argument_id: string | null
          created_at: string
          debate_id: string
          id: string
          note: string | null
          reason: string
          reporter_id: string
          status: string
          target_kind: string
          vote_id: string | null
        }
        Insert: {
          argument_id?: string | null
          created_at?: string
          debate_id: string
          id?: string
          note?: string | null
          reason: string
          reporter_id: string
          status?: string
          target_kind: string
          vote_id?: string | null
        }
        Update: {
          argument_id?: string | null
          created_at?: string
          debate_id?: string
          id?: string
          note?: string | null
          reason?: string
          reporter_id?: string
          status?: string
          target_kind?: string
          vote_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_reports_argument_id_fkey"
            columns: ["argument_id"]
            isOneToOne: false
            referencedRelation: "arguments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_reports_debate_id_fkey"
            columns: ["debate_id"]
            isOneToOne: false
            referencedRelation: "debates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "candidate_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_reports_vote_id_fkey"
            columns: ["vote_id"]
            isOneToOne: false
            referencedRelation: "votes"
            referencedColumns: ["id"]
          },
        ]
      }
      debate_evaluations: {
        Row: {
          addendum_text: string | null
          candidate_id: string
          confidence_score: number
          created_at: string
          debate_id: string
          elo_rating: number | null
          ensemble_result: boolean | null
          id: string
          primary_score: number
          rubric_flag: string | null
          status: string
          updated_at: string
        }
        Insert: {
          addendum_text?: string | null
          candidate_id: string
          confidence_score: number
          created_at?: string
          debate_id: string
          elo_rating?: number | null
          ensemble_result?: boolean | null
          id?: string
          primary_score: number
          rubric_flag?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          addendum_text?: string | null
          candidate_id?: string
          confidence_score?: number
          created_at?: string
          debate_id?: string
          elo_rating?: number | null
          ensemble_result?: boolean | null
          id?: string
          primary_score?: number
          rubric_flag?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "debate_evaluations_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidate_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debate_evaluations_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debate_evaluations_debate_id_fkey"
            columns: ["debate_id"]
            isOneToOne: false
            referencedRelation: "debates"
            referencedColumns: ["id"]
          },
        ]
      }
      debate_votes: {
        Row: {
          created_at: string | null
          debate_id: string
          id: string
          spectator_id: string
          voted_for_user_id: string
        }
        Insert: {
          created_at?: string | null
          debate_id: string
          id?: string
          spectator_id: string
          voted_for_user_id: string
        }
        Update: {
          created_at?: string | null
          debate_id?: string
          id?: string
          spectator_id?: string
          voted_for_user_id?: string
        }
        Relationships: []
      }
      debates: {
        Row: {
          candidate_a_argument: string | null
          candidate_a_id: string | null
          candidate_a_votes: number
          candidate_a_weighted_votes: number
          candidate_b_argument: string | null
          candidate_b_id: string | null
          candidate_b_votes: number
          candidate_b_weighted_votes: number
          created_at: string
          current_round: number
          district_id: string | null
          election_id: string | null
          election_question_id: string | null
          elo_applied_at: string | null
          expires_at: string
          id: string
          status: string
          topic: string
          winner_id: string | null
        }
        Insert: {
          candidate_a_argument?: string | null
          candidate_a_id?: string | null
          candidate_a_votes?: number
          candidate_a_weighted_votes?: number
          candidate_b_argument?: string | null
          candidate_b_id?: string | null
          candidate_b_votes?: number
          candidate_b_weighted_votes?: number
          created_at?: string
          current_round?: number
          district_id?: string | null
          election_id?: string | null
          election_question_id?: string | null
          elo_applied_at?: string | null
          expires_at?: string
          id?: string
          status?: string
          topic: string
          winner_id?: string | null
        }
        Update: {
          candidate_a_argument?: string | null
          candidate_a_id?: string | null
          candidate_a_votes?: number
          candidate_a_weighted_votes?: number
          candidate_b_argument?: string | null
          candidate_b_id?: string | null
          candidate_b_votes?: number
          candidate_b_weighted_votes?: number
          created_at?: string
          current_round?: number
          district_id?: string | null
          election_id?: string | null
          election_question_id?: string | null
          elo_applied_at?: string | null
          expires_at?: string
          id?: string
          status?: string
          topic?: string
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debates_candidate_a_id_fkey"
            columns: ["candidate_a_id"]
            isOneToOne: false
            referencedRelation: "candidate_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debates_candidate_a_id_fkey"
            columns: ["candidate_a_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debates_candidate_b_id_fkey"
            columns: ["candidate_b_id"]
            isOneToOne: false
            referencedRelation: "candidate_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debates_candidate_b_id_fkey"
            columns: ["candidate_b_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debates_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debates_election_id_fkey"
            columns: ["election_id"]
            isOneToOne: false
            referencedRelation: "elections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debates_election_question_id_fkey"
            columns: ["election_question_id"]
            isOneToOne: false
            referencedRelation: "election_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debates_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "candidate_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debates_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      districts: {
        Row: {
          created_at: string
          historical_lean: string | null
          id: string
          level: string
          median_ideology_vector: string | null
          name: string
          ocd_id: string | null
          pvi_score: number | null
          state: string | null
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          created_at?: string
          historical_lean?: string | null
          id?: string
          level: string
          median_ideology_vector?: string | null
          name: string
          ocd_id?: string | null
          pvi_score?: number | null
          state?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          created_at?: string
          historical_lean?: string | null
          id?: string
          level?: string
          median_ideology_vector?: string | null
          name?: string
          ocd_id?: string | null
          pvi_score?: number | null
          state?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: []
      }
      electability_scores: {
        Row: {
          created_at: string
          debate_win_rate: number
          district_id: string
          electability_multiplier: number | null
          id: string
          ideological_match_pct: number
          legal_eligibility_integer: number
          total_escrow_pledged: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          debate_win_rate?: number
          district_id: string
          electability_multiplier?: number | null
          id?: string
          ideological_match_pct?: number
          legal_eligibility_integer?: number
          total_escrow_pledged?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          debate_win_rate?: number
          district_id?: string
          electability_multiplier?: number | null
          id?: string
          ideological_match_pct?: number
          legal_eligibility_integer?: number
          total_escrow_pledged?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "electability_scores_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "electability_scores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "candidate_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "electability_scores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      election_cycles: {
        Row: {
          election_day: string
          election_id: string | null
          external_id: string
          id: string
          level: string
          name: string
          ocd_id: string
          raw: Json
          source: string
          synced_at: string
        }
        Insert: {
          election_day: string
          election_id?: string | null
          external_id: string
          id?: string
          level: string
          name: string
          ocd_id: string
          raw?: Json
          source: string
          synced_at?: string
        }
        Update: {
          election_day?: string
          election_id?: string | null
          external_id?: string
          id?: string
          level?: string
          name?: string
          ocd_id?: string
          raw?: Json
          source?: string
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "election_cycles_election_id_fkey"
            columns: ["election_id"]
            isOneToOne: false
            referencedRelation: "elections"
            referencedColumns: ["id"]
          },
        ]
      }
      election_questions: {
        Row: {
          applicable_ocd_ids: Json
          author_id: string | null
          created_at: string
          election_id: string
          id: string
          information_gain_score: number
          jurisdictional_level: string
          primary_axis: string
          prompt: string
        }
        Insert: {
          applicable_ocd_ids?: Json
          author_id?: string | null
          created_at?: string
          election_id: string
          id?: string
          information_gain_score?: number
          jurisdictional_level: string
          primary_axis: string
          prompt: string
        }
        Update: {
          applicable_ocd_ids?: Json
          author_id?: string | null
          created_at?: string
          election_id?: string
          id?: string
          information_gain_score?: number
          jurisdictional_level?: string
          primary_axis?: string
          prompt?: string
        }
        Relationships: [
          {
            foreignKeyName: "election_questions_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "candidate_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "election_questions_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "election_questions_election_id_fkey"
            columns: ["election_id"]
            isOneToOne: false
            referencedRelation: "elections"
            referencedColumns: ["id"]
          },
        ]
      }
      election_requirements: {
        Row: {
          created_at: string
          election_id: string
          escrow_goal: number
          filing_deadline: string
          id: string
          office: string
          residency_deadline: string
          state: string
        }
        Insert: {
          created_at?: string
          election_id: string
          escrow_goal?: number
          filing_deadline: string
          id?: string
          office: string
          residency_deadline: string
          state: string
        }
        Update: {
          created_at?: string
          election_id?: string
          escrow_goal?: number
          filing_deadline?: string
          id?: string
          office?: string
          residency_deadline?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "election_requirements_election_id_fkey"
            columns: ["election_id"]
            isOneToOne: true
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
        ]
      }
      elections: {
        Row: {
          created_at: string
          district_id: string | null
          election_date: string | null
          filing_requirements: Json
          general_vector: string | null
          id: string
          incumbent_name: string | null
          median_voter_vector: string | null
          ocd_id: string | null
          office_name: string
          primary_dem_vector: string | null
          primary_rep_vector: string | null
          pvi_score: number | null
          residency_requirement_days: number | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          district_id?: string | null
          election_date?: string | null
          filing_requirements?: Json
          general_vector?: string | null
          id?: string
          incumbent_name?: string | null
          median_voter_vector?: string | null
          ocd_id?: string | null
          office_name: string
          primary_dem_vector?: string | null
          primary_rep_vector?: string | null
          pvi_score?: number | null
          residency_requirement_days?: number | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          district_id?: string | null
          election_date?: string | null
          filing_requirements?: Json
          general_vector?: string | null
          id?: string
          incumbent_name?: string | null
          median_voter_vector?: string | null
          ocd_id?: string | null
          office_name?: string
          primary_dem_vector?: string | null
          primary_rep_vector?: string | null
          pvi_score?: number | null
          residency_requirement_days?: number | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "elections_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
        ]
      }
      escrow_pledges: {
        Row: {
          created_at: string
          election_id: string
          id: string
          mandate_accepted_at: string
          pledged_amount: number
          status: string
          stripe_customer_id: string
          stripe_payment_method_id: string | null
          stripe_setup_intent_id: string
          updated_at: string
          voter_id: string
        }
        Insert: {
          created_at?: string
          election_id: string
          id?: string
          mandate_accepted_at: string
          pledged_amount: number
          status?: string
          stripe_customer_id: string
          stripe_payment_method_id?: string | null
          stripe_setup_intent_id: string
          updated_at?: string
          voter_id: string
        }
        Update: {
          created_at?: string
          election_id?: string
          id?: string
          mandate_accepted_at?: string
          pledged_amount?: number
          status?: string
          stripe_customer_id?: string
          stripe_payment_method_id?: string | null
          stripe_setup_intent_id?: string
          updated_at?: string
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "escrow_pledges_election_id_fkey"
            columns: ["election_id"]
            isOneToOne: false
            referencedRelation: "elections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_pledges_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "candidate_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_pledges_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      gear_items: {
        Row: {
          category: string
          id: string
          name: string
          price: number
          stat_bonus: string
          unlocked: boolean
        }
        Insert: {
          category: string
          id?: string
          name: string
          price: number
          stat_bonus: string
          unlocked?: boolean
        }
        Update: {
          category?: string
          id?: string
          name?: string
          price?: number
          stat_bonus?: string
          unlocked?: boolean
        }
        Relationships: []
      }
      jury_verdicts: {
        Row: {
          appeal_id: string
          created_at: string
          id: string
          juror_id: string
          overturned: boolean
        }
        Insert: {
          appeal_id: string
          created_at?: string
          id?: string
          juror_id: string
          overturned: boolean
        }
        Update: {
          appeal_id?: string
          created_at?: string
          id?: string
          juror_id?: string
          overturned?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "jury_verdicts_juror_id_fkey"
            columns: ["juror_id"]
            isOneToOne: false
            referencedRelation: "candidate_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jury_verdicts_juror_id_fkey"
            columns: ["juror_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      match_stats: {
        Row: {
          assists: number | null
          blocks: number | null
          created_at: string | null
          game_id: string | null
          id: string
          is_win: boolean | null
          player_id: string | null
          points: number | null
          rebounds: number | null
          steals: number | null
        }
        Insert: {
          assists?: number | null
          blocks?: number | null
          created_at?: string | null
          game_id?: string | null
          id?: string
          is_win?: boolean | null
          player_id?: string | null
          points?: number | null
          rebounds?: number | null
          steals?: number | null
        }
        Update: {
          assists?: number | null
          blocks?: number | null
          created_at?: string | null
          game_id?: string | null
          id?: string
          is_win?: boolean | null
          player_id?: string | null
          points?: number | null
          rebounds?: number | null
          steals?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "match_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          created_at: string
          id: string
          opponent: string
          points: number
          profile_id: string | null
          rebounds: number
          result: string
          score: string
          tokens_earned: number
          two_pointers: number
        }
        Insert: {
          created_at?: string
          id?: string
          opponent: string
          points?: number
          profile_id?: string | null
          rebounds?: number
          result: string
          score: string
          tokens_earned?: number
          two_pointers?: number
        }
        Update: {
          created_at?: string
          id?: string
          opponent?: string
          points?: number
          profile_id?: string | null
          rebounds?: number
          result?: string
          score?: string
          tokens_earned?: number
          two_pointers?: number
        }
        Relationships: []
      }
      notification_dispatches: {
        Row: {
          debate_id: string | null
          id: string
          kind: string
          ocd_id: string | null
          recipient_id: string
          sent_at: string
        }
        Insert: {
          debate_id?: string | null
          id?: string
          kind: string
          ocd_id?: string | null
          recipient_id: string
          sent_at?: string
        }
        Update: {
          debate_id?: string | null
          id?: string
          kind?: string
          ocd_id?: string | null
          recipient_id?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_dispatches_debate_id_fkey"
            columns: ["debate_id"]
            isOneToOne: false
            referencedRelation: "debates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_dispatches_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "candidate_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_dispatches_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          club_id: string
          contract_tournaments: number | null
          created_at: string | null
          id: string
          manager_id: string
          player_id: string
          proposed_prize_share: number
          proposed_role: string | null
          status: string | null
        }
        Insert: {
          club_id: string
          contract_tournaments?: number | null
          created_at?: string | null
          id?: string
          manager_id: string
          player_id: string
          proposed_prize_share: number
          proposed_role?: string | null
          status?: string | null
        }
        Update: {
          club_id?: string
          contract_tournaments?: number | null
          created_at?: string | null
          id?: string
          manager_id?: string
          player_id?: string
          proposed_prize_share?: number
          proposed_role?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offers_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      player_combines: {
        Row: {
          created_at: string | null
          id: string
          media_url: string
          metric_value: string
          player_id: string | null
          status: Database["public"]["Enums"]["verification_status"] | null
          test_type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          media_url: string
          metric_value: string
          player_id?: string | null
          status?: Database["public"]["Enums"]["verification_status"] | null
          test_type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          media_url?: string
          metric_value?: string
          player_id?: string | null
          status?: Database["public"]["Enums"]["verification_status"] | null
          test_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_combines_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pledges: {
        Row: {
          amount: number
          candidate_id: string
          created_at: string
          donor_id: string | null
          donor_name: string
          id: string
          message: string | null
        }
        Insert: {
          amount: number
          candidate_id: string
          created_at?: string
          donor_id?: string | null
          donor_name?: string
          id?: string
          message?: string | null
        }
        Update: {
          amount?: number
          candidate_id?: string
          created_at?: string
          donor_id?: string | null
          donor_name?: string
          id?: string
          message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pledges_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidate_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pledges_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          club_name: string
          created_at: string
          current_club_id: string | null
          email: string | null
          full_name: string | null
          gm_fee_percentage: number | null
          id: string
          identity_verified_at: string | null
          perk_badges: Json | null
          player_name: string
          ranking_points: number | null
          stripe_account_id: string | null
          stripe_identity_session_id: string | null
          stripe_onboarding_complete: boolean
          tier2_status: string
          token_balance: number
          transfer_status: string | null
          updated_at: string | null
          user_role: string | null
          verification_tier: string | null
        }
        Insert: {
          club_name?: string
          created_at?: string
          current_club_id?: string | null
          email?: string | null
          full_name?: string | null
          gm_fee_percentage?: number | null
          id?: string
          identity_verified_at?: string | null
          perk_badges?: Json | null
          player_name?: string
          ranking_points?: number | null
          stripe_account_id?: string | null
          stripe_identity_session_id?: string | null
          stripe_onboarding_complete?: boolean
          tier2_status?: string
          token_balance?: number
          transfer_status?: string | null
          updated_at?: string | null
          user_role?: string | null
          verification_tier?: string | null
        }
        Update: {
          club_name?: string
          created_at?: string
          current_club_id?: string | null
          email?: string | null
          full_name?: string | null
          gm_fee_percentage?: number | null
          id?: string
          identity_verified_at?: string | null
          perk_badges?: Json | null
          player_name?: string
          ranking_points?: number | null
          stripe_account_id?: string | null
          stripe_identity_session_id?: string | null
          stripe_onboarding_complete?: boolean
          tier2_status?: string
          token_balance?: number
          transfer_status?: string | null
          updated_at?: string | null
          user_role?: string | null
          verification_tier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_current_club_id_fkey"
            columns: ["current_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      squad_contracts: {
        Row: {
          club_id: string | null
          contract_tournaments_remaining: number | null
          created_at: string | null
          gm_management_fee: number | null
          id: string
          player_name: string
          prize_share: number | null
          role: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          club_id?: string | null
          contract_tournaments_remaining?: number | null
          created_at?: string | null
          gm_management_fee?: number | null
          id?: string
          player_name: string
          prize_share?: number | null
          role?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          club_id?: string | null
          contract_tournaments_remaining?: number | null
          created_at?: string | null
          gm_management_fee?: number | null
          id?: string
          player_name?: string
          prize_share?: number | null
          role?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "squad_contracts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      team_contracts: {
        Row: {
          id: string
          player_id: string | null
          prize_share_percentage: number | null
          role: string | null
          signed_at: string | null
          status: string | null
          team_id: string
        }
        Insert: {
          id?: string
          player_id?: string | null
          prize_share_percentage?: number | null
          role?: string | null
          signed_at?: string | null
          status?: string | null
          team_id: string
        }
        Update: {
          id?: string
          player_id?: string | null
          prize_share_percentage?: number | null
          role?: string | null
          signed_at?: string | null
          status?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_contracts_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tier2_verification_requests: {
        Row: {
          created_at: string
          document_type: string
          id: string
          ocd_id: string
          reviewed_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          document_type: string
          id?: string
          ocd_id: string
          reviewed_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          document_type?: string
          id?: string
          ocd_id?: string
          reviewed_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tier2_verification_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "candidate_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tier2_verification_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tier3_verifications: {
        Row: {
          ballot_cross_reference: Json
          ballot_name: string | null
          ballot_ocd_id: string | null
          ballot_source: string | null
          claim_status: string
          claimed_candidate_id: string | null
          created_at: string
          government_id_reference: string | null
          government_id_status: string
          reviewed_at: string | null
          submitted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ballot_cross_reference?: Json
          ballot_name?: string | null
          ballot_ocd_id?: string | null
          ballot_source?: string | null
          claim_status?: string
          claimed_candidate_id?: string | null
          created_at?: string
          government_id_reference?: string | null
          government_id_status?: string
          reviewed_at?: string | null
          submitted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ballot_cross_reference?: Json
          ballot_name?: string | null
          ballot_ocd_id?: string | null
          ballot_source?: string | null
          claim_status?: string
          claimed_candidate_id?: string | null
          created_at?: string
          government_id_reference?: string | null
          government_id_status?: string
          reviewed_at?: string | null
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tier3_verifications_claimed_candidate_id_fkey"
            columns: ["claimed_candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tier3_verifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "candidate_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tier3_verifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_participants: {
        Row: {
          created_at: string | null
          election_id: string
          elo_rating: number
          id: string
          matches_played: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          election_id: string
          elo_rating?: number
          id?: string
          matches_played?: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          election_id?: string
          elo_rating?: number
          id?: string
          matches_played?: number
          user_id?: string
        }
        Relationships: []
      }
      trades: {
        Row: {
          created_at: string | null
          id: string
          offered_player_id: string
          offering_club_id: string
          status: string | null
          target_club_id: string
          target_player_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          offered_player_id: string
          offering_club_id: string
          status?: string | null
          target_club_id: string
          target_player_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          offered_player_id?: string
          offering_club_id?: string
          status?: string | null
          target_club_id?: string
          target_player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_offering_club_id_fkey"
            columns: ["offering_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_target_club_id_fkey"
            columns: ["target_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_ideologies: {
        Row: {
          id: string
          updated_at: string | null
          user_id: string
          vector_data: Json
        }
        Insert: {
          id?: string
          updated_at?: string | null
          user_id: string
          vector_data?: Json
        }
        Update: {
          id?: string
          updated_at?: string | null
          user_id?: string
          vector_data?: Json
        }
        Relationships: []
      }
      user_notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          read_at: string | null
          reference_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          read_at?: string | null
          reference_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          read_at?: string | null
          reference_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "candidate_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_stances: {
        Row: {
          created_at: string
          election_id: string
          id: string
          position_label: string
          position_score: number
          primary_axis: string
          question_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          election_id: string
          id?: string
          position_label: string
          position_score: number
          primary_axis: string
          question_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          election_id?: string
          id?: string
          position_label?: string
          position_score?: number
          primary_axis?: string
          question_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_stances_election_id_fkey"
            columns: ["election_id"]
            isOneToOne: false
            referencedRelation: "elections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_stances_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "election_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_stances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "candidate_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_stances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          elo_rating: number
          home_ocd_ids: string[]
          id: string
          ideology_vector: string | null
          is_eligible_federal: boolean
          is_eligible_local: boolean
          is_verified: boolean
          matched_ocd_ids: string[]
          ocd_identifiers: string[]
          residency_state: string | null
          residency_zip: string | null
          stance_vector: string | null
          target_district_id: string | null
          tier: string | null
          tier_2_verified: boolean
          updated_at: string
          username: string
          verification_tier: string
          viability_score: number
        }
        Insert: {
          created_at?: string
          elo_rating?: number
          home_ocd_ids?: string[]
          id: string
          ideology_vector?: string | null
          is_eligible_federal?: boolean
          is_eligible_local?: boolean
          is_verified?: boolean
          matched_ocd_ids?: string[]
          ocd_identifiers?: string[]
          residency_state?: string | null
          residency_zip?: string | null
          stance_vector?: string | null
          target_district_id?: string | null
          tier?: string | null
          tier_2_verified?: boolean
          updated_at?: string
          username: string
          verification_tier?: string
          viability_score?: number
        }
        Update: {
          created_at?: string
          elo_rating?: number
          home_ocd_ids?: string[]
          id?: string
          ideology_vector?: string | null
          is_eligible_federal?: boolean
          is_eligible_local?: boolean
          is_verified?: boolean
          matched_ocd_ids?: string[]
          ocd_identifiers?: string[]
          residency_state?: string | null
          residency_zip?: string | null
          stance_vector?: string | null
          target_district_id?: string | null
          tier?: string | null
          tier_2_verified?: boolean
          updated_at?: string
          username?: string
          verification_tier?: string
          viability_score?: number
        }
        Relationships: []
      }
      votes: {
        Row: {
          candidate_id: string
          created_at: string
          debate_id: string
          id: string
          voided_at: string | null
          voter_id: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          debate_id: string
          id?: string
          voided_at?: string | null
          voter_id: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          debate_id?: string
          id?: string
          voided_at?: string | null
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "votes_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidate_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_debate_id_fkey"
            columns: ["debate_id"]
            isOneToOne: false
            referencedRelation: "debates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "candidate_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      candidate_stats: {
        Row: {
          created_at: string | null
          debates_played: number | null
          debates_won: number | null
          elo_rating: number | null
          id: string | null
          ideology_vector: string | null
          is_verified: boolean | null
          stance_vector: string | null
          target_district_id: string | null
          tier: string | null
          total_pledged: number | null
          total_votes: number | null
          updated_at: string | null
          username: string | null
          verification_tier: string | null
          viability_score: number | null
          win_percentage: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      apply_debate_elo: { Args: { debate_uuid: string }; Returns: undefined }
      calculate_debate_winner: {
        Args: { debate_uuid: string }
        Returns: string
      }
      calculate_electability: {
        Args: { p_district_id: string; p_user_id: string }
        Returns: number
      }
      calculate_user_compatibility: {
        Args: { user_a: string; user_b: string }
        Returns: number
      }
      calibrate_district_alignment: {
        Args: { p_district_id: string; p_user_id: string }
        Returns: {
          new_streak: number
          target_election_id: string
        }[]
      }
      complete_expired_debates: {
        Args: never
        Returns: {
          debate_id: string
          winner_id: string
        }[]
      }
      debate_district_ocd_id: { Args: { debate_uuid: string }; Returns: string }
      debate_tally: {
        Args: { debate_uuid: string }
        Returns: {
          raw_a: number
          raw_b: number
          weighted_a: number
          weighted_b: number
          winner_id: string
        }[]
      }
      find_primary_opponents: {
        Args: { match_count?: number; p_user_id: string }
        Returns: {
          cosine_distance: number
          elo_rating: number
          id: string
          similarity: number
          stance_vector: string
          target_district_id: string
          username: string
          verification_tier: string
        }[]
      }
      grade_debate_webhook_key: { Args: never; Returns: string }
      grade_debate_webhook_url: { Args: never; Returns: string }
      ideology_to_six_axis: { Args: { input: string }; Returns: string }
      lock_arbitration_elo: {
        Args: { p_candidate_id: string; p_debate_id: string }
        Returns: {
          elo_rating: number
          locked: boolean
        }[]
      }
      match_districts: {
        Args: {
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          cosine_distance: number
          historical_lean: string
          id: string
          level: string
          median_ideology_vector: string
          name: string
          pvi_score: number
          similarity: number
          state: string
          zip_code: string
        }[]
      }
      normalize_zip: { Args: { value: string }; Returns: string }
      update_ideology_vector_ema: {
        Args: { p_alpha?: number; p_stance_vector: string; p_user_id: string }
        Returns: string
      }
    }
    Enums: {
      verification_status: "PENDING" | "VERIFIED" | "REJECTED"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      verification_status: ["PENDING", "VERIFIED", "REJECTED"],
    },
  },
} as const

