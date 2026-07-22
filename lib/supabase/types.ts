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
          tagline: string;
          bio: string;
          location: string | null;
          language: string | null;
          visibility_mode: "public" | "protected" | "personal";
          connection_color: string;
          avatar_path: string | null;
          banner_path: string | null;
          profile_palette_id: "neutral" | "east" | "screen" | "arch" | "ocean";
          banner_mode: "none" | "gradient" | "world" | "image";
          banner_position: "top" | "center" | "bottom";
          overlay_strength: "low" | "medium" | "high";
          avatar_frame: "none" | "subtle" | "world" | "tier";
          surface_style: "solid" | "soft_glass" | "textured";
          motif_intensity: "none" | "subtle" | "full";
          selected_title: string | null;
          follow_list_visibility: "public" | "followers" | "mutual" | "self";
          layout_mode: string;
          recommendation_permission: "mutual" | "following" | "followers" | "everyone" | "none";
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
          tagline?: string;
          bio?: string;
          location?: string | null;
          language?: string | null;
          visibility_mode?: "public" | "protected" | "personal";
          connection_color?: string;
          avatar_path?: string | null;
          banner_path?: string | null;
          profile_palette_id?: "neutral" | "east" | "screen" | "arch" | "ocean";
          banner_mode?: "none" | "gradient" | "world" | "image";
          banner_position?: "top" | "center" | "bottom";
          overlay_strength?: "low" | "medium" | "high";
          avatar_frame?: "none" | "subtle" | "world" | "tier";
          surface_style?: "solid" | "soft_glass" | "textured";
          motif_intensity?: "none" | "subtle" | "full";
          selected_title?: string | null;
          follow_list_visibility?: "public" | "followers" | "mutual" | "self";
          layout_mode?: string;
          recommendation_permission?: "mutual" | "following" | "followers" | "everyone" | "none";
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
          tagline?: string;
          bio?: string;
          location?: string | null;
          language?: string | null;
          visibility_mode?: "public" | "protected" | "personal";
          connection_color?: string;
          avatar_path?: string | null;
          banner_path?: string | null;
          profile_palette_id?: "neutral" | "east" | "screen" | "arch" | "ocean";
          banner_mode?: "none" | "gradient" | "world" | "image";
          banner_position?: "top" | "center" | "bottom";
          overlay_strength?: "low" | "medium" | "high";
          avatar_frame?: "none" | "subtle" | "world" | "tier";
          surface_style?: "solid" | "soft_glass" | "textured";
          motif_intensity?: "none" | "subtle" | "full";
          selected_title?: string | null;
          follow_list_visibility?: "public" | "followers" | "mutual" | "self";
          layout_mode?: string;
          recommendation_permission?: "mutual" | "following" | "followers" | "everyone" | "none";
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
      get_unified_social_profile: { Args: { p_username: string }; Returns: Json };
      search_social_profiles: { Args: { p_query: string; p_offset?: number; p_limit?: number }; Returns: Json };
      list_social_connections: { Args: { p_owner: string; p_kind: string; p_query?: string; p_offset?: number; p_limit?: number }; Returns: Json };
      social_save_profile: { Args: { p_username: string; p_display_name: string; p_bio: string; p_location: string; p_language: string; p_visibility_mode: string; p_connection_color: string; p_selected_title: string }; Returns: Json };
      social_save_unified_profile: { Args: { p_username: string; p_display_name: string; p_tagline: string; p_bio: string; p_location: string; p_language: string; p_visibility_mode: string; p_connection_color: string; p_selected_title: string; p_profile_palette_id: string; p_banner_mode: string; p_banner_position: string; p_overlay_strength: string; p_avatar_frame: string; p_surface_style: string; p_motif_intensity: string }; Returns: Json };
      social_follow: { Args: { p_target: string }; Returns: Json };
      social_follow_action: { Args: { p_action: string; p_other: string }; Returns: Json };
      social_block: { Args: { p_target: string }; Returns: Json };
      social_unblock: { Args: { p_target: string }; Returns: Json };
      social_replace_showcase: { Args: { p_kind: string; p_items: Json }; Returns: Json };
      social_share_note: { Args: { p_media_title: string; p_media_type: string; p_external_source: string; p_external_id: string; p_content: string; p_contains_spoiler: boolean; p_visibility: string; p_confirmed: boolean }; Returns: Json };
      social_unshare_note: { Args: { p_note: string }; Returns: Json };
      list_social_blocks: { Args: Record<string, never>; Returns: Json };
      social_get_preferences: { Args: Record<string, never>; Returns: Json };
      social_save_preferences: { Args: { p_kind: string; p_values: Json }; Returns: Json };
      social_publish_activity: { Args: { p_event_type: string; p_visibility: string; p_media: Json; p_rating: number | null; p_short_text: string | null; p_source_event_id: string; p_dedupe_key: string }; Returns: Json };
      social_delete_activity: { Args: { p_activity: string }; Returns: Json };
      list_social_feed: { Args: { p_cursor_created_at?: string; p_cursor_id?: string; p_limit?: number }; Returns: Json };
      list_profile_activity: { Args: { p_owner: string; p_limit?: number }; Returns: Json };
      social_comment: { Args: { p_activity: string; p_parent: string | null; p_body: string; p_spoiler: boolean; p_dedupe_key: string }; Returns: Json };
      social_comment_action: { Args: { p_action: string; p_comment: string; p_body?: string | null; p_spoiler?: boolean }; Returns: Json };
      social_react: { Args: { p_activity: string | null; p_comment: string | null; p_reaction: string }; Returns: Json };
      social_send_recommendation: { Args: { p_recipient: string; p_media: Json; p_sender_note: string; p_dedupe_key: string }; Returns: Json };
      social_recommendation_transition: { Args: { p_recommendation: string; p_action: string; p_response_note?: string | null; p_already_in_library?: boolean; p_dedupe_key?: string | null; p_response_message?: string | null }; Returns: Json };
      social_send_recommendation_message: { Args: { p_recommendation: string; p_body: string; p_dedupe_key: string }; Returns: Json };
      get_social_recommendation_detail: { Args: { p_recommendation: string }; Returns: Json };
      get_social_person_summary: { Args: { p_target: string }; Returns: Json };
      list_social_recommendations: { Args: { p_box?: string; p_status?: string; p_cursor_created_at?: string; p_cursor_id?: string; p_limit?: number }; Returns: Json };
      list_social_notifications: { Args: { p_cursor_created_at?: string; p_cursor_id?: string; p_limit?: number }; Returns: Json };
      social_notification_action: { Args: { p_action: string; p_notification?: string | null; p_entity_type?: string | null; p_entity_id?: string | null }; Returns: Json };
      social_report: { Args: { p_activity: string | null; p_comment: string | null; p_category: string; p_note?: string | null }; Returns: Json };
      xp_attest_local_event: { Args: { p_event_type: string; p_canonical_key: string; p_media: Json; p_total_progress?: number | null; p_idempotency_key?: string | null }; Returns: Json };
      xp_import_legacy: { Args: { p_media_count: number; p_progress_log_count: number; p_completed_count: number; p_rated_count: number; p_favorite_count: number; p_noted_count: number; p_world_counts: Json }; Returns: Json };
      xp_sync_media_states: { Args: { p_items: Json; p_replace?: boolean }; Returns: Json };
      get_xp_dashboard: { Args: { p_event_limit?: number }; Returns: Json };
      get_xp_public_summary: { Args: { p_user: string }; Returns: Json };
      xp_select_badges: { Args: { p_badge_keys: string[] }; Returns: Json };
      xp_select_title: { Args: { p_title: string }; Returns: Json };
    };
    Enums: Record<string, never>;
  };
}
