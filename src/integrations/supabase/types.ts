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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      candidates: {
        Row: {
          created_at: string
          date_of_birth: string | null
          district: string | null
          id: string
          mobile: string | null
          name: string
          needs_follow_up: boolean
          notes: string | null
          occupation_id: string | null
          passport_expiry: string | null
          passport_no: string | null
          photo_url: string | null
          registration_no: string | null
          ttc_id: string | null
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          district?: string | null
          id?: string
          mobile?: string | null
          name: string
          needs_follow_up?: boolean
          notes?: string | null
          occupation_id?: string | null
          passport_expiry?: string | null
          passport_no?: string | null
          photo_url?: string | null
          registration_no?: string | null
          ttc_id?: string | null
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          district?: string | null
          id?: string
          mobile?: string | null
          name?: string
          needs_follow_up?: boolean
          notes?: string | null
          occupation_id?: string | null
          passport_expiry?: string | null
          passport_no?: string | null
          photo_url?: string | null
          registration_no?: string | null
          ttc_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidates_occupation_id_fkey"
            columns: ["occupation_id"]
            isOneToOne: false
            referencedRelation: "occupations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidates_ttc_id_fkey"
            columns: ["ttc_id"]
            isOneToOne: false
            referencedRelation: "ttc_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          candidate_id: string
          created_at: string
          exam_date: string
          exam_time: string | null
          exam_type: string
          id: string
          occupation_id: string | null
          remarks: string | null
          result: Database["public"]["Enums"]["exam_result"]
          result_date: string | null
          score: number | null
          ttc_id: string | null
        }
        Insert: {
          candidate_id: string
          created_at?: string
          exam_date: string
          exam_time?: string | null
          exam_type?: string
          id?: string
          occupation_id?: string | null
          remarks?: string | null
          result?: Database["public"]["Enums"]["exam_result"]
          result_date?: string | null
          score?: number | null
          ttc_id?: string | null
        }
        Update: {
          candidate_id?: string
          created_at?: string
          exam_date?: string
          exam_time?: string | null
          exam_type?: string
          id?: string
          occupation_id?: string | null
          remarks?: string | null
          result?: Database["public"]["Enums"]["exam_result"]
          result_date?: string | null
          score?: number | null
          ttc_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exams_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_occupation_id_fkey"
            columns: ["occupation_id"]
            isOneToOne: false
            referencedRelation: "occupations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_ttc_id_fkey"
            columns: ["ttc_id"]
            isOneToOne: false
            referencedRelation: "ttc_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      occupations: {
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
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          candidate_id: string | null
          created_at: string
          done: boolean
          due_date: string
          id: string
          title: string
        }
        Insert: {
          candidate_id?: string | null
          created_at?: string
          done?: boolean
          due_date: string
          id?: string
          title: string
        }
        Update: {
          candidate_id?: string | null
          created_at?: string
          done?: boolean
          due_date?: string
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      results: {
        Row: {
          candidate_id: string
          created_at: string
          exam_id: string
          id: string
          result: Database["public"]["Enums"]["exam_result"]
          result_date: string | null
          score: number | null
          source: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          exam_id: string
          id?: string
          result: Database["public"]["Enums"]["exam_result"]
          result_date?: string | null
          score?: number | null
          source?: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          exam_id?: string
          id?: string
          result?: Database["public"]["Enums"]["exam_result"]
          result_date?: string | null
          score?: number | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "results_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          key: string
          value: string | null
        }
        Insert: {
          key: string
          value?: string | null
        }
        Update: {
          key?: string
          value?: string | null
        }
        Relationships: []
      }
      ttc_centers: {
        Row: {
          created_at: string
          district: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          district?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          district?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "staff"
      exam_result: "PENDING" | "PASS" | "FAIL" | "ABSENT" | "CANCELLED"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "staff"],
      exam_result: ["PENDING", "PASS", "FAIL", "ABSENT", "CANCELLED"],
    },
  },
} as const
