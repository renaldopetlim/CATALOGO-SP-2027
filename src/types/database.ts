/**
 * Tipos do banco no formato gerado pelo Supabase CLI.
 *
 * Espelha `supabase/migrations/20261119000000_init_catalog.sql`.
 * Ao alterar o schema, regenere com:
 *   npx supabase gen types typescript --project-id <id> --schema public > src/types/database.ts
 *
 * Use `type` (não `interface`) nas linhas: o cliente exige Record<string, unknown>.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '12';
  };
  public: {
    Tables: {
      admin_users: {
        Row: {
          user_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      catalog_sync: {
        Row: {
          id: number;
          version: number;
          changed_at: string;
          last_table: string | null;
        };
        Insert: {
          id?: number;
          version?: number;
          changed_at?: string;
          last_table?: string | null;
        };
        Update: {
          id?: number;
          version?: number;
          changed_at?: string;
          last_table?: string | null;
        };
        Relationships: [];
      };
      brands: {
        Row: {
          id: string;
          name: string;
          logo_url: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          logo_url?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          logo_url?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          sort_order: number;
          is_active: boolean;
          has_color_swatches: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          sort_order?: number;
          is_active?: boolean;
          has_color_swatches?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          sort_order?: number;
          is_active?: boolean;
          has_color_swatches?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      catalog_items: {
        Row: {
          id: string;
          title: string;
          brand: string | null;
          brand_id: string | null;
          badge: string | null;
          category_id: string;
          /** Mantida no banco, sem uso na interface atual. */
          price: number | null;
          image_url: string | null;
          tags: string[];
          specifications: Json;
          is_featured: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          search_text: string;
        };
        Insert: {
          id?: string;
          title: string;
          brand?: string | null;
          brand_id?: string | null;
          badge?: string | null;
          category_id: string;
          price?: number | null;
          image_url?: string | null;
          tags?: string[];
          specifications?: Json;
          is_featured?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          search_text?: string;
        };
        Update: {
          id?: string;
          title?: string;
          brand?: string | null;
          brand_id?: string | null;
          badge?: string | null;
          category_id?: string;
          price?: number | null;
          image_url?: string | null;
          tags?: string[];
          specifications?: Json;
          is_featured?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          search_text?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'catalog_items_brand_id_fkey';
            columns: ['brand_id'];
            isOneToOne: false;
            referencedRelation: 'brands';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalog_items_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
        ];
      };
      catalog_item_codes: {
        Row: {
          id: string;
          item_id: string;
          code: string;
          description: string | null;
          packaging: string | null;
          color_name: string | null;
          color_hex: string | null;
          color_swatch_url: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          item_id: string;
          code: string;
          description?: string | null;
          packaging?: string | null;
          color_name?: string | null;
          color_hex?: string | null;
          color_swatch_url?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          item_id?: string;
          code?: string;
          description?: string | null;
          packaging?: string | null;
          color_name?: string | null;
          color_hex?: string | null;
          color_swatch_url?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'catalog_item_codes_item_id_fkey';
            columns: ['item_id'];
            isOneToOne: false;
            referencedRelation: 'catalog_items';
            referencedColumns: ['id'];
          },
        ];
      };
      system_products: {
        Row: {
          code: string;
          description: string;
          brand: string;
          search_text: string;
          created_at: string;
          updated_at: string;
          last_seen_at: string;
          created_batch_id: string | null;
        };
        Insert: {
          code: string;
          description: string;
          brand: string;
          search_text?: string;
          created_at?: string;
          updated_at?: string;
          last_seen_at?: string;
          created_batch_id?: string | null;
        };
        Update: {
          code?: string;
          description?: string;
          brand?: string;
          search_text?: string;
          created_at?: string;
          updated_at?: string;
          last_seen_at?: string;
          created_batch_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'system_products_created_batch_id_fkey';
            columns: ['created_batch_id'];
            isOneToOne: false;
            referencedRelation: 'import_batches';
            referencedColumns: ['id'];
          },
        ];
      };
      user_profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          role: string;
          is_active: boolean;
          permissions: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string;
          full_name?: string;
          role?: string;
          is_active?: boolean;
          permissions?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string;
          role?: string;
          is_active?: boolean;
          permissions?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_invites: {
        Row: {
          email: string;
          full_name: string;
          role: string;
          is_active: boolean;
          permissions: Json;
          invited_by: string | null;
          created_at: string;
        };
        Insert: {
          email: string;
          full_name?: string;
          role?: string;
          is_active?: boolean;
          permissions?: Json;
          invited_by?: string | null;
          created_at?: string;
        };
        Update: {
          email?: string;
          full_name?: string;
          role?: string;
          is_active?: boolean;
          permissions?: Json;
          invited_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      import_batches: {
        Row: {
          id: string;
          file_name: string;
          started_at: string;
          finished_at: string | null;
          imported_by: string | null;
          imported_by_email: string | null;
          received: number;
          inserted: number;
          updated: number;
          unchanged: number;
          undone_at: string | null;
        };
        Insert: {
          id?: string;
          file_name: string;
          started_at?: string;
          finished_at?: string | null;
          imported_by?: string | null;
          imported_by_email?: string | null;
          received?: number;
          inserted?: number;
          updated?: number;
          unchanged?: number;
          undone_at?: string | null;
        };
        Update: {
          id?: string;
          file_name?: string;
          started_at?: string;
          finished_at?: string | null;
          imported_by?: string | null;
          imported_by_email?: string | null;
          received?: number;
          inserted?: number;
          updated?: number;
          unchanged?: number;
          undone_at?: string | null;
        };
        Relationships: [];
      };
      import_batch_items: {
        Row: {
          batch_id: string;
          code: string;
          action: string;
          prev_description: string | null;
          prev_brand: string | null;
          prev_updated_at: string | null;
          prev_last_seen_at: string | null;
        };
        Insert: {
          batch_id: string;
          code: string;
          action: string;
          prev_description?: string | null;
          prev_brand?: string | null;
          prev_updated_at?: string | null;
          prev_last_seen_at?: string | null;
        };
        Update: {
          batch_id?: string;
          code?: string;
          action?: string;
          prev_description?: string | null;
          prev_brand?: string | null;
          prev_updated_at?: string | null;
          prev_last_seen_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'import_batch_items_batch_id_fkey';
            columns: ['batch_id'];
            isOneToOne: false;
            referencedRelation: 'import_batches';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      system_products_reconciliation: {
        Row: {
          code: string;
          description: string;
          brand: string;
          search_text: string;
          updated_at: string;
          last_seen_at: string;
          catalog_item_id: string | null;
          catalog_item_title: string | null;
          catalog_status: string;
        };
        Relationships: [];
      };
    };
    Functions: {
      is_admin: {
        Args: never;
        Returns: boolean;
      };
      import_system_products: {
        Args: { p_rows: Json; p_batch_id?: string | null };
        Returns: Json;
      };
      has_permission: {
        Args: { p_permission: string };
        Returns: boolean;
      };
      is_staff: {
        Args: never;
        Returns: boolean;
      };
      admin_list_users: {
        Args: never;
        Returns: Array<{
          id: string | null;
          email: string;
          full_name: string;
          role: string | null;
          is_active: boolean;
          permissions: Json;
          status: string;
          created_at: string;
          updated_at: string;
          last_sign_in_at: string | null;
          email_confirmed: boolean;
          banned: boolean;
        }>;
      };
      start_import_batch: {
        Args: { p_file_name: string };
        Returns: string;
      };
      undo_import_batch: {
        Args: { p_batch_id: string };
        Returns: Json;
      };
      delete_import_batch_records: {
        Args: { p_batch_id: string };
        Returns: number;
      };
      stale_system_products: {
        Args: { p_mode: string; p_days?: number };
        Returns: Array<{ code: string; description: string; brand: string; last_seen_at: string; created_at: string }>;
      };
      purge_stale_system_products: {
        Args: { p_mode: string; p_days?: number };
        Returns: number;
      };
      storage_orphan_files: {
        Args: { p_min_age_minutes?: number; p_names?: string[] | null };
        Returns: Array<{ name: string; size: number; mimetype: string | null; created_at: string }>;
      };
      cleanup_report: {
        Args: { p_days?: number };
        Returns: Json;
      };
      save_catalog_item: {
        Args: { p_id: string | null; p_item: Json; p_codes: Json };
        Returns: string;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database['public'];

export type TableName = keyof PublicSchema['Tables'];
export type TableRow<T extends TableName> = PublicSchema['Tables'][T]['Row'];
export type TableInsert<T extends TableName> = PublicSchema['Tables'][T]['Insert'];
export type TableUpdate<T extends TableName> = PublicSchema['Tables'][T]['Update'];
