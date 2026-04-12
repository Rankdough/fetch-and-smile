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
      context_documents: {
        Row: {
          content: string
          created_at: string
          file_name: string
          id: string
          summary: string | null
          topic_id: string
          updated_at: string
        }
        Insert: {
          content?: string
          created_at?: string
          file_name: string
          id?: string
          summary?: string | null
          topic_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          file_name?: string
          id?: string
          summary?: string | null
          topic_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "context_documents_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "context_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      context_topics: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
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
      instruction_presets: {
        Row: {
          created_at: string
          id: string
          instructions: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          instructions?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          instructions?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      internal_link_files: {
        Row: {
          created_at: string
          id: string
          name: string
          urls: Json
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          urls?: Json
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          urls?: Json
        }
        Relationships: []
      }
      internal_link_history: {
        Row: {
          created_at: string
          id: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          url?: string
        }
        Relationships: []
      }
      keyword_clustering_results: {
        Row: {
          client_tag: string | null
          content_queue_state: Json | null
          created_at: string
          id: string
          input_keywords: string[]
          name: string | null
          result: Json
          updated_at: string
        }
        Insert: {
          client_tag?: string | null
          content_queue_state?: Json | null
          created_at?: string
          id?: string
          input_keywords?: string[]
          name?: string | null
          result: Json
          updated_at?: string
        }
        Update: {
          client_tag?: string | null
          content_queue_state?: Json | null
          created_at?: string
          id?: string
          input_keywords?: string[]
          name?: string | null
          result?: Json
          updated_at?: string
        }
        Relationships: []
      }
      keyword_dedup_results: {
        Row: {
          ai_merged_groups: number
          created_at: string
          deduplicated_count: number
          file_name: string | null
          fuzzy_merged_groups: number
          id: string
          keywords: Json
          name: string
          original_count: number
          removed_count: number
          ungrouped_for_ai: Json
          updated_at: string
        }
        Insert: {
          ai_merged_groups?: number
          created_at?: string
          deduplicated_count?: number
          file_name?: string | null
          fuzzy_merged_groups?: number
          id?: string
          keywords?: Json
          name: string
          original_count?: number
          removed_count?: number
          ungrouped_for_ai?: Json
          updated_at?: string
        }
        Update: {
          ai_merged_groups?: number
          created_at?: string
          deduplicated_count?: number
          file_name?: string | null
          fuzzy_merged_groups?: number
          id?: string
          keywords?: Json
          name?: string
          original_count?: number
          removed_count?: number
          ungrouped_for_ai?: Json
          updated_at?: string
        }
        Relationships: []
      }
      keyword_research: {
        Row: {
          client_tag: string | null
          context: string | null
          created_at: string
          id: string
          results: Json
          topic: string
        }
        Insert: {
          client_tag?: string | null
          context?: string | null
          created_at?: string
          id?: string
          results: Json
          topic: string
        }
        Update: {
          client_tag?: string | null
          context?: string | null
          created_at?: string
          id?: string
          results?: Json
          topic?: string
        }
        Relationships: []
      }
      migration_jobs: {
        Row: {
          created_at: string
          error: string | null
          id: string
          result: Json | null
          status: string
          type: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          result?: Json | null
          status?: string
          type?: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          result?: Json | null
          status?: string
          type?: string
          updated_at?: string
          url?: string
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
      seed_keyword_files: {
        Row: {
          created_at: string
          file_type: string
          id: string
          keywords: Json
          name: string
        }
        Insert: {
          created_at?: string
          file_type?: string
          id?: string
          keywords?: Json
          name: string
        }
        Update: {
          created_at?: string
          file_type?: string
          id?: string
          keywords?: Json
          name?: string
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
