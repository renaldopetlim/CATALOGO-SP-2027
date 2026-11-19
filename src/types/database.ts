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
        };
        Insert: {
          code: string;
          description: string;
          brand: string;
          search_text?: string;
          created_at?: string;
          updated_at?: string;
          last_seen_at?: string;
        };
        Update: {
          code?: string;
          description?: string;
          brand?: string;
          search_text?: string;
          created_at?: string;
          updated_at?: string;
          last_seen_at?: string;
        };
        Relationships: [];
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
        Args: { p_rows: Json };
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
