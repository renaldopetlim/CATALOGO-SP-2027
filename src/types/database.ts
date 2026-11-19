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
      categories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          sort_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      catalog_items: {
        Row: {
          id: string;
          title: string;
          sku: string | null;
          category_id: string;
          short_description: string | null;
          detailed_description: string | null;
          price: number | null;
          image_url: string | null;
          tags: string[];
          is_featured: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          search_text: string;
        };
        Insert: {
          id?: string;
          title: string;
          sku?: string | null;
          category_id: string;
          short_description?: string | null;
          detailed_description?: string | null;
          price?: number | null;
          image_url?: string | null;
          tags?: string[];
          is_featured?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          search_text?: string;
        };
        Update: {
          id?: string;
          title?: string;
          sku?: string | null;
          category_id?: string;
          short_description?: string | null;
          detailed_description?: string | null;
          price?: number | null;
          image_url?: string | null;
          tags?: string[];
          is_featured?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          search_text?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'catalog_items_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_admin: {
        Args: never;
        Returns: boolean;
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
