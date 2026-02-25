export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      image_folder_assignments: {
        Row: {
          created_at: string
          file_path: string
          folder_id: string
          id: string
        }
        Insert: {
          created_at?: string
          file_path: string
          folder_id: string
          id?: string
        }
        Update: {
          created_at?: string
          file_path?: string
          folder_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "image_folder_assignments_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "image_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      image_folders: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      product_description_batches: {
        Row: {
          created_at: string
          custom_instructions: string
          file_name: string | null
          id: string
          updated_at: string
          word_count: string
        }
        Insert: {
          created_at?: string
          custom_instructions?: string
          file_name?: string | null
          id?: string
          updated_at?: string
          word_count?: string
        }
        Update: {
          created_at?: string
          custom_instructions?: string
          file_name?: string | null
          id?: string
          updated_at?: string
          word_count?: string
        }
        Relationships: []
      }
      product_description_rows: {
        Row: {
          batch_id: string
          collection: string | null
          created_at: string
          description: string | null
          id: string
          product_info: string | null
          row_index: number
          status: string
          title: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          batch_id: string
          collection?: string | null
          created_at?: string
          description?: string | null
          id?: string
          product_info?: string | null
          row_index: number
          status?: string
          title?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          batch_id?: string
          collection?: string | null
          created_at?: string
          description?: string | null
          id?: string
          product_info?: string | null
          row_index?: number
          status?: string
          title?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_description_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "product_description_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_articles: {
        Row: {
          applied_rules: Json | null
          article_images: Json | null
          color_palette: string | null
          competitor_urls: string[] | null
          context_file_names: string[] | null
          created_at: string
          cta_url: string | null
          format_reference: string | null
          gap_analysis: string | null
          generated_content: string
          generated_ctas: Json | null
          id: string
          instructions: string | null
          keywords: string[] | null
          original_content: string | null
          outline: string | null
          selected_angles: string[] | null
          selected_gap_insights: string[] | null
          target_length: string | null
          title: string
          tone_profile_id: string | null
          topic: string
          updated_at: string
          use_knowledge_base: boolean | null
          value_promise: string | null
          word_count: number | null
        }
        Insert: {
          applied_rules?: Json | null
          article_images?: Json | null
          color_palette?: string | null
          competitor_urls?: string[] | null
          context_file_names?: string[] | null
          created_at?: string
          cta_url?: string | null
          format_reference?: string | null
          gap_analysis?: string | null
          generated_content: string
          generated_ctas?: Json | null
          id?: string
          instructions?: string | null
          keywords?: string[] | null
          original_content?: string | null
          outline?: string | null
          selected_angles?: string[] | null
          selected_gap_insights?: string[] | null
          target_length?: string | null
          title: string
          tone_profile_id?: string | null
          topic: string
          updated_at?: string
          use_knowledge_base?: boolean | null
          value_promise?: string | null
          word_count?: number | null
        }
        Update: {
          applied_rules?: Json | null
          article_images?: Json | null
          color_palette?: string | null
          competitor_urls?: string[] | null
          context_file_names?: string[] | null
          created_at?: string
          cta_url?: string | null
          format_reference?: string | null
          gap_analysis?: string | null
          generated_content?: string
          generated_ctas?: Json | null
          id?: string
          instructions?: string | null
          keywords?: string[] | null
          original_content?: string | null
          outline?: string | null
          selected_angles?: string[] | null
          selected_gap_insights?: string[] | null
          target_length?: string | null
          title?: string
          tone_profile_id?: string | null
          topic?: string
          updated_at?: string
          use_knowledge_base?: boolean | null
          value_promise?: string | null
          word_count?: number | null
        }
        Relationships: []
      }
      seo_knowledge: {
        Row: {
          content: string
          created_at: string
          file_name: string
          file_path: string
          id: string
          key_rules: string[] | null
          summary: string | null
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          key_rules?: string[] | null
          summary?: string | null
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          key_rules?: string[] | null
          summary?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tone_profiles: {
        Row: {
          characteristics: Json
          created_at: string
          example_phrases: string[] | null
          id: string
          is_active: boolean | null
          name: string
          source_file_name: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          characteristics?: Json
          created_at?: string
          example_phrases?: string[] | null
          id?: string
          is_active?: boolean | null
          name: string
          source_file_name: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          characteristics?: Json
          created_at?: string
          example_phrases?: string[] | null
          id?: string
          is_active?: boolean | null
          name?: string
          source_file_name?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const
