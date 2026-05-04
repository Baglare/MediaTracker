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
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
