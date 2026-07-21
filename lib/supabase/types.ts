// ============================================
// Supabase Database Tip Tanımları (Placeholder)
// ============================================
// Bu dosya ileride `supabase gen types typescript` komutu ile
// otomatik üretilebilir. Şimdilik elle yazılmış minimal bir taslak.
//
// Generate komutu örneği (gelecekte):
//   npx supabase gen types typescript --project-id <id> > lib/supabase/types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          username: string | null;
          bio: string;
          location: string | null;
          language: string | null;
          visibility_mode: "public" | "protected" | "personal";
          connection_color: string;
          avatar_path: string | null;
          banner_path: string | null;
          selected_title: string | null;
          follow_list_visibility: "public" | "followers" | "mutual" | "self";
          layout_mode: string;
          joined_at: string;
          deleted_at: string | null;
          username_changed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          username?: string | null;
          bio?: string;
          location?: string | null;
          language?: string | null;
          visibility_mode?: "public" | "protected" | "personal";
          connection_color?: string;
          avatar_path?: string | null;
          banner_path?: string | null;
          selected_title?: string | null;
          follow_list_visibility?: "public" | "followers" | "mutual" | "self";
          layout_mode?: string;
          joined_at?: string;
          deleted_at?: string | null;
          username_changed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          username?: string | null;
          bio?: string;
          location?: string | null;
          language?: string | null;
          visibility_mode?: "public" | "protected" | "personal";
          connection_color?: string;
          avatar_path?: string | null;
          banner_path?: string | null;
          selected_title?: string | null;
          follow_list_visibility?: "public" | "followers" | "mutual" | "self";
          layout_mode?: string;
          joined_at?: string;
          deleted_at?: string | null;
          username_changed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      media_items: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          type: string;
          status: string;
          current_progress: number;
          total_progress: number;
          external_source: string | null;
          external_id: string | null;
          cover_url: string | null;
          backdrop_url: string | null;
          overview: string | null;
          release_year: number | null;
          favorite: boolean;
          user_rating: number | null;
          tags: string[];
          personal_notes: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id: string;
          user_id: string;
          title: string;
          type: string;
          status: string;
          current_progress?: number;
          total_progress?: number;
          external_source?: string | null;
          external_id?: string | null;
          cover_url?: string | null;
          backdrop_url?: string | null;
          overview?: string | null;
          release_year?: number | null;
          favorite?: boolean;
          user_rating?: number | null;
          tags?: string[];
          personal_notes?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          type?: string;
          status?: string;
          current_progress?: number;
          total_progress?: number;
          external_source?: string | null;
          external_id?: string | null;
          cover_url?: string | null;
          backdrop_url?: string | null;
          overview?: string | null;
          release_year?: number | null;
          favorite?: boolean;
          user_rating?: number | null;
          tags?: string[];
          personal_notes?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      progress_logs: {
        Row: {
          id: string;
          user_id: string;
          media_id: string | null;
          media_title: string;
          media_type: string;
          action: string;
          amount: number;
          unit: string;
          previous_progress: number;
          new_progress: number;
          created_at: string;
        };
        Insert: {
          id: string;
          user_id: string;
          media_id?: string | null;
          media_title: string;
          media_type: string;
          action: string;
          amount: number;
          unit: string;
          previous_progress: number;
          new_progress: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          media_id?: string | null;
          media_title?: string;
          media_type?: string;
          action?: string;
          amount?: number;
          unit?: string;
          previous_progress?: number;
          new_progress?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      profile_modules: {
        Row: { user_id: string; module_key: string; enabled: boolean; visibility: string; grid_x: number; grid_y: number; grid_width: number; grid_height: number; mobile_order: number; config: Json; updated_at: string };
        Insert: { user_id: string; module_key: string; enabled: boolean; visibility: string; grid_x: number; grid_y: number; grid_width: number; grid_height: number; mobile_order: number; config?: Json; updated_at?: string };
        Update: { enabled?: boolean; visibility?: string; grid_x?: number; grid_y?: number; grid_width?: number; grid_height?: number; mobile_order?: number; config?: Json; updated_at?: string };
        Relationships: [];
      };
      profile_media_showcase: {
        Row: { id: string; user_id: string; showcase_kind: string; title: string; media_type: string; external_source: string | null; external_id: string | null; cover_url: string | null; world: string; sort_order: number; created_at: string; updated_at: string };
        Insert: { id?: string; user_id: string; showcase_kind: string; title: string; media_type: string; external_source?: string | null; external_id?: string | null; cover_url?: string | null; world: string; sort_order: number; created_at?: string; updated_at?: string };
        Update: { title?: string; media_type?: string; external_source?: string | null; external_id?: string | null; cover_url?: string | null; world?: string; sort_order?: number; updated_at?: string };
        Relationships: [];
      };
      profile_stats_snapshots: {
        Row: { user_id: string; total_media: number; completed: number; active: number; planning: number; favorites: number; rated: number; world_counts: Json; snapshot_at: string; updated_at: string };
        Insert: { user_id: string; total_media: number; completed: number; active: number; planning: number; favorites: number; rated: number; world_counts: Json; snapshot_at: string; updated_at?: string };
        Update: { total_media?: number; completed?: number; active?: number; planning?: number; favorites?: number; rated?: number; world_counts?: Json; snapshot_at?: string; updated_at?: string };
        Relationships: [];
      };
      profile_progression_snapshots: {
        Row: { user_id: string; version: number; total_xp: number; level: number; title: string; tier: string; dominant_world: string; progress_percent: number; world_counts: Json; snapshot_at: string; updated_at: string };
        Insert: { user_id: string; version: number; total_xp: number; level: number; title: string; tier: string; dominant_world: string; progress_percent: number; world_counts: Json; snapshot_at: string; updated_at?: string };
        Update: { version?: number; total_xp?: number; level?: number; title?: string; tier?: string; dominant_world?: string; progress_percent?: number; world_counts?: Json; snapshot_at?: string; updated_at?: string };
        Relationships: [];
      };
      profile_shared_notes: {
        Row: { id: string; user_id: string; media_title: string; media_type: string; external_source: string | null; external_id: string | null; content: string; contains_spoiler: boolean; visibility: string; confirmed_at: string; created_at: string; updated_at: string };
        Insert: { id?: string; user_id: string; media_title: string; media_type: string; external_source?: string | null; external_id?: string | null; content: string; contains_spoiler: boolean; visibility: string; confirmed_at: string; created_at?: string; updated_at?: string };
        Update: { content?: string; contains_spoiler?: boolean; visibility?: string; updated_at?: string };
        Relationships: [];
      };
      profile_follows: {
        Row: { follower_id: string; following_id: string; status: "pending" | "accepted"; requested_at: string; responded_at: string | null; created_at: string; updated_at: string };
        Insert: { follower_id: string; following_id: string; status: "pending" | "accepted"; requested_at?: string; responded_at?: string | null; created_at?: string; updated_at?: string };
        Update: { status?: "pending" | "accepted"; responded_at?: string | null; updated_at?: string };
        Relationships: [];
      };
      profile_blocks: {
        Row: { blocker_id: string; blocked_id: string; created_at: string };
        Insert: { blocker_id: string; blocked_id: string; created_at?: string };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_social_profile: { Args: { p_username: string }; Returns: Json };
      search_social_profiles: { Args: { p_query: string; p_offset?: number; p_limit?: number }; Returns: Json };
      list_social_connections: { Args: { p_owner: string; p_kind: string; p_query?: string; p_offset?: number; p_limit?: number }; Returns: Json };
      social_save_profile: { Args: { p_username: string; p_display_name: string; p_bio: string; p_location: string; p_language: string; p_visibility_mode: string; p_connection_color: string; p_selected_title: string }; Returns: Json };
      social_follow: { Args: { p_target: string }; Returns: Json };
      social_follow_action: { Args: { p_action: string; p_other: string }; Returns: Json };
      social_block: { Args: { p_target: string }; Returns: Json };
      social_unblock: { Args: { p_target: string }; Returns: Json };
      social_replace_showcase: { Args: { p_kind: string; p_items: Json }; Returns: Json };
      social_share_note: { Args: { p_media_title: string; p_media_type: string; p_external_source: string; p_external_id: string; p_content: string; p_contains_spoiler: boolean; p_visibility: string; p_confirmed: boolean }; Returns: Json };
      social_unshare_note: { Args: { p_note: string }; Returns: Json };
      list_social_blocks: { Args: Record<string, never>; Returns: Json };
    };
    Enums: Record<string, never>;
  };
}
