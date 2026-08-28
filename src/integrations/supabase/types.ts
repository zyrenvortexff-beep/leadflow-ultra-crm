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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_clients: {
        Row: {
          agent_user_id: string
          created_at: string
          id: string
          org_id: string
        }
        Insert: {
          agent_user_id: string
          created_at?: string
          id?: string
          org_id: string
        }
        Update: {
          agent_user_id?: string
          created_at?: string
          id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_clients_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          created_at: string
          delay_seconds: number
          id: string
          is_active: boolean
          link_regalo: string | null
          media_url: string | null
          org_id: string
          response_text: string
          tag_to_apply: string | null
          trigger_keyword: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          delay_seconds?: number
          id?: string
          is_active?: boolean
          link_regalo?: string | null
          media_url?: string | null
          org_id: string
          response_text: string
          tag_to_apply?: string | null
          trigger_keyword: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          delay_seconds?: number
          id?: string
          is_active?: boolean
          link_regalo?: string | null
          media_url?: string | null
          org_id?: string
          response_text?: string
          tag_to_apply?: string | null
          trigger_keyword?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          audience_type: string
          contact_ids: string[]
          created_at: string
          id: string
          manual_numbers: string[]
          message_body: string
          name: string
          org_id: string
          schedule_time: string | null
          sent_at: string | null
          sent_count: number
          status: Database["public"]["Enums"]["campaign_status"]
          target_tags: string[] | null
          total_leads: number
        }
        Insert: {
          audience_type?: string
          contact_ids?: string[]
          created_at?: string
          id?: string
          manual_numbers?: string[]
          message_body: string
          name: string
          org_id: string
          schedule_time?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: Database["public"]["Enums"]["campaign_status"]
          target_tags?: string[] | null
          total_leads?: number
        }
        Update: {
          audience_type?: string
          contact_ids?: string[]
          created_at?: string
          id?: string
          manual_numbers?: string[]
          message_body?: string
          name?: string
          org_id?: string
          schedule_time?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: Database["public"]["Enums"]["campaign_status"]
          target_tags?: string[] | null
          total_leads?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          org_id: string
          phone: string
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          org_id: string
          phone: string
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          org_id?: string
          phone?: string
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_usage: {
        Row: {
          id: string
          messages_sent: number
          org_id: string
          updated_at: string
          usage_date: string
        }
        Insert: {
          id?: string
          messages_sent?: number
          org_id: string
          updated_at?: string
          usage_date?: string
        }
        Update: {
          id?: string
          messages_sent?: number
          org_id?: string
          updated_at?: string
          usage_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_usage_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      global_settings: {
        Row: {
          evolution_base_url: string | null
          id: string
          updated_at: string
        }
        Insert: {
          evolution_base_url?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          evolution_base_url?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          created_at: string
          email: string | null
          id: string
          last_contact: string | null
          name: string
          notes: string | null
          org_id: string
          phone: string
          status: Database["public"]["Enums"]["lead_status"]
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          last_contact?: string | null
          name: string
          notes?: string | null
          org_id: string
          phone: string
          status?: Database["public"]["Enums"]["lead_status"]
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          last_contact?: string | null
          name?: string
          notes?: string | null
          org_id?: string
          phone?: string
          status?: Database["public"]["Enums"]["lead_status"]
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages_log: {
        Row: {
          automation_id: string | null
          content: string | null
          direction: Database["public"]["Enums"]["message_direction"]
          error_message: string | null
          id: string
          keyword_matched: string | null
          lead_id: string | null
          org_id: string
          provider_message_id: string | null
          recipient: string | null
          status: string | null
          timestamp: string
        }
        Insert: {
          automation_id?: string | null
          content?: string | null
          direction: Database["public"]["Enums"]["message_direction"]
          error_message?: string | null
          id?: string
          keyword_matched?: string | null
          lead_id?: string | null
          org_id: string
          provider_message_id?: string | null
          recipient?: string | null
          status?: string | null
          timestamp?: string
        }
        Update: {
          automation_id?: string | null
          content?: string | null
          direction?: Database["public"]["Enums"]["message_direction"]
          error_message?: string | null
          id?: string
          keyword_matched?: string | null
          lead_id?: string | null
          org_id?: string
          provider_message_id?: string | null
          recipient?: string | null
          status?: string | null
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_errors: {
        Row: {
          created_at: string
          error_code: string | null
          error_detail: string | null
          error_title: string | null
          id: string
          message_content: string | null
          org_id: string
          provider_message_id: string | null
          raw: Json | null
          recipient: string | null
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          error_detail?: string | null
          error_title?: string | null
          id?: string
          message_content?: string | null
          org_id: string
          provider_message_id?: string | null
          raw?: Json | null
          recipient?: string | null
        }
        Update: {
          created_at?: string
          error_code?: string | null
          error_detail?: string | null
          error_title?: string | null
          id?: string
          message_content?: string | null
          org_id?: string
          provider_message_id?: string | null
          raw?: Json | null
          recipient?: string | null
        }
        Relationships: []
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          logo: string | null
          name: string
          plan_type: Database["public"]["Enums"]["plan_type"]
          status: Database["public"]["Enums"]["org_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          logo?: string | null
          name: string
          plan_type?: Database["public"]["Enums"]["plan_type"]
          status?: Database["public"]["Enums"]["org_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          logo?: string | null
          name?: string
          plan_type?: Database["public"]["Enums"]["plan_type"]
          status?: Database["public"]["Enums"]["org_status"]
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar: string | null
          created_at: string
          full_name: string | null
          id: string
          org_id: string | null
          user_id: string
        }
        Insert: {
          avatar?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          org_id?: string | null
          user_id: string
        }
        Update: {
          avatar?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          org_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          org_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_logs: {
        Row: {
          created_at: string
          event: string | null
          from_number: string | null
          id: string
          instance: string | null
          matched_keyword: string | null
          org_id: string | null
          processing_result: string | null
          raw_payload: Json | null
          text_content: string | null
        }
        Insert: {
          created_at?: string
          event?: string | null
          from_number?: string | null
          id?: string
          instance?: string | null
          matched_keyword?: string | null
          org_id?: string | null
          processing_result?: string | null
          raw_payload?: Json | null
          text_content?: string | null
        }
        Update: {
          created_at?: string
          event?: string | null
          from_number?: string | null
          id?: string
          instance?: string | null
          matched_keyword?: string | null
          org_id?: string | null
          processing_result?: string | null
          raw_payload?: Json | null
          text_content?: string | null
        }
        Relationships: []
      }
      whatsapp_configs: {
        Row: {
          api_token: string | null
          api_url: string | null
          created_at: string
          id: string
          instance_name: string | null
          org_id: string
          phone_number: string | null
          profile_name: string | null
          profile_picture: string | null
          provider_type: Database["public"]["Enums"]["provider_type"]
          status: Database["public"]["Enums"]["connection_status"]
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          api_token?: string | null
          api_url?: string | null
          created_at?: string
          id?: string
          instance_name?: string | null
          org_id: string
          phone_number?: string | null
          profile_name?: string | null
          profile_picture?: string | null
          provider_type: Database["public"]["Enums"]["provider_type"]
          status?: Database["public"]["Enums"]["connection_status"]
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          api_token?: string | null
          api_url?: string | null
          created_at?: string
          id?: string
          instance_name?: string | null
          org_id?: string
          phone_number?: string | null
          profile_name?: string | null
          profile_picture?: string | null
          provider_type?: Database["public"]["Enums"]["provider_type"]
          status?: Database["public"]["Enums"]["connection_status"]
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_configs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instances: {
        Row: {
          created_at: string
          id: string
          instance_name: string
          org_id: string
          phone_number: string | null
          status: Database["public"]["Enums"]["connection_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          instance_name: string
          org_id: string
          phone_number?: string | null
          status?: Database["public"]["Enums"]["connection_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          instance_name?: string
          org_id?: string
          phone_number?: string | null
          status?: Database["public"]["Enums"]["connection_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      whatsapp_meta_config: {
        Row: {
          access_token: string | null
          created_at: string
          id: string
          org_id: string
          phone_number_id: string | null
          updated_at: string
          verify_token: string
          waba_id: string | null
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          id?: string
          org_id: string
          phone_number_id?: string | null
          updated_at?: string
          verify_token?: string
          waba_id?: string | null
        }
        Update: {
          access_token?: string | null
          created_at?: string
          id?: string
          org_id?: string
          phone_number_id?: string | null
          updated_at?: string
          verify_token?: string
          waba_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_delete_user: { Args: { _user_id: string }; Returns: undefined }
      admin_list_users: {
        Args: never
        Returns: {
          agent_id: string
          created_at: string
          email: string
          full_name: string
          org_id: string
          org_name: string
          org_status: Database["public"]["Enums"]["org_status"]
          plan_type: Database["public"]["Enums"]["plan_type"]
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      admin_set_org_status: {
        Args: {
          _org_id: string
          _status: Database["public"]["Enums"]["org_status"]
        }
        Returns: undefined
      }
      admin_set_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      agent_client_count: { Args: never; Returns: number }
      agent_list_clients: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          org_id: string
          org_name: string
          org_status: Database["public"]["Enums"]["org_status"]
          plan_type: Database["public"]["Enums"]["plan_type"]
          user_id: string
        }[]
      }
      agent_set_client_plan: {
        Args: {
          _org_id: string
          _plan: Database["public"]["Enums"]["plan_type"]
        }
        Returns: undefined
      }
      agent_set_client_status: {
        Args: {
          _org_id: string
          _status: Database["public"]["Enums"]["org_status"]
        }
        Returns: undefined
      }
      daily_limit_for_plan: {
        Args: { _plan: Database["public"]["Enums"]["plan_type"] }
        Returns: number
      }
      ensure_user_organization: { Args: never; Returns: string }
      get_daily_usage: {
        Args: { _org_id: string }
        Returns: {
          plan: Database["public"]["Enums"]["plan_type"]
          plan_limit: number
          used: number
        }[]
      }
      get_user_org: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_daily_usage: { Args: { _org_id: string }; Returns: number }
      is_agent_of_org: {
        Args: { _agent: string; _org: string }
        Returns: boolean
      }
      is_superadmin: { Args: { _user_id: string }; Returns: boolean }
      org_name_exists: { Args: { _name: string }; Returns: boolean }
    }
    Enums: {
      app_role: "superadmin" | "client_admin" | "agent"
      campaign_status: "draft" | "scheduled" | "completed" | "sent"
      connection_status: "connected" | "disconnected" | "pending"
      lead_status: "nuevo" | "interesado" | "cliente" | "perdido"
      message_direction: "inbound" | "outbound"
      org_status: "active" | "suspended"
      plan_type: "trial" | "vip" | "pro" | "elite"
      provider_type: "Evolution_VPS" | "Whapi" | "ZAPI"
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
    Enums: {
      app_role: ["superadmin", "client_admin", "agent"],
      campaign_status: ["draft", "scheduled", "completed", "sent"],
      connection_status: ["connected", "disconnected", "pending"],
      lead_status: ["nuevo", "interesado", "cliente", "perdido"],
      message_direction: ["inbound", "outbound"],
      org_status: ["active", "suspended"],
      plan_type: ["trial", "vip", "pro", "elite"],
      provider_type: ["Evolution_VPS", "Whapi", "ZAPI"],
    },
  },
} as const
