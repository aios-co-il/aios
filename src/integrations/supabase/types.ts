export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17";
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      agencies: {
        Row: {
          contact_name: string | null;
          created_at: string;
          email: string | null;
          folder_link: string | null;
          id: string;
          is_default: boolean | null;
          name: string;
          notes: string | null;
          phone: string | null;
          start_date: string | null;
          status: Database["public"]["Enums"]["agency_status"];
          tenant_id: string | null;
          updated_at: string;
        };
        Insert: {
          contact_name?: string | null;
          created_at?: string;
          email?: string | null;
          folder_link?: string | null;
          id?: string;
          is_default?: boolean | null;
          name: string;
          notes?: string | null;
          phone?: string | null;
          start_date?: string | null;
          status?: Database["public"]["Enums"]["agency_status"];
          tenant_id?: string | null;
          updated_at?: string;
        };
        Update: {
          contact_name?: string | null;
          created_at?: string;
          email?: string | null;
          folder_link?: string | null;
          id?: string;
          is_default?: boolean | null;
          name?: string;
          notes?: string | null;
          phone?: string | null;
          start_date?: string | null;
          status?: Database["public"]["Enums"]["agency_status"];
          tenant_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agencies_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      agency_tenant_access: {
        Row: {
          access_level: string | null;
          accessing_tenant_id: string;
          agency_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          notes: string | null;
          source_tenant_id: string;
        };
        Insert: {
          access_level?: string | null;
          accessing_tenant_id: string;
          agency_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          notes?: string | null;
          source_tenant_id: string;
        };
        Update: {
          access_level?: string | null;
          accessing_tenant_id?: string;
          agency_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          notes?: string | null;
          source_tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agency_tenant_access_accessing_tenant_id_fkey";
            columns: ["accessing_tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agency_tenant_access_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agency_tenant_access_source_tenant_id_fkey";
            columns: ["source_tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_action_log: {
        Row: {
          action_details: Json;
          action_type: string;
          agent_id: string | null;
          conversation_id: string | null;
          cost_usd: number | null;
          created_at: string;
          duration_ms: number | null;
          error_message: string | null;
          id: string;
          model: string | null;
          observation: Json | null;
          run_id: string | null;
          status: string;
          step_index: number | null;
          step_kind: string | null;
          tenant_id: string;
          thought: string | null;
          tokens_in: number | null;
          tokens_out: number | null;
          tool_calls: number | null;
          user_id: string | null;
        };
        Insert: {
          action_details?: Json;
          action_type: string;
          agent_id?: string | null;
          conversation_id?: string | null;
          cost_usd?: number | null;
          created_at?: string;
          duration_ms?: number | null;
          error_message?: string | null;
          id?: string;
          model?: string | null;
          observation?: Json | null;
          run_id?: string | null;
          status?: string;
          step_index?: number | null;
          step_kind?: string | null;
          tenant_id: string;
          thought?: string | null;
          tokens_in?: number | null;
          tokens_out?: number | null;
          tool_calls?: number | null;
          user_id?: string | null;
        };
        Update: {
          action_details?: Json;
          action_type?: string;
          agent_id?: string | null;
          conversation_id?: string | null;
          cost_usd?: number | null;
          created_at?: string;
          duration_ms?: number | null;
          error_message?: string | null;
          id?: string;
          model?: string | null;
          observation?: Json | null;
          run_id?: string | null;
          status?: string;
          step_index?: number | null;
          step_kind?: string | null;
          tenant_id?: string;
          thought?: string | null;
          tokens_in?: number | null;
          tokens_out?: number | null;
          tool_calls?: number | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      agent_approval_queue: {
        Row: {
          action_type: string;
          agent_id: string | null;
          approved_at: string | null;
          approved_by: string | null;
          context: Json | null;
          created_at: string;
          description: string | null;
          executed_at: string | null;
          execution_result: Json | null;
          expires_at: string | null;
          id: string;
          proposed_changes: Json | null;
          requested_by: string | null;
          run_id: string | null;
          status: string;
          tenant_id: string;
          title: string;
          tool_input: Json | null;
          tool_name: string | null;
        };
        Insert: {
          action_type: string;
          agent_id?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          context?: Json | null;
          created_at?: string;
          description?: string | null;
          executed_at?: string | null;
          execution_result?: Json | null;
          expires_at?: string | null;
          id?: string;
          proposed_changes?: Json | null;
          requested_by?: string | null;
          run_id?: string | null;
          status?: string;
          tenant_id: string;
          title: string;
          tool_input?: Json | null;
          tool_name?: string | null;
        };
        Update: {
          action_type?: string;
          agent_id?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          context?: Json | null;
          created_at?: string;
          description?: string | null;
          executed_at?: string | null;
          execution_result?: Json | null;
          expires_at?: string | null;
          id?: string;
          proposed_changes?: Json | null;
          requested_by?: string | null;
          run_id?: string | null;
          status?: string;
          tenant_id?: string;
          title?: string;
          tool_input?: Json | null;
          tool_name?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "agent_approval_queue_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "ai_agents";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_batch_reports: {
        Row: {
          batch_id: string;
          sent_at: string;
        };
        Insert: {
          batch_id: string;
          sent_at?: string;
        };
        Update: {
          batch_id?: string;
          sent_at?: string;
        };
        Relationships: [];
      };
      agent_brain_routes: {
        Row: {
          active: boolean;
          agent_id: string | null;
          config: Json;
          connection_id: string | null;
          created_at: string;
          id: string;
          label: string;
          provider: string | null;
          route_type: string;
          slug: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          agent_id?: string | null;
          config?: Json;
          connection_id?: string | null;
          created_at?: string;
          id?: string;
          label: string;
          provider?: string | null;
          route_type?: string;
          slug: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          agent_id?: string | null;
          config?: Json;
          connection_id?: string | null;
          created_at?: string;
          id?: string;
          label?: string;
          provider?: string | null;
          route_type?: string;
          slug?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      agent_channel_sessions: {
        Row: {
          brain_route_id: string | null;
          conversation_id: string;
          conversation_key: string | null;
          created_at: string;
          external_run_id: string | null;
          external_session_id: string | null;
          external_url: string | null;
          id: string;
          last_activity_at: string;
          metadata: Json;
          parliament_round: number | null;
          parliament_run_id: string | null;
          provider: string;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          brain_route_id?: string | null;
          conversation_id: string;
          conversation_key?: string | null;
          created_at?: string;
          external_run_id?: string | null;
          external_session_id?: string | null;
          external_url?: string | null;
          id?: string;
          last_activity_at?: string;
          metadata?: Json;
          parliament_round?: number | null;
          parliament_run_id?: string | null;
          provider: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          brain_route_id?: string | null;
          conversation_id?: string;
          conversation_key?: string | null;
          created_at?: string;
          external_run_id?: string | null;
          external_session_id?: string | null;
          external_url?: string | null;
          id?: string;
          last_activity_at?: string;
          metadata?: Json;
          parliament_round?: number | null;
          parliament_run_id?: string | null;
          provider?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_channel_sessions_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "ai_conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_collaboration_agents: {
        Row: {
          agent_key: string;
          capabilities: string[];
          created_at: string;
          current_task_id: string | null;
          display_name: string;
          id: string;
          last_seen_at: string;
          metadata: Json;
          status: string;
          tenant_id: string | null;
          updated_at: string;
        };
        Insert: {
          agent_key: string;
          capabilities?: string[];
          created_at?: string;
          current_task_id?: string | null;
          display_name: string;
          id?: string;
          last_seen_at?: string;
          metadata?: Json;
          status?: string;
          tenant_id?: string | null;
          updated_at?: string;
        };
        Update: {
          agent_key?: string;
          capabilities?: string[];
          created_at?: string;
          current_task_id?: string | null;
          display_name?: string;
          id?: string;
          last_seen_at?: string;
          metadata?: Json;
          status?: string;
          tenant_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_collaboration_agents_current_task_id_fkey";
            columns: ["current_task_id"];
            isOneToOne: false;
            referencedRelation: "agent_collaboration_tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_collaboration_messages: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          message_type: string;
          metadata: Json;
          read_by: string[];
          recipient: string | null;
          sender: string;
          task_id: string | null;
          tenant_id: string | null;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          message_type?: string;
          metadata?: Json;
          read_by?: string[];
          recipient?: string | null;
          sender: string;
          task_id?: string | null;
          tenant_id?: string | null;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          message_type?: string;
          metadata?: Json;
          read_by?: string[];
          recipient?: string | null;
          sender?: string;
          task_id?: string | null;
          tenant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "agent_collaboration_messages_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "agent_collaboration_tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_collaboration_tasks: {
        Row: {
          acceptance_criteria: string[];
          assigned_to: string | null;
          branch: string | null;
          claimed_at: string | null;
          completed_at: string | null;
          created_at: string;
          created_by: string;
          description: string;
          id: string;
          metadata: Json;
          preview_url: string | null;
          priority: string;
          pull_request_url: string | null;
          status: string;
          tenant_id: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          acceptance_criteria?: string[];
          assigned_to?: string | null;
          branch?: string | null;
          claimed_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by: string;
          description?: string;
          id?: string;
          metadata?: Json;
          preview_url?: string | null;
          priority?: string;
          pull_request_url?: string | null;
          status?: string;
          tenant_id?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          acceptance_criteria?: string[];
          assigned_to?: string | null;
          branch?: string | null;
          claimed_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string;
          description?: string;
          id?: string;
          metadata?: Json;
          preview_url?: string | null;
          priority?: string;
          pull_request_url?: string | null;
          status?: string;
          tenant_id?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      agent_credentials: {
        Row: {
          created_at: string;
          created_by: string | null;
          credential_name: string;
          credential_type: string;
          encrypted_value: string;
          id: string;
          metadata: Json | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          credential_name: string;
          credential_type: string;
          encrypted_value: string;
          id?: string;
          metadata?: Json | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          credential_name?: string;
          credential_type?: string;
          encrypted_value?: string;
          id?: string;
          metadata?: Json | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_credentials_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_eval_runs: {
        Row: {
          agent_id: string;
          avg_score: number | null;
          completed_at: string | null;
          eval_id: string;
          id: string;
          passed_cases: number;
          results: Json | null;
          started_at: string;
          status: string;
          tenant_id: string;
          total_cases: number;
        };
        Insert: {
          agent_id: string;
          avg_score?: number | null;
          completed_at?: string | null;
          eval_id: string;
          id?: string;
          passed_cases?: number;
          results?: Json | null;
          started_at?: string;
          status?: string;
          tenant_id: string;
          total_cases?: number;
        };
        Update: {
          agent_id?: string;
          avg_score?: number | null;
          completed_at?: string | null;
          eval_id?: string;
          id?: string;
          passed_cases?: number;
          results?: Json | null;
          started_at?: string;
          status?: string;
          tenant_id?: string;
          total_cases?: number;
        };
        Relationships: [];
      };
      agent_evals: {
        Row: {
          agent_id: string;
          created_at: string;
          dataset: Json;
          description: string | null;
          id: string;
          name: string;
          pass_threshold: number;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          agent_id: string;
          created_at?: string;
          dataset?: Json;
          description?: string | null;
          id?: string;
          name: string;
          pass_threshold?: number;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          agent_id?: string;
          created_at?: string;
          dataset?: Json;
          description?: string | null;
          id?: string;
          name?: string;
          pass_threshold?: number;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      agent_goals: {
        Row: {
          agent_id: string;
          created_at: string;
          description: string | null;
          id: string;
          metadata: Json;
          priority: string;
          status: string;
          target_date: string | null;
          tenant_id: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          agent_id: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          metadata?: Json;
          priority?: string;
          status?: string;
          target_date?: string | null;
          tenant_id: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          agent_id?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          metadata?: Json;
          priority?: string;
          status?: string;
          target_date?: string | null;
          tenant_id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      agent_knowledge_folders: {
        Row: {
          agent_id: string;
          created_at: string;
          icon: string | null;
          id: string;
          name: string;
          parent_folder_id: string | null;
          position: number;
          tenant_id: string;
        };
        Insert: {
          agent_id: string;
          created_at?: string;
          icon?: string | null;
          id?: string;
          name: string;
          parent_folder_id?: string | null;
          position?: number;
          tenant_id: string;
        };
        Update: {
          agent_id?: string;
          created_at?: string;
          icon?: string | null;
          id?: string;
          name?: string;
          parent_folder_id?: string | null;
          position?: number;
          tenant_id?: string;
        };
        Relationships: [];
      };
      agent_knowledge_items: {
        Row: {
          agent_id: string;
          content: string | null;
          created_at: string;
          embedding: string | null;
          folder_id: string | null;
          id: string;
          kind: string;
          tags: string[];
          tenant_id: string;
          title: string;
          updated_at: string;
          url: string | null;
        };
        Insert: {
          agent_id: string;
          content?: string | null;
          created_at?: string;
          embedding?: string | null;
          folder_id?: string | null;
          id?: string;
          kind?: string;
          tags?: string[];
          tenant_id: string;
          title: string;
          updated_at?: string;
          url?: string | null;
        };
        Update: {
          agent_id?: string;
          content?: string | null;
          created_at?: string;
          embedding?: string | null;
          folder_id?: string | null;
          id?: string;
          kind?: string;
          tags?: string[];
          tenant_id?: string;
          title?: string;
          updated_at?: string;
          url?: string | null;
        };
        Relationships: [];
      };
      agent_mcp_connections: {
        Row: {
          agent_id: string | null;
          auth_url: string | null;
          available_tools: Json | null;
          client_metadata: Json | null;
          created_at: string;
          id: string;
          last_error: string | null;
          name: string;
          oauth_tokens: Json | null;
          state: string;
          tenant_id: string;
          transport: string;
          updated_at: string;
          url: string;
        };
        Insert: {
          agent_id?: string | null;
          auth_url?: string | null;
          available_tools?: Json | null;
          client_metadata?: Json | null;
          created_at?: string;
          id?: string;
          last_error?: string | null;
          name: string;
          oauth_tokens?: Json | null;
          state?: string;
          tenant_id: string;
          transport?: string;
          updated_at?: string;
          url: string;
        };
        Update: {
          agent_id?: string | null;
          auth_url?: string | null;
          available_tools?: Json | null;
          client_metadata?: Json | null;
          created_at?: string;
          id?: string;
          last_error?: string | null;
          name?: string;
          oauth_tokens?: Json | null;
          state?: string;
          tenant_id?: string;
          transport?: string;
          updated_at?: string;
          url?: string;
        };
        Relationships: [];
      };
      agent_memory: {
        Row: {
          agent_id: string;
          category: string;
          contact_phone: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string | null;
          fts: unknown;
          id: string;
          importance: number;
          memory_type: Database["public"]["Enums"]["agent_memory_layer"];
          metadata: Json;
          path: string | null;
          ref_date: string | null;
          subcategory: string | null;
          summary: string | null;
          summary_embedding: string | null;
          tenant_id: string;
          title: string;
          updated_at: string;
          valid_until: string | null;
        };
        Insert: {
          agent_id: string;
          category?: string;
          contact_phone?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          fts?: unknown;
          id?: string;
          importance?: number;
          memory_type?: Database["public"]["Enums"]["agent_memory_layer"];
          metadata?: Json;
          path?: string | null;
          ref_date?: string | null;
          subcategory?: string | null;
          summary?: string | null;
          summary_embedding?: string | null;
          tenant_id: string;
          title: string;
          updated_at?: string;
          valid_until?: string | null;
        };
        Update: {
          agent_id?: string;
          category?: string;
          contact_phone?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          fts?: unknown;
          id?: string;
          importance?: number;
          memory_type?: Database["public"]["Enums"]["agent_memory_layer"];
          metadata?: Json;
          path?: string | null;
          ref_date?: string | null;
          subcategory?: string | null;
          summary?: string | null;
          summary_embedding?: string | null;
          tenant_id?: string;
          title?: string;
          updated_at?: string;
          valid_until?: string | null;
        };
        Relationships: [];
      };
      agent_runs: {
        Row: {
          agent_id: string;
          completed_at: string | null;
          context: Json;
          conversation_id: string | null;
          created_at: string;
          current_step: number;
          delegated_to_agent_id: string | null;
          duration_ms: number | null;
          error_message: string | null;
          final_answer: string | null;
          goal: string;
          id: string;
          max_steps: number;
          model: string | null;
          parent_run_id: string | null;
          pending_approval_id: string | null;
          replay_of_run_id: string | null;
          started_at: string;
          status: string;
          tenant_id: string;
          total_cost_usd: number;
          total_tokens_in: number;
          total_tokens_out: number;
          trigger_source: string | null;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          agent_id: string;
          completed_at?: string | null;
          context?: Json;
          conversation_id?: string | null;
          created_at?: string;
          current_step?: number;
          delegated_to_agent_id?: string | null;
          duration_ms?: number | null;
          error_message?: string | null;
          final_answer?: string | null;
          goal: string;
          id?: string;
          max_steps?: number;
          model?: string | null;
          parent_run_id?: string | null;
          pending_approval_id?: string | null;
          replay_of_run_id?: string | null;
          started_at?: string;
          status?: string;
          tenant_id: string;
          total_cost_usd?: number;
          total_tokens_in?: number;
          total_tokens_out?: number;
          trigger_source?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          agent_id?: string;
          completed_at?: string | null;
          context?: Json;
          conversation_id?: string | null;
          created_at?: string;
          current_step?: number;
          delegated_to_agent_id?: string | null;
          duration_ms?: number | null;
          error_message?: string | null;
          final_answer?: string | null;
          goal?: string;
          id?: string;
          max_steps?: number;
          model?: string | null;
          parent_run_id?: string | null;
          pending_approval_id?: string | null;
          replay_of_run_id?: string | null;
          started_at?: string;
          status?: string;
          tenant_id?: string;
          total_cost_usd?: number;
          total_tokens_in?: number;
          total_tokens_out?: number;
          trigger_source?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      agent_supervisors: {
        Row: {
          child_agent_id: string;
          created_at: string;
          enabled: boolean;
          id: string;
          priority: number;
          routing_hint: string | null;
          supervisor_agent_id: string;
          tenant_id: string;
        };
        Insert: {
          child_agent_id: string;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          priority?: number;
          routing_hint?: string | null;
          supervisor_agent_id: string;
          tenant_id: string;
        };
        Update: {
          child_agent_id?: string;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          priority?: number;
          routing_hint?: string | null;
          supervisor_agent_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_supervisors_child_agent_id_fkey";
            columns: ["child_agent_id"];
            isOneToOne: false;
            referencedRelation: "ai_agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_supervisors_supervisor_agent_id_fkey";
            columns: ["supervisor_agent_id"];
            isOneToOne: false;
            referencedRelation: "ai_agents";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_tasks: {
        Row: {
          agent_id: string;
          batch_id: string | null;
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          cron_expression: string | null;
          description: string | null;
          enabled: boolean | null;
          engine_model: string | null;
          goal_id: string | null;
          id: string;
          idempotency_key: string | null;
          is_dangerous: boolean;
          last_run: string | null;
          next_run: string | null;
          parallel_execution: boolean | null;
          parallel_subtasks: Json | null;
          priority: number;
          queue_position: number | null;
          result: Json | null;
          run_count: number | null;
          schedule_type: string | null;
          scheduled_at: string | null;
          started_at: string | null;
          status: string;
          task_mode: string | null;
          task_skills: Json | null;
          tenant_id: string;
          timezone: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          agent_id: string;
          batch_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          cron_expression?: string | null;
          description?: string | null;
          enabled?: boolean | null;
          engine_model?: string | null;
          goal_id?: string | null;
          id?: string;
          idempotency_key?: string | null;
          is_dangerous?: boolean;
          last_run?: string | null;
          next_run?: string | null;
          parallel_execution?: boolean | null;
          parallel_subtasks?: Json | null;
          priority?: number;
          queue_position?: number | null;
          result?: Json | null;
          run_count?: number | null;
          schedule_type?: string | null;
          scheduled_at?: string | null;
          started_at?: string | null;
          status?: string;
          task_mode?: string | null;
          task_skills?: Json | null;
          tenant_id: string;
          timezone?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          agent_id?: string;
          batch_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          cron_expression?: string | null;
          description?: string | null;
          enabled?: boolean | null;
          engine_model?: string | null;
          goal_id?: string | null;
          id?: string;
          idempotency_key?: string | null;
          is_dangerous?: boolean;
          last_run?: string | null;
          next_run?: string | null;
          parallel_execution?: boolean | null;
          parallel_subtasks?: Json | null;
          priority?: number;
          queue_position?: number | null;
          result?: Json | null;
          run_count?: number | null;
          schedule_type?: string | null;
          scheduled_at?: string | null;
          started_at?: string | null;
          status?: string;
          task_mode?: string | null;
          task_skills?: Json | null;
          tenant_id?: string;
          timezone?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_tasks_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "ai_agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_tasks_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_tool_embeddings: {
        Row: {
          embedding: string;
          sig: string;
          tool_name: string;
          updated_at: string;
        };
        Insert: {
          embedding: string;
          sig: string;
          tool_name: string;
          updated_at?: string;
        };
        Update: {
          embedding?: string;
          sig?: string;
          tool_name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      agent_tools: {
        Row: {
          category: string;
          created_at: string;
          description: string | null;
          display_name: string;
          enabled: boolean;
          handler_kind: string;
          handler_ref: string | null;
          id: string;
          input_schema: Json;
          metadata: Json;
          name: string;
          requires_approval: boolean;
          tenant_id: string | null;
          updated_at: string;
        };
        Insert: {
          category?: string;
          created_at?: string;
          description?: string | null;
          display_name: string;
          enabled?: boolean;
          handler_kind?: string;
          handler_ref?: string | null;
          id?: string;
          input_schema?: Json;
          metadata?: Json;
          name: string;
          requires_approval?: boolean;
          tenant_id?: string | null;
          updated_at?: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          description?: string | null;
          display_name?: string;
          enabled?: boolean;
          handler_kind?: string;
          handler_ref?: string | null;
          id?: string;
          input_schema?: Json;
          metadata?: Json;
          name?: string;
          requires_approval?: boolean;
          tenant_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      agent_user_profiles: {
        Row: {
          agent_id: string | null;
          contact_phone: string;
          created_at: string;
          display_name: string | null;
          id: string;
          last_interaction_at: string | null;
          profile: Json;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          agent_id?: string | null;
          contact_phone: string;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          last_interaction_at?: string | null;
          profile?: Json;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          agent_id?: string | null;
          contact_phone?: string;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          last_interaction_at?: string | null;
          profile?: Json;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      ahrefs_reports: {
        Row: {
          agency_id: string | null;
          client_id: string | null;
          comparison_data: Json | null;
          created_at: string;
          domain: string;
          id: string;
          metadata: Json | null;
          received_at: string;
          report_data: Json;
          report_date: string | null;
          report_type: string;
          tenant_id: string | null;
        };
        Insert: {
          agency_id?: string | null;
          client_id?: string | null;
          comparison_data?: Json | null;
          created_at?: string;
          domain: string;
          id?: string;
          metadata?: Json | null;
          received_at?: string;
          report_data?: Json;
          report_date?: string | null;
          report_type: string;
          tenant_id?: string | null;
        };
        Update: {
          agency_id?: string | null;
          client_id?: string | null;
          comparison_data?: Json | null;
          created_at?: string;
          domain?: string;
          id?: string;
          metadata?: Json | null;
          received_at?: string;
          report_data?: Json;
          report_date?: string | null;
          report_type?: string;
          tenant_id?: string | null;
        };
        Relationships: [];
      };
      ai_agents: {
        Row: {
          active: boolean | null;
          active_modes: string[] | null;
          active_skills: string[] | null;
          allowed_tools: string[] | null;
          brain_mode: string;
          brain_route_id: string | null;
          created_at: string | null;
          description: string | null;
          disabled_integrations: string[] | null;
          disabled_skins: string[] | null;
          disabled_tools: string[] | null;
          engine: string;
          id: string;
          language: string | null;
          max_tool_rounds: number | null;
          metadata: Json | null;
          mood: string | null;
          name: string;
          personality: string | null;
          response_length: string | null;
          soul: string | null;
          system_prompt: string | null;
          talent: string | null;
          tenant_id: string;
          updated_at: string | null;
          voice: string | null;
          writing_style: string | null;
        };
        Insert: {
          active?: boolean | null;
          active_modes?: string[] | null;
          active_skills?: string[] | null;
          allowed_tools?: string[] | null;
          brain_mode?: string;
          brain_route_id?: string | null;
          created_at?: string | null;
          description?: string | null;
          disabled_integrations?: string[] | null;
          disabled_skins?: string[] | null;
          disabled_tools?: string[] | null;
          engine?: string;
          id?: string;
          language?: string | null;
          max_tool_rounds?: number | null;
          metadata?: Json | null;
          mood?: string | null;
          name: string;
          personality?: string | null;
          response_length?: string | null;
          soul?: string | null;
          system_prompt?: string | null;
          talent?: string | null;
          tenant_id: string;
          updated_at?: string | null;
          voice?: string | null;
          writing_style?: string | null;
        };
        Update: {
          active?: boolean | null;
          active_modes?: string[] | null;
          active_skills?: string[] | null;
          allowed_tools?: string[] | null;
          brain_mode?: string;
          brain_route_id?: string | null;
          created_at?: string | null;
          description?: string | null;
          disabled_integrations?: string[] | null;
          disabled_skins?: string[] | null;
          disabled_tools?: string[] | null;
          engine?: string;
          id?: string;
          language?: string | null;
          max_tool_rounds?: number | null;
          metadata?: Json | null;
          mood?: string | null;
          name?: string;
          personality?: string | null;
          response_length?: string | null;
          soul?: string | null;
          system_prompt?: string | null;
          talent?: string | null;
          tenant_id?: string;
          updated_at?: string | null;
          voice?: string | null;
          writing_style?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ai_agents_brain_route_id_fkey";
            columns: ["brain_route_id"];
            isOneToOne: false;
            referencedRelation: "agent_brain_routes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_agents_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_conversation_messages: {
        Row: {
          channel: string | null;
          content: string;
          conversation_id: string;
          correlation_id: string | null;
          created_at: string;
          event_type: string;
          external_message_id: string | null;
          id: string;
          idempotency_key: string | null;
          metadata: Json;
          role: string;
          speaker: string | null;
          tenant_id: string;
        };
        Insert: {
          channel?: string | null;
          content?: string;
          conversation_id: string;
          correlation_id?: string | null;
          created_at?: string;
          event_type?: string;
          external_message_id?: string | null;
          id?: string;
          idempotency_key?: string | null;
          metadata?: Json;
          role: string;
          speaker?: string | null;
          tenant_id: string;
        };
        Update: {
          channel?: string | null;
          content?: string;
          conversation_id?: string;
          correlation_id?: string | null;
          created_at?: string;
          event_type?: string;
          external_message_id?: string | null;
          id?: string;
          idempotency_key?: string | null;
          metadata?: Json;
          role?: string;
          speaker?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_conversation_messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "ai_conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_conversations: {
        Row: {
          agent_id: string | null;
          brain_route_id: string | null;
          created_at: string;
          id: string;
          messages: Json;
          routing_mode: string;
          status: string;
          tenant_id: string;
          title: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          agent_id?: string | null;
          brain_route_id?: string | null;
          created_at?: string;
          id?: string;
          messages?: Json;
          routing_mode?: string;
          status?: string;
          tenant_id: string;
          title?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          agent_id?: string | null;
          brain_route_id?: string | null;
          created_at?: string;
          id?: string;
          messages?: Json;
          routing_mode?: string;
          status?: string;
          tenant_id?: string;
          title?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_conversations_brain_route_id_fkey";
            columns: ["brain_route_id"];
            isOneToOne: false;
            referencedRelation: "agent_brain_routes";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_detection_brands: {
        Row: {
          brand_name: string;
          competitor_names: string[];
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          keywords: string[];
          tenant_id: string;
          updated_at: string;
          url: string | null;
        };
        Insert: {
          brand_name: string;
          competitor_names?: string[];
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          keywords?: string[];
          tenant_id: string;
          updated_at?: string;
          url?: string | null;
        };
        Update: {
          brand_name?: string;
          competitor_names?: string[];
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          keywords?: string[];
          tenant_id?: string;
          updated_at?: string;
          url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ai_detection_brands_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_detection_competitor_results: {
        Row: {
          brand_id: string;
          competitor_name: string;
          id: string;
          is_mentioned: boolean;
          platform: string;
          position: number | null;
          prompt_id: string;
          scan_id: string | null;
          scanned_at: string;
          tenant_id: string;
        };
        Insert: {
          brand_id: string;
          competitor_name: string;
          id?: string;
          is_mentioned?: boolean;
          platform: string;
          position?: number | null;
          prompt_id: string;
          scan_id?: string | null;
          scanned_at?: string;
          tenant_id: string;
        };
        Update: {
          brand_id?: string;
          competitor_name?: string;
          id?: string;
          is_mentioned?: boolean;
          platform?: string;
          position?: number | null;
          prompt_id?: string;
          scan_id?: string | null;
          scanned_at?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_detection_competitor_results_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "ai_detection_brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_detection_competitor_results_prompt_id_fkey";
            columns: ["prompt_id"];
            isOneToOne: false;
            referencedRelation: "ai_detection_prompts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_detection_competitor_results_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_detection_prompts: {
        Row: {
          brand_id: string;
          category: string;
          created_at: string;
          created_by: string | null;
          id: string;
          is_active: boolean;
          prompt: string;
          tenant_id: string;
        };
        Insert: {
          brand_id: string;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          prompt: string;
          tenant_id: string;
        };
        Update: {
          brand_id?: string;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          prompt?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_detection_prompts_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "ai_detection_brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_detection_prompts_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_detection_results: {
        Row: {
          brand_id: string;
          citations: string[] | null;
          id: string;
          is_mentioned: boolean;
          platform: string;
          position: number | null;
          prompt_id: string;
          response_snippet: string | null;
          scan_id: string | null;
          scanned_at: string;
          sentiment: string | null;
          tenant_id: string;
        };
        Insert: {
          brand_id: string;
          citations?: string[] | null;
          id?: string;
          is_mentioned?: boolean;
          platform: string;
          position?: number | null;
          prompt_id: string;
          response_snippet?: string | null;
          scan_id?: string | null;
          scanned_at?: string;
          sentiment?: string | null;
          tenant_id: string;
        };
        Update: {
          brand_id?: string;
          citations?: string[] | null;
          id?: string;
          is_mentioned?: boolean;
          platform?: string;
          position?: number | null;
          prompt_id?: string;
          response_snippet?: string | null;
          scan_id?: string | null;
          scanned_at?: string;
          sentiment?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_detection_results_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "ai_detection_brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_detection_results_prompt_id_fkey";
            columns: ["prompt_id"];
            isOneToOne: false;
            referencedRelation: "ai_detection_prompts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_detection_results_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_detection_scores: {
        Row: {
          brand_id: string;
          chatgpt_score: number | null;
          created_at: string;
          gemini_score: number | null;
          id: string;
          mentioned_prompts: number;
          perplexity_score: number | null;
          score: number;
          tenant_id: string;
          total_prompts: number;
          week_start: string;
        };
        Insert: {
          brand_id: string;
          chatgpt_score?: number | null;
          created_at?: string;
          gemini_score?: number | null;
          id?: string;
          mentioned_prompts?: number;
          perplexity_score?: number | null;
          score: number;
          tenant_id: string;
          total_prompts?: number;
          week_start: string;
        };
        Update: {
          brand_id?: string;
          chatgpt_score?: number | null;
          created_at?: string;
          gemini_score?: number | null;
          id?: string;
          mentioned_prompts?: number;
          perplexity_score?: number | null;
          score?: number;
          tenant_id?: string;
          total_prompts?: number;
          week_start?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_detection_scores_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "ai_detection_brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_detection_scores_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_memory: {
        Row: {
          category: string;
          content: string;
          created_at: string;
          id: string;
          key: string;
          tenant_id: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          category?: string;
          content: string;
          created_at?: string;
          id?: string;
          key: string;
          tenant_id: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          category?: string;
          content?: string;
          created_at?: string;
          id?: string;
          key?: string;
          tenant_id?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ai_memory_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_skills: {
        Row: {
          allowed_tools: string[] | null;
          constraints: string | null;
          created_at: string;
          created_by_agent: boolean;
          description: string;
          goal: string | null;
          handoff_slugs: string[] | null;
          id: string;
          is_active: boolean;
          last_used_at: string | null;
          model: string | null;
          name: string;
          output_template: string | null;
          scope: string;
          search_vector: unknown;
          slug: string | null;
          steps: string;
          success_rate: number | null;
          system_prompt: string | null;
          tenant_id: string | null;
          trigger_phrases: string[] | null;
          triggers: string[] | null;
          updated_at: string;
          usage_count: number;
          user_id: string | null;
          version: number;
        };
        Insert: {
          allowed_tools?: string[] | null;
          constraints?: string | null;
          created_at?: string;
          created_by_agent?: boolean;
          description: string;
          goal?: string | null;
          handoff_slugs?: string[] | null;
          id?: string;
          is_active?: boolean;
          last_used_at?: string | null;
          model?: string | null;
          name: string;
          output_template?: string | null;
          scope?: string;
          search_vector?: unknown;
          slug?: string | null;
          steps: string;
          success_rate?: number | null;
          system_prompt?: string | null;
          tenant_id?: string | null;
          trigger_phrases?: string[] | null;
          triggers?: string[] | null;
          updated_at?: string;
          usage_count?: number;
          user_id?: string | null;
          version?: number;
        };
        Update: {
          allowed_tools?: string[] | null;
          constraints?: string | null;
          created_at?: string;
          created_by_agent?: boolean;
          description?: string;
          goal?: string | null;
          handoff_slugs?: string[] | null;
          id?: string;
          is_active?: boolean;
          last_used_at?: string | null;
          model?: string | null;
          name?: string;
          output_template?: string | null;
          scope?: string;
          search_vector?: unknown;
          slug?: string | null;
          steps?: string;
          success_rate?: number | null;
          system_prompt?: string | null;
          tenant_id?: string | null;
          trigger_phrases?: string[] | null;
          triggers?: string[] | null;
          updated_at?: string;
          usage_count?: number;
          user_id?: string | null;
          version?: number;
        };
        Relationships: [];
      };
      ai_usage_log: {
        Row: {
          cost_usd: number | null;
          created_at: string;
          id: string;
          meta: Json;
          model: string | null;
          source: string;
          tenant_id: string | null;
          tokens_in: number | null;
          tokens_out: number | null;
        };
        Insert: {
          cost_usd?: number | null;
          created_at?: string;
          id?: string;
          meta?: Json;
          model?: string | null;
          source: string;
          tenant_id?: string | null;
          tokens_in?: number | null;
          tokens_out?: number | null;
        };
        Update: {
          cost_usd?: number | null;
          created_at?: string;
          id?: string;
          meta?: Json;
          model?: string | null;
          source?: string;
          tenant_id?: string | null;
          tokens_in?: number | null;
          tokens_out?: number | null;
        };
        Relationships: [];
      };
      aios_graph_edges: {
        Row: {
          confidence: string | null;
          confidence_score: number | null;
          edge_key: string;
          relation: string;
          source_file: string | null;
          source_id: string;
          source_location: string | null;
          target_id: string;
          version: string;
          weight: number | null;
        };
        Insert: {
          confidence?: string | null;
          confidence_score?: number | null;
          edge_key: string;
          relation: string;
          source_file?: string | null;
          source_id: string;
          source_location?: string | null;
          target_id: string;
          version: string;
          weight?: number | null;
        };
        Update: {
          confidence?: string | null;
          confidence_score?: number | null;
          edge_key?: string;
          relation?: string;
          source_file?: string | null;
          source_id?: string;
          source_location?: string | null;
          target_id?: string;
          version?: string;
          weight?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "aios_graph_edges_version_fkey";
            columns: ["version"];
            isOneToOne: false;
            referencedRelation: "aios_graph_versions";
            referencedColumns: ["version"];
          },
          {
            foreignKeyName: "aios_graph_edges_version_source_id_fkey";
            columns: ["version", "source_id"];
            isOneToOne: false;
            referencedRelation: "aios_graph_nodes";
            referencedColumns: ["version", "id"];
          },
          {
            foreignKeyName: "aios_graph_edges_version_target_id_fkey";
            columns: ["version", "target_id"];
            isOneToOne: false;
            referencedRelation: "aios_graph_nodes";
            referencedColumns: ["version", "id"];
          },
        ];
      };
      aios_graph_nodes: {
        Row: {
          community: number | null;
          community_name: string | null;
          file_type: string | null;
          id: string;
          label: string;
          search_document: unknown;
          source_file: string | null;
          source_location: string | null;
          version: string;
        };
        Insert: {
          community?: number | null;
          community_name?: string | null;
          file_type?: string | null;
          id: string;
          label: string;
          search_document?: unknown;
          source_file?: string | null;
          source_location?: string | null;
          version: string;
        };
        Update: {
          community?: number | null;
          community_name?: string | null;
          file_type?: string | null;
          id?: string;
          label?: string;
          search_document?: unknown;
          source_file?: string | null;
          source_location?: string | null;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: "aios_graph_nodes_version_fkey";
            columns: ["version"];
            isOneToOne: false;
            referencedRelation: "aios_graph_versions";
            referencedColumns: ["version"];
          },
        ];
      };
      aios_graph_versions: {
        Row: {
          activated_at: string | null;
          commit_sha: string | null;
          created_at: string;
          edge_count: number;
          node_count: number;
          status: string;
          version: string;
        };
        Insert: {
          activated_at?: string | null;
          commit_sha?: string | null;
          created_at?: string;
          edge_count?: number;
          node_count?: number;
          status?: string;
          version: string;
        };
        Update: {
          activated_at?: string | null;
          commit_sha?: string | null;
          created_at?: string;
          edge_count?: number;
          node_count?: number;
          status?: string;
          version?: string;
        };
        Relationships: [];
      };
      automation_executions: {
        Row: {
          actions_count: number;
          automation_id: string | null;
          depth: number;
          entity_id: string | null;
          error: string | null;
          execution_id: string;
          finished_at: string | null;
          id: string;
          started_at: string;
          status: string;
          tenant_id: string;
          trigger_type: string | null;
        };
        Insert: {
          actions_count?: number;
          automation_id?: string | null;
          depth?: number;
          entity_id?: string | null;
          error?: string | null;
          execution_id: string;
          finished_at?: string | null;
          id?: string;
          started_at?: string;
          status?: string;
          tenant_id: string;
          trigger_type?: string | null;
        };
        Update: {
          actions_count?: number;
          automation_id?: string | null;
          depth?: number;
          entity_id?: string | null;
          error?: string | null;
          execution_id?: string;
          finished_at?: string | null;
          id?: string;
          started_at?: string;
          status?: string;
          tenant_id?: string;
          trigger_type?: string | null;
        };
        Relationships: [];
      };
      automation_flow_steps: {
        Row: {
          action_type: string | null;
          automation_id: string;
          condition_branch: string | null;
          configuration: Json;
          created_at: string;
          id: string;
          label: string | null;
          parent_step_id: string | null;
          position_x: number;
          position_y: number;
          sort_order: number;
          step_type: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          action_type?: string | null;
          automation_id: string;
          condition_branch?: string | null;
          configuration?: Json;
          created_at?: string;
          id?: string;
          label?: string | null;
          parent_step_id?: string | null;
          position_x?: number;
          position_y?: number;
          sort_order?: number;
          step_type?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          action_type?: string | null;
          automation_id?: string;
          condition_branch?: string | null;
          configuration?: Json;
          created_at?: string;
          id?: string;
          label?: string | null;
          parent_step_id?: string | null;
          position_x?: number;
          position_y?: number;
          sort_order?: number;
          step_type?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "automation_flow_steps_automation_id_fkey";
            columns: ["automation_id"];
            isOneToOne: false;
            referencedRelation: "automations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "automation_flow_steps_parent_step_id_fkey";
            columns: ["parent_step_id"];
            isOneToOne: false;
            referencedRelation: "automation_flow_steps";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "automation_flow_steps_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      automation_logs: {
        Row: {
          automation_id: string;
          error_message: string | null;
          execution_time_ms: number | null;
          id: string;
          payload: Json | null;
          response: Json | null;
          success: boolean;
          triggered_at: string | null;
        };
        Insert: {
          automation_id: string;
          error_message?: string | null;
          execution_time_ms?: number | null;
          id?: string;
          payload?: Json | null;
          response?: Json | null;
          success: boolean;
          triggered_at?: string | null;
        };
        Update: {
          automation_id?: string;
          error_message?: string | null;
          execution_time_ms?: number | null;
          id?: string;
          payload?: Json | null;
          response?: Json | null;
          success?: boolean;
          triggered_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "automation_logs_automation_id_fkey";
            columns: ["automation_id"];
            isOneToOne: false;
            referencedRelation: "automations";
            referencedColumns: ["id"];
          },
        ];
      };
      automation_shared_tenants: {
        Row: {
          automation_id: string;
          shared_at: string;
          shared_by: string | null;
          tenant_id: string;
        };
        Insert: {
          automation_id: string;
          shared_at?: string;
          shared_by?: string | null;
          tenant_id: string;
        };
        Update: {
          automation_id?: string;
          shared_at?: string;
          shared_by?: string | null;
          tenant_id?: string;
        };
        Relationships: [];
      };
      automations: {
        Row: {
          action_type: Database["public"]["Enums"]["automation_action"];
          active: boolean | null;
          conditions: Json | null;
          configuration: Json;
          created_at: string | null;
          description: string | null;
          id: string;
          is_flow: boolean;
          name: string;
          source_automation_id: string | null;
          source_tenant_id: string | null;
          tenant_id: string | null;
          trigger_type: Database["public"]["Enums"]["automation_trigger"];
          updated_at: string | null;
        };
        Insert: {
          action_type: Database["public"]["Enums"]["automation_action"];
          active?: boolean | null;
          conditions?: Json | null;
          configuration: Json;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          is_flow?: boolean;
          name: string;
          source_automation_id?: string | null;
          source_tenant_id?: string | null;
          tenant_id?: string | null;
          trigger_type: Database["public"]["Enums"]["automation_trigger"];
          updated_at?: string | null;
        };
        Update: {
          action_type?: Database["public"]["Enums"]["automation_action"];
          active?: boolean | null;
          conditions?: Json | null;
          configuration?: Json;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          is_flow?: boolean;
          name?: string;
          source_automation_id?: string | null;
          source_tenant_id?: string | null;
          tenant_id?: string | null;
          trigger_type?: Database["public"]["Enums"]["automation_trigger"];
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "automations_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      blocked_contacts: {
        Row: {
          blocked_at: string;
          blocked_by_user_id: string | null;
          client_id: string | null;
          connection_user_id: string;
          created_at: string;
          group_id: string | null;
          id: string;
          lead_id: string | null;
          sender_phone: string | null;
          tenant_id: string;
        };
        Insert: {
          blocked_at?: string;
          blocked_by_user_id?: string | null;
          client_id?: string | null;
          connection_user_id: string;
          created_at?: string;
          group_id?: string | null;
          id?: string;
          lead_id?: string | null;
          sender_phone?: string | null;
          tenant_id: string;
        };
        Update: {
          blocked_at?: string;
          blocked_by_user_id?: string | null;
          client_id?: string | null;
          connection_user_id?: string;
          created_at?: string;
          group_id?: string | null;
          id?: string;
          lead_id?: string | null;
          sender_phone?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "blocked_contacts_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "blocked_contacts_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "blocked_contacts_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "blocked_contacts_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      broadcast_email_domains: {
        Row: {
          created_at: string;
          created_by: string | null;
          default_local: string;
          domain: string;
          from_name: string | null;
          id: string;
          is_default: boolean;
          tenant_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          default_local?: string;
          domain: string;
          from_name?: string | null;
          id?: string;
          is_default?: boolean;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          default_local?: string;
          domain?: string;
          from_name?: string | null;
          id?: string;
          is_default?: boolean;
          tenant_id?: string;
        };
        Relationships: [];
      };
      broadcast_list_members: {
        Row: {
          added_via: string;
          created_at: string;
          custom_fields: Json;
          email: string | null;
          entity_id: string | null;
          entity_type: string;
          id: string;
          list_id: string;
          name: string | null;
          phone: string | null;
          tenant_id: string;
        };
        Insert: {
          added_via?: string;
          created_at?: string;
          custom_fields?: Json;
          email?: string | null;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          list_id: string;
          name?: string | null;
          phone?: string | null;
          tenant_id: string;
        };
        Update: {
          added_via?: string;
          created_at?: string;
          custom_fields?: Json;
          email?: string | null;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          list_id?: string;
          name?: string | null;
          phone?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "broadcast_list_members_list_id_fkey";
            columns: ["list_id"];
            isOneToOne: false;
            referencedRelation: "broadcast_lists";
            referencedColumns: ["id"];
          },
        ];
      };
      broadcast_list_rules: {
        Row: {
          created_at: string;
          created_by: string | null;
          enabled: boolean;
          filter: Json;
          id: string;
          list_id: string;
          tenant_id: string;
          trigger: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          enabled?: boolean;
          filter?: Json;
          id?: string;
          list_id: string;
          tenant_id: string;
          trigger?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          enabled?: boolean;
          filter?: Json;
          id?: string;
          list_id?: string;
          tenant_id?: string;
          trigger?: string;
        };
        Relationships: [
          {
            foreignKeyName: "broadcast_list_rules_list_id_fkey";
            columns: ["list_id"];
            isOneToOne: false;
            referencedRelation: "broadcast_lists";
            referencedColumns: ["id"];
          },
        ];
      };
      broadcast_lists: {
        Row: {
          auto_sync_enabled: boolean;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          kind: string;
          last_sync_error: string | null;
          last_sync_error_at: string | null;
          last_sync_status: string | null;
          last_synced_at: string | null;
          member_count: number;
          name: string;
          source: string;
          source_config: Json;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          auto_sync_enabled?: boolean;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          kind?: string;
          last_sync_error?: string | null;
          last_sync_error_at?: string | null;
          last_sync_status?: string | null;
          last_synced_at?: string | null;
          member_count?: number;
          name: string;
          source?: string;
          source_config?: Json;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          auto_sync_enabled?: boolean;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          kind?: string;
          last_sync_error?: string | null;
          last_sync_error_at?: string | null;
          last_sync_status?: string | null;
          last_synced_at?: string | null;
          member_count?: number;
          name?: string;
          source?: string;
          source_config?: Json;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      broadcast_opt_outs: {
        Row: {
          channel: string;
          created_at: string;
          email: string | null;
          id: string;
          phone: string | null;
          reason: string | null;
          source: string | null;
          tenant_id: string;
        };
        Insert: {
          channel?: string;
          created_at?: string;
          email?: string | null;
          id?: string;
          phone?: string | null;
          reason?: string | null;
          source?: string | null;
          tenant_id: string;
        };
        Update: {
          channel?: string;
          created_at?: string;
          email?: string | null;
          id?: string;
          phone?: string | null;
          reason?: string | null;
          source?: string | null;
          tenant_id?: string;
        };
        Relationships: [];
      };
      broadcast_recipients: {
        Row: {
          attempts: number;
          broadcast_id: string;
          clicked_at: string | null;
          contact_name: string | null;
          created_at: string;
          delivered_at: string | null;
          email: string | null;
          entity_id: string | null;
          entity_type: string;
          error: string | null;
          group_chat_id: string | null;
          id: string;
          opened_at: string | null;
          phone: string | null;
          provider_message_id: string | null;
          read_at: string | null;
          sent_at: string | null;
          status: string;
          tenant_id: string;
          updated_at: string;
          vars: Json;
        };
        Insert: {
          attempts?: number;
          broadcast_id: string;
          clicked_at?: string | null;
          contact_name?: string | null;
          created_at?: string;
          delivered_at?: string | null;
          email?: string | null;
          entity_id?: string | null;
          entity_type: string;
          error?: string | null;
          group_chat_id?: string | null;
          id?: string;
          opened_at?: string | null;
          phone?: string | null;
          provider_message_id?: string | null;
          read_at?: string | null;
          sent_at?: string | null;
          status?: string;
          tenant_id: string;
          updated_at?: string;
          vars?: Json;
        };
        Update: {
          attempts?: number;
          broadcast_id?: string;
          clicked_at?: string | null;
          contact_name?: string | null;
          created_at?: string;
          delivered_at?: string | null;
          email?: string | null;
          entity_id?: string | null;
          entity_type?: string;
          error?: string | null;
          group_chat_id?: string | null;
          id?: string;
          opened_at?: string | null;
          phone?: string | null;
          provider_message_id?: string | null;
          read_at?: string | null;
          sent_at?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          vars?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "broadcast_recipients_broadcast_id_fkey";
            columns: ["broadcast_id"];
            isOneToOne: false;
            referencedRelation: "broadcasts";
            referencedColumns: ["id"];
          },
        ];
      };
      broadcasts: {
        Row: {
          attachments: Json;
          audience_filter: Json;
          automation_id: string | null;
          automation_step_key: string | null;
          body_html: string | null;
          body_text: string | null;
          channel: string;
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          daily_cap: number;
          from_email: string | null;
          from_name: string | null;
          html_mode: boolean;
          id: string;
          integration_id: string | null;
          last_error: string | null;
          media_url: string | null;
          name: string;
          origin: string;
          provider: string;
          reply_to: string | null;
          scheduled_at: string | null;
          started_at: string | null;
          stats: Json;
          status: string;
          subject: string | null;
          template_id: string | null;
          tenant_id: string;
          throttle_max_seconds: number;
          throttle_min_seconds: number;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          attachments?: Json;
          audience_filter?: Json;
          automation_id?: string | null;
          automation_step_key?: string | null;
          body_html?: string | null;
          body_text?: string | null;
          channel?: string;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          daily_cap?: number;
          from_email?: string | null;
          from_name?: string | null;
          html_mode?: boolean;
          id?: string;
          integration_id?: string | null;
          last_error?: string | null;
          media_url?: string | null;
          name?: string;
          origin?: string;
          provider: string;
          reply_to?: string | null;
          scheduled_at?: string | null;
          started_at?: string | null;
          stats?: Json;
          status?: string;
          subject?: string | null;
          template_id?: string | null;
          tenant_id: string;
          throttle_max_seconds?: number;
          throttle_min_seconds?: number;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          attachments?: Json;
          audience_filter?: Json;
          automation_id?: string | null;
          automation_step_key?: string | null;
          body_html?: string | null;
          body_text?: string | null;
          channel?: string;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          daily_cap?: number;
          from_email?: string | null;
          from_name?: string | null;
          html_mode?: boolean;
          id?: string;
          integration_id?: string | null;
          last_error?: string | null;
          media_url?: string | null;
          name?: string;
          origin?: string;
          provider?: string;
          reply_to?: string | null;
          scheduled_at?: string | null;
          started_at?: string | null;
          stats?: Json;
          status?: string;
          subject?: string | null;
          template_id?: string | null;
          tenant_id?: string;
          throttle_max_seconds?: number;
          throttle_min_seconds?: number;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "broadcasts_automation_id_fkey";
            columns: ["automation_id"];
            isOneToOne: false;
            referencedRelation: "automations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "broadcasts_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "message_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      calendar_shares: {
        Row: {
          created_at: string | null;
          id: string;
          owner_user_id: string;
          permission_level: string;
          shared_with_user_id: string;
          tenant_id: string;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          owner_user_id: string;
          permission_level?: string;
          shared_with_user_id: string;
          tenant_id: string;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          owner_user_id?: string;
          permission_level?: string;
          shared_with_user_id?: string;
          tenant_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_shares_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      calendar_tokens: {
        Row: {
          access_token: string;
          created_at: string | null;
          expires_at: string;
          google_email: string | null;
          id: string;
          last_sync_at: string | null;
          needs_reconnect: boolean;
          next_sync_token: string | null;
          refresh_token: string;
          sync_error: string | null;
          sync_status: string | null;
          updated_at: string | null;
          user_id: string;
          watch_channel_id: string | null;
          watch_expires_at: string | null;
          watch_resource_id: string | null;
        };
        Insert: {
          access_token: string;
          created_at?: string | null;
          expires_at: string;
          google_email?: string | null;
          id?: string;
          last_sync_at?: string | null;
          needs_reconnect?: boolean;
          next_sync_token?: string | null;
          refresh_token: string;
          sync_error?: string | null;
          sync_status?: string | null;
          updated_at?: string | null;
          user_id: string;
          watch_channel_id?: string | null;
          watch_expires_at?: string | null;
          watch_resource_id?: string | null;
        };
        Update: {
          access_token?: string;
          created_at?: string | null;
          expires_at?: string;
          google_email?: string | null;
          id?: string;
          last_sync_at?: string | null;
          needs_reconnect?: boolean;
          next_sync_token?: string | null;
          refresh_token?: string;
          sync_error?: string | null;
          sync_status?: string | null;
          updated_at?: string | null;
          user_id?: string;
          watch_channel_id?: string | null;
          watch_expires_at?: string | null;
          watch_resource_id?: string | null;
        };
        Relationships: [];
      };
      call_logs: {
        Row: {
          caller_user_id: string;
          client_id: string | null;
          created_at: string;
          duration: number | null;
          from_number: string | null;
          id: string;
          lead_id: string | null;
          notes: string | null;
          provider: string | null;
          provider_call_id: string | null;
          recording_duration: number | null;
          recording_path: string | null;
          recording_url: string | null;
          status: string;
          tenant_id: string;
          to_number: string;
          updated_at: string;
        };
        Insert: {
          caller_user_id: string;
          client_id?: string | null;
          created_at?: string;
          duration?: number | null;
          from_number?: string | null;
          id?: string;
          lead_id?: string | null;
          notes?: string | null;
          provider?: string | null;
          provider_call_id?: string | null;
          recording_duration?: number | null;
          recording_path?: string | null;
          recording_url?: string | null;
          status?: string;
          tenant_id: string;
          to_number: string;
          updated_at?: string;
        };
        Update: {
          caller_user_id?: string;
          client_id?: string | null;
          created_at?: string;
          duration?: number | null;
          from_number?: string | null;
          id?: string;
          lead_id?: string | null;
          notes?: string | null;
          provider?: string | null;
          provider_call_id?: string | null;
          recording_duration?: number | null;
          recording_path?: string | null;
          recording_url?: string | null;
          status?: string;
          tenant_id?: string;
          to_number?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "call_logs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "call_logs_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "call_logs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      campaign_alerts: {
        Row: {
          acknowledged_at: string | null;
          acknowledged_by: string | null;
          ad_account_id: string | null;
          alert_type: string;
          campaign_id: string;
          campaign_name: string | null;
          client_id: string | null;
          created_at: string;
          details: Json | null;
          id: string;
          notified_at: string | null;
          resolved_at: string | null;
          severity: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          acknowledged_at?: string | null;
          acknowledged_by?: string | null;
          ad_account_id?: string | null;
          alert_type: string;
          campaign_id: string;
          campaign_name?: string | null;
          client_id?: string | null;
          created_at?: string;
          details?: Json | null;
          id?: string;
          notified_at?: string | null;
          resolved_at?: string | null;
          severity?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          acknowledged_at?: string | null;
          acknowledged_by?: string | null;
          ad_account_id?: string | null;
          alert_type?: string;
          campaign_id?: string;
          campaign_name?: string | null;
          client_id?: string | null;
          created_at?: string;
          details?: Json | null;
          id?: string;
          notified_at?: string | null;
          resolved_at?: string | null;
          severity?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      campaign_pulse_overrides: {
        Row: {
          algorithm_flags: Json;
          algorithm_metrics: Json;
          algorithm_status: string;
          cleared_at: string | null;
          cleared_by: string | null;
          client_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          override_status: string;
          reason: string;
          snapshot_calculated_at: string | null;
          tenant_id: string;
        };
        Insert: {
          algorithm_flags?: Json;
          algorithm_metrics?: Json;
          algorithm_status: string;
          cleared_at?: string | null;
          cleared_by?: string | null;
          client_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          override_status: string;
          reason: string;
          snapshot_calculated_at?: string | null;
          tenant_id: string;
        };
        Update: {
          algorithm_flags?: Json;
          algorithm_metrics?: Json;
          algorithm_status?: string;
          cleared_at?: string | null;
          cleared_by?: string | null;
          client_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          override_status?: string;
          reason?: string;
          snapshot_calculated_at?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "campaign_pulse_overrides_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "campaign_pulse_overrides_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      campaign_pulse_snapshots: {
        Row: {
          agency_id: string | null;
          calculated_at: string;
          campaign_breakdown: Json;
          campaign_goal_mode: string;
          client_id: string;
          cpl_7d: number | null;
          cpl_change_pct: number | null;
          data_fresh_through: string | null;
          ecommerce_goal_status: string | null;
          ecommerce_spend_7d: number;
          flags: Json;
          id: string;
          is_ecommerce: boolean;
          last_client_call_at: string | null;
          last_client_call_by: string | null;
          last_meta_change_actor: string | null;
          last_meta_change_at: string | null;
          last_meta_change_object: string | null;
          last_meta_change_type: string | null;
          lead_goal_status: string | null;
          lead_spend_7d: number;
          leads_7d: number;
          meta_change_availability: string | null;
          purchases_7d: number;
          revenue_7d: number;
          roas_7d: number | null;
          roas_change_pct: number | null;
          source: string;
          spend_7d: number;
          status: string;
          tenant_id: string;
        };
        Insert: {
          agency_id?: string | null;
          calculated_at?: string;
          campaign_breakdown?: Json;
          campaign_goal_mode?: string;
          client_id: string;
          cpl_7d?: number | null;
          cpl_change_pct?: number | null;
          data_fresh_through?: string | null;
          ecommerce_goal_status?: string | null;
          ecommerce_spend_7d?: number;
          flags?: Json;
          id?: string;
          is_ecommerce?: boolean;
          last_client_call_at?: string | null;
          last_client_call_by?: string | null;
          last_meta_change_actor?: string | null;
          last_meta_change_at?: string | null;
          last_meta_change_object?: string | null;
          last_meta_change_type?: string | null;
          lead_goal_status?: string | null;
          lead_spend_7d?: number;
          leads_7d?: number;
          meta_change_availability?: string | null;
          purchases_7d?: number;
          revenue_7d?: number;
          roas_7d?: number | null;
          roas_change_pct?: number | null;
          source?: string;
          spend_7d?: number;
          status: string;
          tenant_id: string;
        };
        Update: {
          agency_id?: string | null;
          calculated_at?: string;
          campaign_breakdown?: Json;
          campaign_goal_mode?: string;
          client_id?: string;
          cpl_7d?: number | null;
          cpl_change_pct?: number | null;
          data_fresh_through?: string | null;
          ecommerce_goal_status?: string | null;
          ecommerce_spend_7d?: number;
          flags?: Json;
          id?: string;
          is_ecommerce?: boolean;
          last_client_call_at?: string | null;
          last_client_call_by?: string | null;
          last_meta_change_actor?: string | null;
          last_meta_change_at?: string | null;
          last_meta_change_object?: string | null;
          last_meta_change_type?: string | null;
          lead_goal_status?: string | null;
          lead_spend_7d?: number;
          leads_7d?: number;
          meta_change_availability?: string | null;
          purchases_7d?: number;
          revenue_7d?: number;
          roas_7d?: number | null;
          roas_change_pct?: number | null;
          source?: string;
          spend_7d?: number;
          status?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "campaign_pulse_snapshots_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "campaign_pulse_snapshots_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "campaign_pulse_snapshots_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      campaign_schedules: {
        Row: {
          action: string;
          approved_at: string | null;
          approved_by: string | null;
          client_id: string | null;
          created_at: string;
          created_by: string | null;
          cron_expression: string | null;
          enabled: boolean;
          entity_id: string;
          entity_type: string;
          id: string;
          last_run_at: string | null;
          last_run_error: string | null;
          last_run_status: string | null;
          next_run_at: string | null;
          notes: string | null;
          run_at: string | null;
          tenant_id: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          action: string;
          approved_at?: string | null;
          approved_by?: string | null;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          cron_expression?: string | null;
          enabled?: boolean;
          entity_id: string;
          entity_type: string;
          id?: string;
          last_run_at?: string | null;
          last_run_error?: string | null;
          last_run_status?: string | null;
          next_run_at?: string | null;
          notes?: string | null;
          run_at?: string | null;
          tenant_id: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          action?: string;
          approved_at?: string | null;
          approved_by?: string | null;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          cron_expression?: string | null;
          enabled?: boolean;
          entity_id?: string;
          entity_type?: string;
          id?: string;
          last_run_at?: string | null;
          last_run_error?: string | null;
          last_run_status?: string | null;
          next_run_at?: string | null;
          notes?: string | null;
          run_at?: string | null;
          tenant_id?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      campaigner_agencies: {
        Row: {
          agency_id: string;
          campaigner_id: string;
          created_at: string;
          id: string;
        };
        Insert: {
          agency_id: string;
          campaigner_id: string;
          created_at?: string;
          id?: string;
        };
        Update: {
          agency_id?: string;
          campaigner_id?: string;
          created_at?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "campaigner_agencies_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "campaigner_agencies_campaigner_id_fkey";
            columns: ["campaigner_id"];
            isOneToOne: false;
            referencedRelation: "campaigners";
            referencedColumns: ["id"];
          },
        ];
      };
      campaigners: {
        Row: {
          active: boolean;
          created_at: string;
          email: string | null;
          folder_link: string | null;
          full_name: string;
          id: string;
          notes: string | null;
          phone: string | null;
          role: string[] | null;
          tenant_id: string;
          updated_at: string;
          whatsapp_group_id: string | null;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          email?: string | null;
          folder_link?: string | null;
          full_name: string;
          id?: string;
          notes?: string | null;
          phone?: string | null;
          role?: string[] | null;
          tenant_id: string;
          updated_at?: string;
          whatsapp_group_id?: string | null;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          email?: string | null;
          folder_link?: string | null;
          full_name?: string;
          id?: string;
          notes?: string | null;
          phone?: string | null;
          role?: string[] | null;
          tenant_id?: string;
          updated_at?: string;
          whatsapp_group_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "campaigners_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      carmen_access_policies: {
        Row: {
          agent_id: string;
          allowed_group_ids: string[];
          created_at: string;
          deny_message_he: string | null;
          id: string;
          open_member_groups: boolean;
          private_phones: Json;
          require_direct_address: boolean;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          agent_id: string;
          allowed_group_ids?: string[];
          created_at?: string;
          deny_message_he?: string | null;
          id?: string;
          open_member_groups?: boolean;
          private_phones?: Json;
          require_direct_address?: boolean;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          agent_id?: string;
          allowed_group_ids?: string[];
          created_at?: string;
          deny_message_he?: string | null;
          id?: string;
          open_member_groups?: boolean;
          private_phones?: Json;
          require_direct_address?: boolean;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "carmen_access_policies_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "ai_agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "carmen_access_policies_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      carmen_batch_deliveries: {
        Row: {
          automation_id: string | null;
          batch_id: string;
          chat_id: string;
          connection_user_id: string | null;
          created_at: string;
          created_by: string | null;
          delivered_at: string | null;
          is_group: boolean;
          last_error: string | null;
          phone_number: string | null;
          status: string;
          task_type: string | null;
          tenant_id: string;
        };
        Insert: {
          automation_id?: string | null;
          batch_id: string;
          chat_id: string;
          connection_user_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          delivered_at?: string | null;
          is_group?: boolean;
          last_error?: string | null;
          phone_number?: string | null;
          status?: string;
          task_type?: string | null;
          tenant_id: string;
        };
        Update: {
          automation_id?: string | null;
          batch_id?: string;
          chat_id?: string;
          connection_user_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          delivered_at?: string | null;
          is_group?: boolean;
          last_error?: string | null;
          phone_number?: string | null;
          status?: string;
          task_type?: string | null;
          tenant_id?: string;
        };
        Relationships: [];
      };
      carmen_client_group_access: {
        Row: {
          agency_id: string | null;
          allow_assigned_campaigners: boolean;
          allow_client_contacts: boolean;
          client_id: string;
          created_at: string;
          id: string;
          info_boundary: string;
          tenant_id: string;
          updated_at: string;
          whatsapp_group_id: string;
        };
        Insert: {
          agency_id?: string | null;
          allow_assigned_campaigners?: boolean;
          allow_client_contacts?: boolean;
          client_id: string;
          created_at?: string;
          id?: string;
          info_boundary?: string;
          tenant_id: string;
          updated_at?: string;
          whatsapp_group_id: string;
        };
        Update: {
          agency_id?: string | null;
          allow_assigned_campaigners?: boolean;
          allow_client_contacts?: boolean;
          client_id?: string;
          created_at?: string;
          id?: string;
          info_boundary?: string;
          tenant_id?: string;
          updated_at?: string;
          whatsapp_group_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "carmen_client_group_access_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "carmen_client_group_access_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "carmen_client_group_access_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "carmen_client_group_access_whatsapp_group_id_fkey";
            columns: ["whatsapp_group_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_groups";
            referencedColumns: ["id"];
          },
        ];
      };
      carmen_command_center_access: {
        Row: {
          agent_id: string;
          brain_access: Json | null;
          campaigner_id: string | null;
          created_at: string;
          dev_escalation_tier: string | null;
          enabled: boolean;
          id: string;
          surfaces: string[];
          tenant_id: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          agent_id: string;
          brain_access?: Json | null;
          campaigner_id?: string | null;
          created_at?: string;
          dev_escalation_tier?: string | null;
          enabled?: boolean;
          id?: string;
          surfaces?: string[];
          tenant_id: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          agent_id?: string;
          brain_access?: Json | null;
          campaigner_id?: string | null;
          created_at?: string;
          dev_escalation_tier?: string | null;
          enabled?: boolean;
          id?: string;
          surfaces?: string[];
          tenant_id?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "carmen_command_center_access_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "ai_agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "carmen_command_center_access_campaigner_id_fkey";
            columns: ["campaigner_id"];
            isOneToOne: false;
            referencedRelation: "campaigners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "carmen_command_center_access_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      carmen_mcp_dispatches: {
        Row: {
          context: string | null;
          conversation_id: string | null;
          created_at: string;
          error: string | null;
          id: string;
          request_text: string;
          status: string;
          tenant_id: string | null;
          tool: string;
          tools_used: string[] | null;
        };
        Insert: {
          context?: string | null;
          conversation_id?: string | null;
          created_at?: string;
          error?: string | null;
          id?: string;
          request_text: string;
          status?: string;
          tenant_id?: string | null;
          tool?: string;
          tools_used?: string[] | null;
        };
        Update: {
          context?: string | null;
          conversation_id?: string | null;
          created_at?: string;
          error?: string | null;
          id?: string;
          request_text?: string;
          status?: string;
          tenant_id?: string | null;
          tool?: string;
          tools_used?: string[] | null;
        };
        Relationships: [];
      };
      carmen_memory_episodes: {
        Row: {
          access_count: number;
          created_at: string;
          id: string;
          importance: number;
          last_accessed_at: string;
          participants: Json | null;
          ref_date: string;
          retention_score: number;
          session_ref: string | null;
          source_ids: string[] | null;
          source_table: string | null;
          summary: string;
          summary_embedding: string | null;
          tenant_id: string;
          topic: string | null;
          topic_tags: string[] | null;
          updated_at: string;
        };
        Insert: {
          access_count?: number;
          created_at?: string;
          id?: string;
          importance?: number;
          last_accessed_at?: string;
          participants?: Json | null;
          ref_date?: string;
          retention_score?: number;
          session_ref?: string | null;
          source_ids?: string[] | null;
          source_table?: string | null;
          summary: string;
          summary_embedding?: string | null;
          tenant_id: string;
          topic?: string | null;
          topic_tags?: string[] | null;
          updated_at?: string;
        };
        Update: {
          access_count?: number;
          created_at?: string;
          id?: string;
          importance?: number;
          last_accessed_at?: string;
          participants?: Json | null;
          ref_date?: string;
          retention_score?: number;
          session_ref?: string | null;
          source_ids?: string[] | null;
          source_table?: string | null;
          summary?: string;
          summary_embedding?: string | null;
          tenant_id?: string;
          topic?: string | null;
          topic_tags?: string[] | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      carmen_memory_outbox: {
        Row: {
          created_at: string;
          entity_id: string;
          entity_type: string;
          error: string | null;
          id: number;
          op: string;
          payload: Json;
          processed_at: string | null;
          retry_count: number;
          tenant_id: string | null;
        };
        Insert: {
          created_at?: string;
          entity_id: string;
          entity_type: string;
          error?: string | null;
          id?: number;
          op: string;
          payload?: Json;
          processed_at?: string | null;
          retry_count?: number;
          tenant_id?: string | null;
        };
        Update: {
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          error?: string | null;
          id?: number;
          op?: string;
          payload?: Json;
          processed_at?: string | null;
          retry_count?: number;
          tenant_id?: string | null;
        };
        Relationships: [];
      };
      carmen_memory_pointers: {
        Row: {
          category: string;
          created_at: string;
          entity_id: string | null;
          entity_type: string | null;
          id: string;
          importance: number;
          metadata: Json;
          path: string;
          ref_date: string | null;
          subcategory: string | null;
          summary: string | null;
          summary_embedding: string | null;
          tenant_id: string;
          title: string;
          updated_at: string;
          valid_from: string;
          valid_until: string | null;
        };
        Insert: {
          category: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          importance?: number;
          metadata?: Json;
          path: string;
          ref_date?: string | null;
          subcategory?: string | null;
          summary?: string | null;
          summary_embedding?: string | null;
          tenant_id: string;
          title: string;
          updated_at?: string;
          valid_from?: string;
          valid_until?: string | null;
        };
        Update: {
          category?: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          importance?: number;
          metadata?: Json;
          path?: string;
          ref_date?: string | null;
          subcategory?: string | null;
          summary?: string | null;
          summary_embedding?: string | null;
          tenant_id?: string;
          title?: string;
          updated_at?: string;
          valid_from?: string;
          valid_until?: string | null;
        };
        Relationships: [];
      };
      carmen_whatsapp_identities: {
        Row: {
          allowed_group_ids: string[] | null;
          approved_at: string | null;
          approved_by: string | null;
          client_id: string | null;
          created_at: string;
          dev_escalation_tier: string | null;
          display_name: string | null;
          entity_id: string;
          entity_type: string;
          escalation_agents: string[];
          id: string;
          phone: string;
          relationship_note: string | null;
          role_title: string | null;
          scope_mode: string;
          status: string;
          surfaces: string[];
          tenant_id: string;
          updated_at: string;
          verified_at: string | null;
        };
        Insert: {
          allowed_group_ids?: string[] | null;
          approved_at?: string | null;
          approved_by?: string | null;
          client_id?: string | null;
          created_at?: string;
          dev_escalation_tier?: string | null;
          display_name?: string | null;
          entity_id: string;
          entity_type: string;
          escalation_agents?: string[];
          id?: string;
          phone: string;
          relationship_note?: string | null;
          role_title?: string | null;
          scope_mode?: string;
          status?: string;
          surfaces?: string[];
          tenant_id: string;
          updated_at?: string;
          verified_at?: string | null;
        };
        Update: {
          allowed_group_ids?: string[] | null;
          approved_at?: string | null;
          approved_by?: string | null;
          client_id?: string | null;
          created_at?: string;
          dev_escalation_tier?: string | null;
          display_name?: string | null;
          entity_id?: string;
          entity_type?: string;
          escalation_agents?: string[];
          id?: string;
          phone?: string;
          relationship_note?: string | null;
          role_title?: string | null;
          scope_mode?: string;
          status?: string;
          surfaces?: string[];
          tenant_id?: string;
          updated_at?: string;
          verified_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "carmen_whatsapp_identities_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "carmen_whatsapp_identities_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      carmen_whatsapp_identity_candidates: {
        Row: {
          created_at: string;
          group_chat_id: string;
          group_id: string | null;
          id: string;
          last_prompted_at: string | null;
          phone: string | null;
          self_reported_identity: string | null;
          status: string;
          tenant_id: string;
          updated_at: string;
          whatsapp_lid: string | null;
          whatsapp_name: string | null;
        };
        Insert: {
          created_at?: string;
          group_chat_id: string;
          group_id?: string | null;
          id?: string;
          last_prompted_at?: string | null;
          phone?: string | null;
          self_reported_identity?: string | null;
          status?: string;
          tenant_id: string;
          updated_at?: string;
          whatsapp_lid?: string | null;
          whatsapp_name?: string | null;
        };
        Update: {
          created_at?: string;
          group_chat_id?: string;
          group_id?: string | null;
          id?: string;
          last_prompted_at?: string | null;
          phone?: string | null;
          self_reported_identity?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          whatsapp_lid?: string | null;
          whatsapp_name?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "carmen_whatsapp_identity_candidates_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "carmen_whatsapp_identity_candidates_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      carmen_whatsapp_sessions: {
        Row: {
          agent_id: string | null;
          ai_conversation_id: string | null;
          automation_id: string | null;
          chat_id: string;
          connection_user_id: string | null;
          conversation_history: Json | null;
          created_at: string | null;
          end_keyword: string | null;
          ended_at: string | null;
          id: string;
          integration_id: string | null;
          last_message_at: string | null;
          open_group: boolean;
          phone: string | null;
          sender_name: string | null;
          started_by_keyword: string | null;
          status: string | null;
          tenant_id: string;
        };
        Insert: {
          agent_id?: string | null;
          ai_conversation_id?: string | null;
          automation_id?: string | null;
          chat_id: string;
          connection_user_id?: string | null;
          conversation_history?: Json | null;
          created_at?: string | null;
          end_keyword?: string | null;
          ended_at?: string | null;
          id?: string;
          integration_id?: string | null;
          last_message_at?: string | null;
          open_group?: boolean;
          phone?: string | null;
          sender_name?: string | null;
          started_by_keyword?: string | null;
          status?: string | null;
          tenant_id: string;
        };
        Update: {
          agent_id?: string | null;
          ai_conversation_id?: string | null;
          automation_id?: string | null;
          chat_id?: string;
          connection_user_id?: string | null;
          conversation_history?: Json | null;
          created_at?: string | null;
          end_keyword?: string | null;
          ended_at?: string | null;
          id?: string;
          integration_id?: string | null;
          last_message_at?: string | null;
          open_group?: boolean;
          phone?: string | null;
          sender_name?: string | null;
          started_by_keyword?: string | null;
          status?: string | null;
          tenant_id?: string;
        };
        Relationships: [];
      };
      chat_contact_tags: {
        Row: {
          client_id: string | null;
          created_at: string;
          group_id: string | null;
          id: string;
          lead_id: string | null;
          sender_phone: string | null;
          tag_id: string;
          tenant_id: string;
          user_id: string;
        };
        Insert: {
          client_id?: string | null;
          created_at?: string;
          group_id?: string | null;
          id?: string;
          lead_id?: string | null;
          sender_phone?: string | null;
          tag_id: string;
          tenant_id: string;
          user_id: string;
        };
        Update: {
          client_id?: string | null;
          created_at?: string;
          group_id?: string | null;
          id?: string;
          lead_id?: string | null;
          sender_phone?: string | null;
          tag_id?: string;
          tenant_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_contact_tags_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chat_contact_tags_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chat_contact_tags_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chat_contact_tags_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "chat_tags";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chat_contact_tags_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_messages: {
        Row: {
          blocked_at: string | null;
          blocked_by_user_id: string | null;
          channel: string;
          client_id: string | null;
          connection_user_id: string | null;
          created_at: string | null;
          direction: string;
          group_id: string | null;
          id: string;
          integration_id: string | null;
          is_blocked: boolean;
          lead_id: string | null;
          message_text: string;
          provider: Database["public"]["Enums"]["chat_provider"];
          raw_provider_data: Json | null;
          read_at: string | null;
          sender_name: string | null;
          sender_phone: string | null;
          sent_by_user_id: string | null;
          tenant_id: string;
          updated_at: string | null;
        };
        Insert: {
          blocked_at?: string | null;
          blocked_by_user_id?: string | null;
          channel?: string;
          client_id?: string | null;
          connection_user_id?: string | null;
          created_at?: string | null;
          direction: string;
          group_id?: string | null;
          id?: string;
          integration_id?: string | null;
          is_blocked?: boolean;
          lead_id?: string | null;
          message_text: string;
          provider?: Database["public"]["Enums"]["chat_provider"];
          raw_provider_data?: Json | null;
          read_at?: string | null;
          sender_name?: string | null;
          sender_phone?: string | null;
          sent_by_user_id?: string | null;
          tenant_id: string;
          updated_at?: string | null;
        };
        Update: {
          blocked_at?: string | null;
          blocked_by_user_id?: string | null;
          channel?: string;
          client_id?: string | null;
          connection_user_id?: string | null;
          created_at?: string | null;
          direction?: string;
          group_id?: string | null;
          id?: string;
          integration_id?: string | null;
          is_blocked?: boolean;
          lead_id?: string | null;
          message_text?: string;
          provider?: Database["public"]["Enums"]["chat_provider"];
          raw_provider_data?: Json | null;
          read_at?: string | null;
          sender_name?: string | null;
          sender_phone?: string | null;
          sent_by_user_id?: string | null;
          tenant_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "chat_messages_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chat_messages_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chat_messages_integration_id_fkey";
            columns: ["integration_id"];
            isOneToOne: false;
            referencedRelation: "tenant_integrations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chat_messages_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chat_messages_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_tags: {
        Row: {
          color: string;
          created_at: string;
          id: string;
          name: string;
          sort_order: number;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          color?: string;
          created_at?: string;
          id?: string;
          name: string;
          sort_order?: number;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          id?: string;
          name?: string;
          sort_order?: number;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_tags_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      claude_carmen_audit: {
        Row: {
          action: string;
          actor: string;
          created_at: string;
          details: Json | null;
          id: string;
          target: string | null;
          tenant_id: string | null;
        };
        Insert: {
          action: string;
          actor: string;
          created_at?: string;
          details?: Json | null;
          id?: string;
          target?: string | null;
          tenant_id?: string | null;
        };
        Update: {
          action?: string;
          actor?: string;
          created_at?: string;
          details?: Json | null;
          id?: string;
          target?: string | null;
          tenant_id?: string | null;
        };
        Relationships: [];
      };
      claude_dispatches: {
        Row: {
          agent_id: string | null;
          branch: string | null;
          context: string | null;
          created_at: string;
          id: string;
          request_text: string;
          session_url: string | null;
          status: string;
          tenant_id: string | null;
          tool: string;
        };
        Insert: {
          agent_id?: string | null;
          branch?: string | null;
          context?: string | null;
          created_at?: string;
          id?: string;
          request_text: string;
          session_url?: string | null;
          status?: string;
          tenant_id?: string | null;
          tool: string;
        };
        Update: {
          agent_id?: string | null;
          branch?: string | null;
          context?: string | null;
          created_at?: string;
          id?: string;
          request_text?: string;
          session_url?: string | null;
          status?: string;
          tenant_id?: string | null;
          tool?: string;
        };
        Relationships: [];
      };
      client_contacts: {
        Row: {
          client_id: string;
          contact_name: string;
          created_at: string | null;
          email: string | null;
          id: string;
          is_primary: boolean | null;
          phone: string | null;
          role: string | null;
          tenant_id: string;
        };
        Insert: {
          client_id: string;
          contact_name: string;
          created_at?: string | null;
          email?: string | null;
          id?: string;
          is_primary?: boolean | null;
          phone?: string | null;
          role?: string | null;
          tenant_id: string;
        };
        Update: {
          client_id?: string;
          contact_name?: string;
          created_at?: string | null;
          email?: string | null;
          id?: string;
          is_primary?: boolean | null;
          phone?: string | null;
          role?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "client_contacts_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      client_credentials: {
        Row: {
          client_id: string;
          created_at: string;
          id: string;
          notes: string | null;
          password: string | null;
          service_name: string;
          tenant_id: string;
          updated_at: string;
          url: string | null;
          username: string | null;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          id?: string;
          notes?: string | null;
          password?: string | null;
          service_name: string;
          tenant_id: string;
          updated_at?: string;
          url?: string | null;
          username?: string | null;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          id?: string;
          notes?: string | null;
          password?: string | null;
          service_name?: string;
          tenant_id?: string;
          updated_at?: string;
          url?: string | null;
          username?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "client_credentials_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "client_credentials_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      client_onboarding: {
        Row: {
          agency_id: string;
          campaigner_id: string;
          client_id: string;
          created_at: string;
          due_date: string | null;
          id: string;
          notes: string | null;
          status: Database["public"]["Enums"]["onboarding_status"];
          tenant_id: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          agency_id: string;
          campaigner_id: string;
          client_id: string;
          created_at?: string;
          due_date?: string | null;
          id?: string;
          notes?: string | null;
          status?: Database["public"]["Enums"]["onboarding_status"];
          tenant_id?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          agency_id?: string;
          campaigner_id?: string;
          client_id?: string;
          created_at?: string;
          due_date?: string | null;
          id?: string;
          notes?: string | null;
          status?: Database["public"]["Enums"]["onboarding_status"];
          tenant_id?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "client_onboarding_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "client_onboarding_campaigner_id_fkey";
            columns: ["campaigner_id"];
            isOneToOne: false;
            referencedRelation: "campaigners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "client_onboarding_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "client_onboarding_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      client_suppliers: {
        Row: {
          client_id: string;
          created_at: string;
          id: string;
          notes: string | null;
          supplier_id: string;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          id?: string;
          notes?: string | null;
          supplier_id: string;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          id?: string;
          notes?: string | null;
          supplier_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "client_suppliers_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "client_suppliers_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
      client_team: {
        Row: {
          allocation_percent: number | null;
          campaigner_id: string;
          campaigner_payment: number | null;
          client_id: string;
          created_at: string;
          end_date: string | null;
          id: string;
          notes: string | null;
          role_on_account: string | null;
          start_date: string | null;
        };
        Insert: {
          allocation_percent?: number | null;
          campaigner_id: string;
          campaigner_payment?: number | null;
          client_id: string;
          created_at?: string;
          end_date?: string | null;
          id?: string;
          notes?: string | null;
          role_on_account?: string | null;
          start_date?: string | null;
        };
        Update: {
          allocation_percent?: number | null;
          campaigner_id?: string;
          campaigner_payment?: number | null;
          client_id?: string;
          created_at?: string;
          end_date?: string | null;
          id?: string;
          notes?: string | null;
          role_on_account?: string | null;
          start_date?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "client_team_campaigner_id_fkey";
            columns: ["campaigner_id"];
            isOneToOne: false;
            referencedRelation: "campaigners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "client_team_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      client_tenant_financial_data: {
        Row: {
          client_id: string;
          created_at: string;
          id: string;
          monthly_budget: number | null;
          notes: string | null;
          retainer: number | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          id?: string;
          monthly_budget?: number | null;
          notes?: string | null;
          retainer?: number | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          id?: string;
          monthly_budget?: number | null;
          notes?: string | null;
          retainer?: number | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "client_tenant_financial_data_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "client_tenant_financial_data_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      client_updates: {
        Row: {
          client_id: string;
          content: string;
          created_at: string;
          id: string;
          tenant_id: string;
          update_type: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          client_id: string;
          content: string;
          created_at?: string;
          id?: string;
          tenant_id: string;
          update_type?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          client_id?: string;
          content?: string;
          created_at?: string;
          id?: string;
          tenant_id?: string;
          update_type?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "client_updates_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "client_updates_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "client_updates_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      clients: {
        Row: {
          active_chat_provider:
            Database["public"]["Enums"]["chat_provider"] | null;
          active_flags: Json | null;
          agency_id: string;
          ahrefs_domain: string | null;
          attachments: Json;
          contact_name: string | null;
          created_at: string;
          email: string | null;
          end_date: string | null;
          folder_link: string | null;
          folder_links: Json;
          follow_up_campaigner_notified_at: string | null;
          follow_up_date: string | null;
          follow_up_manager_notified_at: string | null;
          ga_property_id: string | null;
          google_ads_account_id: string | null;
          gsc_site_url: string | null;
          health_score: number | null;
          id: string;
          industry: string | null;
          is_ecommerce: boolean | null;
          is_seo_client: boolean | null;
          manychat_subscriber_id: string | null;
          meta_ads_account_id: string | null;
          monthly_budget: number | null;
          monthly_fixed_expense: number | null;
          mood_status: Database["public"]["Enums"]["client_mood_status"] | null;
          name: string;
          notes: string | null;
          overall_status: string | null;
          phone: string | null;
          retainer: number | null;
          seo_keyword_relevance: Json;
          services: Json | null;
          start_date: string | null;
          status: Database["public"]["Enums"]["client_status"];
          tenant_id: string | null;
          tier: string | null;
          updated_at: string;
          website: string | null;
          whatsapp_avatar_url: string | null;
          whatsapp_group_id: string | null;
        };
        Insert: {
          active_chat_provider?:
            Database["public"]["Enums"]["chat_provider"] | null;
          active_flags?: Json | null;
          agency_id: string;
          ahrefs_domain?: string | null;
          attachments?: Json;
          contact_name?: string | null;
          created_at?: string;
          email?: string | null;
          end_date?: string | null;
          folder_link?: string | null;
          folder_links?: Json;
          follow_up_campaigner_notified_at?: string | null;
          follow_up_date?: string | null;
          follow_up_manager_notified_at?: string | null;
          ga_property_id?: string | null;
          google_ads_account_id?: string | null;
          gsc_site_url?: string | null;
          health_score?: number | null;
          id?: string;
          industry?: string | null;
          is_ecommerce?: boolean | null;
          is_seo_client?: boolean | null;
          manychat_subscriber_id?: string | null;
          meta_ads_account_id?: string | null;
          monthly_budget?: number | null;
          monthly_fixed_expense?: number | null;
          mood_status?:
            Database["public"]["Enums"]["client_mood_status"] | null;
          name: string;
          notes?: string | null;
          overall_status?: string | null;
          phone?: string | null;
          retainer?: number | null;
          seo_keyword_relevance?: Json;
          services?: Json | null;
          start_date?: string | null;
          status?: Database["public"]["Enums"]["client_status"];
          tenant_id?: string | null;
          tier?: string | null;
          updated_at?: string;
          website?: string | null;
          whatsapp_avatar_url?: string | null;
          whatsapp_group_id?: string | null;
        };
        Update: {
          active_chat_provider?:
            Database["public"]["Enums"]["chat_provider"] | null;
          active_flags?: Json | null;
          agency_id?: string;
          ahrefs_domain?: string | null;
          attachments?: Json;
          contact_name?: string | null;
          created_at?: string;
          email?: string | null;
          end_date?: string | null;
          folder_link?: string | null;
          folder_links?: Json;
          follow_up_campaigner_notified_at?: string | null;
          follow_up_date?: string | null;
          follow_up_manager_notified_at?: string | null;
          ga_property_id?: string | null;
          google_ads_account_id?: string | null;
          gsc_site_url?: string | null;
          health_score?: number | null;
          id?: string;
          industry?: string | null;
          is_ecommerce?: boolean | null;
          is_seo_client?: boolean | null;
          manychat_subscriber_id?: string | null;
          meta_ads_account_id?: string | null;
          monthly_budget?: number | null;
          monthly_fixed_expense?: number | null;
          mood_status?:
            Database["public"]["Enums"]["client_mood_status"] | null;
          name?: string;
          notes?: string | null;
          overall_status?: string | null;
          phone?: string | null;
          retainer?: number | null;
          seo_keyword_relevance?: Json;
          services?: Json | null;
          start_date?: string | null;
          status?: Database["public"]["Enums"]["client_status"];
          tenant_id?: string | null;
          tier?: string | null;
          updated_at?: string;
          website?: string | null;
          whatsapp_avatar_url?: string | null;
          whatsapp_group_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "clients_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "clients_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "clients_whatsapp_group_id_fkey";
            columns: ["whatsapp_group_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_groups";
            referencedColumns: ["id"];
          },
        ];
      };
      communication_logs: {
        Row: {
          client_id: string;
          created_at: string | null;
          id: string;
          interaction_type: string | null;
          note: string | null;
          status: string;
          tenant_id: string;
          updated_by: string | null;
        };
        Insert: {
          client_id: string;
          created_at?: string | null;
          id?: string;
          interaction_type?: string | null;
          note?: string | null;
          status?: string;
          tenant_id: string;
          updated_by?: string | null;
        };
        Update: {
          client_id?: string;
          created_at?: string | null;
          id?: string;
          interaction_type?: string | null;
          note?: string | null;
          status?: string;
          tenant_id?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      crm_dashboards: {
        Row: {
          agency_id: string | null;
          client_id: string | null;
          created_at: string | null;
          dashboard_type: string | null;
          id: string;
          name: string;
          settings: Json | null;
          tenant_id: string;
          updated_at: string | null;
        };
        Insert: {
          agency_id?: string | null;
          client_id?: string | null;
          created_at?: string | null;
          dashboard_type?: string | null;
          id?: string;
          name: string;
          settings?: Json | null;
          tenant_id: string;
          updated_at?: string | null;
        };
        Update: {
          agency_id?: string | null;
          client_id?: string | null;
          created_at?: string | null;
          dashboard_type?: string | null;
          id?: string;
          name?: string;
          settings?: Json | null;
          tenant_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "crm_dashboards_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_dashboards_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_fields: {
        Row: {
          config: Json;
          created_at: string;
          id: string;
          is_required: boolean;
          is_visible: boolean;
          key: string;
          name: string;
          position: number;
          table_id: string;
          type: string;
          updated_at: string;
        };
        Insert: {
          config?: Json;
          created_at?: string;
          id?: string;
          is_required?: boolean;
          is_visible?: boolean;
          key: string;
          name: string;
          position?: number;
          table_id: string;
          type: string;
          updated_at?: string;
        };
        Update: {
          config?: Json;
          created_at?: string;
          id?: string;
          is_required?: boolean;
          is_visible?: boolean;
          key?: string;
          name?: string;
          position?: number;
          table_id?: string;
          type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_fields_table_id_fkey";
            columns: ["table_id"];
            isOneToOne: false;
            referencedRelation: "crm_tables";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_records: {
        Row: {
          agency_id: string | null;
          client_id: string | null;
          created_at: string;
          created_by: string | null;
          data: Json;
          id: string;
          table_id: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          agency_id?: string | null;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          data?: Json;
          id?: string;
          table_id: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          agency_id?: string | null;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          data?: Json;
          id?: string;
          table_id?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_records_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_records_table_id_fkey";
            columns: ["table_id"];
            isOneToOne: false;
            referencedRelation: "crm_tables";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_records_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_tables: {
        Row: {
          agency_id: string | null;
          campaign_active: boolean;
          category: string | null;
          client_id: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          icon: string | null;
          id: string;
          integration_settings: Json | null;
          integration_type: string | null;
          integrations: Json | null;
          last_sync_at: string | null;
          name: string;
          slug: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          agency_id?: string | null;
          campaign_active?: boolean;
          category?: string | null;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          icon?: string | null;
          id?: string;
          integration_settings?: Json | null;
          integration_type?: string | null;
          integrations?: Json | null;
          last_sync_at?: string | null;
          name: string;
          slug: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          agency_id?: string | null;
          campaign_active?: boolean;
          category?: string | null;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          icon?: string | null;
          id?: string;
          integration_settings?: Json | null;
          integration_type?: string | null;
          integrations?: Json | null;
          last_sync_at?: string | null;
          name?: string;
          slug?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_tables_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_tables_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_tables_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      cursor_dispatches: {
        Row: {
          agent_id: string | null;
          branch: string | null;
          context: string | null;
          created_at: string;
          cursor_agent_id: string | null;
          human_task_id: string | null;
          id: string;
          request_text: string;
          session_url: string | null;
          status: string;
          tenant_id: string | null;
          tool: string;
        };
        Insert: {
          agent_id?: string | null;
          branch?: string | null;
          context?: string | null;
          created_at?: string;
          cursor_agent_id?: string | null;
          human_task_id?: string | null;
          id?: string;
          request_text: string;
          session_url?: string | null;
          status?: string;
          tenant_id?: string | null;
          tool: string;
        };
        Update: {
          agent_id?: string | null;
          branch?: string | null;
          context?: string | null;
          created_at?: string;
          cursor_agent_id?: string | null;
          human_task_id?: string | null;
          id?: string;
          request_text?: string;
          session_url?: string | null;
          status?: string;
          tenant_id?: string | null;
          tool?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cursor_dispatches_human_task_id_fkey";
            columns: ["human_task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      cursor_sticky_agents: {
        Row: {
          cursor_agent_id: string;
          session_url: string | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          cursor_agent_id: string;
          session_url?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          cursor_agent_id?: string;
          session_url?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      custom_fields: {
        Row: {
          created_at: string;
          entity_type: string;
          field_key: string;
          field_label: string;
          field_type: string;
          id: string;
          is_required: boolean;
          is_visible: boolean;
          options: Json | null;
          sort_order: number;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          entity_type: string;
          field_key: string;
          field_label: string;
          field_type: string;
          id?: string;
          is_required?: boolean;
          is_visible?: boolean;
          options?: Json | null;
          sort_order?: number;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          entity_type?: string;
          field_key?: string;
          field_label?: string;
          field_type?: string;
          id?: string;
          is_required?: boolean;
          is_visible?: boolean;
          options?: Json | null;
          sort_order?: number;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      dashboard_shares: {
        Row: {
          allowed_emails: string[] | null;
          created_at: string;
          created_by: string;
          dashboard_id: string;
          id: string;
          is_active: boolean;
          share_token: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          allowed_emails?: string[] | null;
          created_at?: string;
          created_by: string;
          dashboard_id: string;
          id?: string;
          is_active?: boolean;
          share_token?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          allowed_emails?: string[] | null;
          created_at?: string;
          created_by?: string;
          dashboard_id?: string;
          id?: string;
          is_active?: boolean;
          share_token?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dashboard_shares_dashboard_id_fkey";
            columns: ["dashboard_id"];
            isOneToOne: false;
            referencedRelation: "crm_dashboards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dashboard_shares_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      deleted_facebook_leads: {
        Row: {
          deleted_at: string;
          id: string;
          leadgen_id: string;
          tenant_id: string;
        };
        Insert: {
          deleted_at?: string;
          id?: string;
          leadgen_id: string;
          tenant_id: string;
        };
        Update: {
          deleted_at?: string;
          id?: string;
          leadgen_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deleted_facebook_leads_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      dev_task_events: {
        Row: {
          actor: string | null;
          actor_user_id: string | null;
          created_at: string;
          detail: Json;
          dev_task_id: string;
          event_type: string;
          id: string;
          tenant_id: string;
        };
        Insert: {
          actor?: string | null;
          actor_user_id?: string | null;
          created_at?: string;
          detail?: Json;
          dev_task_id: string;
          event_type: string;
          id?: string;
          tenant_id: string;
        };
        Update: {
          actor?: string | null;
          actor_user_id?: string | null;
          created_at?: string;
          detail?: Json;
          dev_task_id?: string;
          event_type?: string;
          id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dev_task_events_dev_task_id_fkey";
            columns: ["dev_task_id"];
            isOneToOne: false;
            referencedRelation: "dev_tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dev_task_events_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      dev_tasks: {
        Row: {
          acceptance_criteria: string | null;
          affected_areas: string | null;
          approved_at: string | null;
          approved_by: string | null;
          assigned_agent: string;
          base_branch: string;
          brief: Json;
          constraints: string | null;
          created_at: string;
          current_behavior: string | null;
          cursor_session_id: string | null;
          cursor_session_url: string | null;
          dedup_of: string | null;
          dispatch_error: string | null;
          dispatched_at: string | null;
          environment: string;
          expected_behavior: string | null;
          goal_id: string | null;
          human_task_id: string | null;
          id: string;
          owner_user_id: string | null;
          pr_url: string | null;
          priority: string;
          problem: string | null;
          requested_by: string | null;
          requested_by_user_id: string | null;
          scope: string | null;
          source_conversation_id: string | null;
          source_message: string | null;
          status: string;
          tenant_id: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          acceptance_criteria?: string | null;
          affected_areas?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          assigned_agent?: string;
          base_branch?: string;
          brief?: Json;
          constraints?: string | null;
          created_at?: string;
          current_behavior?: string | null;
          cursor_session_id?: string | null;
          cursor_session_url?: string | null;
          dedup_of?: string | null;
          dispatch_error?: string | null;
          dispatched_at?: string | null;
          environment?: string;
          expected_behavior?: string | null;
          goal_id?: string | null;
          human_task_id?: string | null;
          id?: string;
          owner_user_id?: string | null;
          pr_url?: string | null;
          priority?: string;
          problem?: string | null;
          requested_by?: string | null;
          requested_by_user_id?: string | null;
          scope?: string | null;
          source_conversation_id?: string | null;
          source_message?: string | null;
          status?: string;
          tenant_id: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          acceptance_criteria?: string | null;
          affected_areas?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          assigned_agent?: string;
          base_branch?: string;
          brief?: Json;
          constraints?: string | null;
          created_at?: string;
          current_behavior?: string | null;
          cursor_session_id?: string | null;
          cursor_session_url?: string | null;
          dedup_of?: string | null;
          dispatch_error?: string | null;
          dispatched_at?: string | null;
          environment?: string;
          expected_behavior?: string | null;
          goal_id?: string | null;
          human_task_id?: string | null;
          id?: string;
          owner_user_id?: string | null;
          pr_url?: string | null;
          priority?: string;
          problem?: string | null;
          requested_by?: string | null;
          requested_by_user_id?: string | null;
          scope?: string | null;
          source_conversation_id?: string | null;
          source_message?: string | null;
          status?: string;
          tenant_id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dev_tasks_dedup_of_fkey";
            columns: ["dedup_of"];
            isOneToOne: false;
            referencedRelation: "dev_tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dev_tasks_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dev_tasks_human_task_id_fkey";
            columns: ["human_task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dev_tasks_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      error_logs: {
        Row: {
          context: Json | null;
          created_at: string | null;
          error_message: string;
          error_stack: string | null;
          id: string;
          resolved: boolean | null;
          sent_to_agent: boolean | null;
          source: string;
          tenant_id: string | null;
          url: string | null;
          user_id: string | null;
        };
        Insert: {
          context?: Json | null;
          created_at?: string | null;
          error_message: string;
          error_stack?: string | null;
          id?: string;
          resolved?: boolean | null;
          sent_to_agent?: boolean | null;
          source: string;
          tenant_id?: string | null;
          url?: string | null;
          user_id?: string | null;
        };
        Update: {
          context?: Json | null;
          created_at?: string | null;
          error_message?: string;
          error_stack?: string | null;
          id?: string;
          resolved?: boolean | null;
          sent_to_agent?: boolean | null;
          source?: string;
          tenant_id?: string | null;
          url?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "error_logs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      expense_payments: {
        Row: {
          amount: number;
          created_at: string | null;
          expense_id: string;
          expense_name: string;
          expense_type: string;
          id: string;
          notes: string | null;
          paid_at: string | null;
          paid_by: string | null;
          payment_month: string;
          tenant_id: string;
        };
        Insert: {
          amount: number;
          created_at?: string | null;
          expense_id: string;
          expense_name: string;
          expense_type: string;
          id?: string;
          notes?: string | null;
          paid_at?: string | null;
          paid_by?: string | null;
          payment_month: string;
          tenant_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string | null;
          expense_id?: string;
          expense_name?: string;
          expense_type?: string;
          id?: string;
          notes?: string | null;
          paid_at?: string | null;
          paid_by?: string | null;
          payment_month?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expense_payments_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      finance: {
        Row: {
          agency_id: string;
          amount: number;
          category: string | null;
          client_id: string;
          created_at: string;
          date: string;
          id: string;
          notes: string | null;
          payment_method: Database["public"]["Enums"]["payment_method"] | null;
          supplier_id: string | null;
          tenant_id: string | null;
          type: Database["public"]["Enums"]["finance_type"];
          updated_at: string;
        };
        Insert: {
          agency_id: string;
          amount: number;
          category?: string | null;
          client_id: string;
          created_at?: string;
          date: string;
          id?: string;
          notes?: string | null;
          payment_method?: Database["public"]["Enums"]["payment_method"] | null;
          supplier_id?: string | null;
          tenant_id?: string | null;
          type: Database["public"]["Enums"]["finance_type"];
          updated_at?: string;
        };
        Update: {
          agency_id?: string;
          amount?: number;
          category?: string | null;
          client_id?: string;
          created_at?: string;
          date?: string;
          id?: string;
          notes?: string | null;
          payment_method?: Database["public"]["Enums"]["payment_method"] | null;
          supplier_id?: string | null;
          tenant_id?: string | null;
          type?: Database["public"]["Enums"]["finance_type"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "finance_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "finance_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "finance_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "finance_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      flow_processed_leads: {
        Row: {
          automation_id: string;
          facebook_form_id: string | null;
          id: string;
          leadgen_id: string;
          processed_at: string | null;
          tenant_id: string;
        };
        Insert: {
          automation_id: string;
          facebook_form_id?: string | null;
          id?: string;
          leadgen_id: string;
          processed_at?: string | null;
          tenant_id: string;
        };
        Update: {
          automation_id?: string;
          facebook_form_id?: string | null;
          id?: string;
          leadgen_id?: string;
          processed_at?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "flow_processed_leads_automation_id_fkey";
            columns: ["automation_id"];
            isOneToOne: false;
            referencedRelation: "automations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "flow_processed_leads_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      global_settings: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          setting_key: string;
          setting_value: Json;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          setting_key: string;
          setting_value: Json;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          setting_key?: string;
          setting_value?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      gmail_allowed_labels: {
        Row: {
          created_at: string | null;
          id: string;
          label_id: string;
          label_name: string;
          tenant_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          label_id: string;
          label_name: string;
          tenant_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          label_id?: string;
          label_name?: string;
          tenant_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "gmail_allowed_labels_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      gmail_blocked_senders: {
        Row: {
          blocked_at: string;
          created_at: string;
          email_address: string;
          id: string;
          tenant_id: string;
          user_id: string;
        };
        Insert: {
          blocked_at?: string;
          created_at?: string;
          email_address: string;
          id?: string;
          tenant_id: string;
          user_id: string;
        };
        Update: {
          blocked_at?: string;
          created_at?: string;
          email_address?: string;
          id?: string;
          tenant_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "gmail_blocked_senders_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      gmail_categories: {
        Row: {
          color: string;
          created_at: string;
          gmail_label_id: string | null;
          id: string;
          name: string;
          sort_order: number;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          color?: string;
          created_at?: string;
          gmail_label_id?: string | null;
          id?: string;
          name: string;
          sort_order?: number;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          gmail_label_id?: string | null;
          id?: string;
          name?: string;
          sort_order?: number;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "gmail_categories_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      gmail_category_rules: {
        Row: {
          category_id: string;
          created_at: string;
          id: string;
          subject_pattern: string;
          tenant_id: string;
          user_id: string;
        };
        Insert: {
          category_id: string;
          created_at?: string;
          id?: string;
          subject_pattern: string;
          tenant_id: string;
          user_id: string;
        };
        Update: {
          category_id?: string;
          created_at?: string;
          id?: string;
          subject_pattern?: string;
          tenant_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "gmail_category_rules_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "gmail_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gmail_category_rules_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      gmail_message_categories: {
        Row: {
          category_id: string;
          created_at: string;
          id: string;
          message_id: string;
          tenant_id: string;
          user_id: string;
        };
        Insert: {
          category_id: string;
          created_at?: string;
          id?: string;
          message_id: string;
          tenant_id: string;
          user_id: string;
        };
        Update: {
          category_id?: string;
          created_at?: string;
          id?: string;
          message_id?: string;
          tenant_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "gmail_message_categories_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "gmail_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gmail_message_categories_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      gmail_tokens: {
        Row: {
          access_token: string;
          created_at: string;
          expires_at: string;
          google_email: string | null;
          id: string;
          refresh_token: string;
          tenant_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          access_token: string;
          created_at?: string;
          expires_at: string;
          google_email?: string | null;
          id?: string;
          refresh_token: string;
          tenant_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          access_token?: string;
          created_at?: string;
          expires_at?: string;
          google_email?: string | null;
          id?: string;
          refresh_token?: string;
          tenant_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "gmail_tokens_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      goal_actions: {
        Row: {
          action_type: string;
          completed_at: string | null;
          error: string | null;
          goal_id: string;
          id: string;
          input: Json;
          input_hash: string | null;
          iteration_id: string | null;
          result: Json | null;
          started_at: string;
          status: string;
          step_id: string | null;
          tenant_id: string;
          tool_name: string | null;
        };
        Insert: {
          action_type: string;
          completed_at?: string | null;
          error?: string | null;
          goal_id: string;
          id?: string;
          input?: Json;
          input_hash?: string | null;
          iteration_id?: string | null;
          result?: Json | null;
          started_at?: string;
          status?: string;
          step_id?: string | null;
          tenant_id: string;
          tool_name?: string | null;
        };
        Update: {
          action_type?: string;
          completed_at?: string | null;
          error?: string | null;
          goal_id?: string;
          id?: string;
          input?: Json;
          input_hash?: string | null;
          iteration_id?: string | null;
          result?: Json | null;
          started_at?: string;
          status?: string;
          step_id?: string | null;
          tenant_id?: string;
          tool_name?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "goal_actions_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_actions_iteration_id_fkey";
            columns: ["iteration_id"];
            isOneToOne: false;
            referencedRelation: "goal_loop_iterations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_actions_step_id_fkey";
            columns: ["step_id"];
            isOneToOne: false;
            referencedRelation: "goal_plan_steps";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_actions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      goal_blockers: {
        Row: {
          blocker_type: string;
          created_at: string;
          description: string | null;
          goal_id: string;
          human_action_required: string | null;
          id: string;
          requires_human: boolean;
          resolved_at: string | null;
          status: string;
          tenant_id: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          blocker_type?: string;
          created_at?: string;
          description?: string | null;
          goal_id: string;
          human_action_required?: string | null;
          id?: string;
          requires_human?: boolean;
          resolved_at?: string | null;
          status?: string;
          tenant_id: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          blocker_type?: string;
          created_at?: string;
          description?: string | null;
          goal_id?: string;
          human_action_required?: string | null;
          id?: string;
          requires_human?: boolean;
          resolved_at?: string | null;
          status?: string;
          tenant_id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_blockers_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_blockers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      goal_brain_requests: {
        Row: {
          action_id: string | null;
          callback_token: string | null;
          completed_at: string | null;
          created_at: string;
          cursor_session_id: string | null;
          delivered_at: string | null;
          error_message: string | null;
          goal_id: string;
          id: string;
          iteration_id: string | null;
          prompt_summary: string | null;
          request_type: string;
          response_json: Json | null;
          status: string;
          step_id: string | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          action_id?: string | null;
          callback_token?: string | null;
          completed_at?: string | null;
          created_at?: string;
          cursor_session_id?: string | null;
          delivered_at?: string | null;
          error_message?: string | null;
          goal_id: string;
          id?: string;
          iteration_id?: string | null;
          prompt_summary?: string | null;
          request_type: string;
          response_json?: Json | null;
          status?: string;
          step_id?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          action_id?: string | null;
          callback_token?: string | null;
          completed_at?: string | null;
          created_at?: string;
          cursor_session_id?: string | null;
          delivered_at?: string | null;
          error_message?: string | null;
          goal_id?: string;
          id?: string;
          iteration_id?: string | null;
          prompt_summary?: string | null;
          request_type?: string;
          response_json?: Json | null;
          status?: string;
          step_id?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_brain_requests_action_id_fkey";
            columns: ["action_id"];
            isOneToOne: false;
            referencedRelation: "goal_actions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_brain_requests_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_brain_requests_iteration_id_fkey";
            columns: ["iteration_id"];
            isOneToOne: false;
            referencedRelation: "goal_loop_iterations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_brain_requests_step_id_fkey";
            columns: ["step_id"];
            isOneToOne: false;
            referencedRelation: "goal_plan_steps";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_brain_requests_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      goal_engine_tools: {
        Row: {
          created_at: string;
          description: string | null;
          enabled: boolean;
          goal_id: string | null;
          handler_ref: string | null;
          id: string;
          input_schema: Json;
          name: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          enabled?: boolean;
          goal_id?: string | null;
          handler_ref?: string | null;
          id?: string;
          input_schema?: Json;
          name: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          enabled?: boolean;
          goal_id?: string | null;
          handler_ref?: string | null;
          id?: string;
          input_schema?: Json;
          name?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_engine_tools_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_engine_tools_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      goal_events: {
        Row: {
          actor: string | null;
          actor_user_id: string | null;
          created_at: string;
          detail: Json;
          event_type: string;
          goal_id: string;
          id: string;
          tenant_id: string;
        };
        Insert: {
          actor?: string | null;
          actor_user_id?: string | null;
          created_at?: string;
          detail?: Json;
          event_type: string;
          goal_id: string;
          id?: string;
          tenant_id: string;
        };
        Update: {
          actor?: string | null;
          actor_user_id?: string | null;
          created_at?: string;
          detail?: Json;
          event_type?: string;
          goal_id?: string;
          id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_events_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_events_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      goal_evidence: {
        Row: {
          content: Json;
          created_at: string;
          criterion_id: string | null;
          evidence_type: string;
          goal_id: string;
          id: string;
          source_action_id: string | null;
          tenant_id: string;
          verified_at: string;
        };
        Insert: {
          content?: Json;
          created_at?: string;
          criterion_id?: string | null;
          evidence_type: string;
          goal_id: string;
          id?: string;
          source_action_id?: string | null;
          tenant_id: string;
          verified_at?: string;
        };
        Update: {
          content?: Json;
          created_at?: string;
          criterion_id?: string | null;
          evidence_type?: string;
          goal_id?: string;
          id?: string;
          source_action_id?: string | null;
          tenant_id?: string;
          verified_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_evidence_criterion_id_fkey";
            columns: ["criterion_id"];
            isOneToOne: false;
            referencedRelation: "goal_success_criteria";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_evidence_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_evidence_source_action_id_fkey";
            columns: ["source_action_id"];
            isOneToOne: false;
            referencedRelation: "goal_actions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_evidence_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      goal_loop_iterations: {
        Row: {
          completed_at: string | null;
          context_snapshot: Json;
          error_message: string | null;
          goal_id: string;
          id: string;
          iteration_number: number;
          phase: string;
          started_at: string;
          status: string;
          summary: string | null;
          tenant_id: string;
        };
        Insert: {
          completed_at?: string | null;
          context_snapshot?: Json;
          error_message?: string | null;
          goal_id: string;
          id?: string;
          iteration_number: number;
          phase: string;
          started_at?: string;
          status?: string;
          summary?: string | null;
          tenant_id: string;
        };
        Update: {
          completed_at?: string | null;
          context_snapshot?: Json;
          error_message?: string | null;
          goal_id?: string;
          id?: string;
          iteration_number?: number;
          phase?: string;
          started_at?: string;
          status?: string;
          summary?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_loop_iterations_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_loop_iterations_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      goal_milestones: {
        Row: {
          completed_at: string | null;
          created_at: string;
          description: string | null;
          due_date: string | null;
          goal_id: string;
          id: string;
          owner_id: string | null;
          sort_order: number;
          status: string;
          tenant_id: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          description?: string | null;
          due_date?: string | null;
          goal_id: string;
          id?: string;
          owner_id?: string | null;
          sort_order?: number;
          status?: string;
          tenant_id: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          description?: string | null;
          due_date?: string | null;
          goal_id?: string;
          id?: string;
          owner_id?: string | null;
          sort_order?: number;
          status?: string;
          tenant_id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_milestones_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_milestones_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      goal_model_events: {
        Row: {
          cost_usd: number | null;
          created_at: string;
          error_class: string | null;
          failover_reason: string | null;
          goal_id: string | null;
          id: string;
          iteration_id: string | null;
          latency_ms: number | null;
          model: string | null;
          profile: string;
          provider: string | null;
          tenant_id: string;
          tokens_in: number | null;
          tokens_out: number | null;
        };
        Insert: {
          cost_usd?: number | null;
          created_at?: string;
          error_class?: string | null;
          failover_reason?: string | null;
          goal_id?: string | null;
          id?: string;
          iteration_id?: string | null;
          latency_ms?: number | null;
          model?: string | null;
          profile: string;
          provider?: string | null;
          tenant_id: string;
          tokens_in?: number | null;
          tokens_out?: number | null;
        };
        Update: {
          cost_usd?: number | null;
          created_at?: string;
          error_class?: string | null;
          failover_reason?: string | null;
          goal_id?: string | null;
          id?: string;
          iteration_id?: string | null;
          latency_ms?: number | null;
          model?: string | null;
          profile?: string;
          provider?: string | null;
          tenant_id?: string;
          tokens_in?: number | null;
          tokens_out?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "goal_model_events_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_model_events_iteration_id_fkey";
            columns: ["iteration_id"];
            isOneToOne: false;
            referencedRelation: "goal_loop_iterations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_model_events_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      goal_orchestrator_brain: {
        Row: {
          created_at: string;
          cursor_session_id: string;
          cursor_session_url: string | null;
          session_source: string | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          cursor_session_id: string;
          cursor_session_url?: string | null;
          session_source?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          cursor_session_id?: string;
          cursor_session_url?: string | null;
          session_source?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_orchestrator_brain_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      goal_plan_steps: {
        Row: {
          action_type: string;
          completed_at: string | null;
          created_at: string;
          cursor_agent_id: string | null;
          cursor_session_url: string | null;
          description: string | null;
          goal_id: string;
          id: string;
          metadata: Json;
          parallel_track: boolean;
          parent_step_id: string | null;
          priority: number;
          sort_order: number;
          started_at: string | null;
          status: string;
          sub_project_key: string | null;
          sub_project_label: string | null;
          tenant_id: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          action_type?: string;
          completed_at?: string | null;
          created_at?: string;
          cursor_agent_id?: string | null;
          cursor_session_url?: string | null;
          description?: string | null;
          goal_id: string;
          id?: string;
          metadata?: Json;
          parallel_track?: boolean;
          parent_step_id?: string | null;
          priority?: number;
          sort_order?: number;
          started_at?: string | null;
          status?: string;
          sub_project_key?: string | null;
          sub_project_label?: string | null;
          tenant_id: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          action_type?: string;
          completed_at?: string | null;
          created_at?: string;
          cursor_agent_id?: string | null;
          cursor_session_url?: string | null;
          description?: string | null;
          goal_id?: string;
          id?: string;
          metadata?: Json;
          parallel_track?: boolean;
          parent_step_id?: string | null;
          priority?: number;
          sort_order?: number;
          started_at?: string | null;
          status?: string;
          sub_project_key?: string | null;
          sub_project_label?: string | null;
          tenant_id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_plan_steps_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_plan_steps_parent_step_id_fkey";
            columns: ["parent_step_id"];
            isOneToOne: false;
            referencedRelation: "goal_plan_steps";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_plan_steps_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      goal_success_criteria: {
        Row: {
          created_at: string;
          criterion_key: string;
          description: string;
          evidence_required: string | null;
          goal_id: string;
          id: string;
          last_verified_at: string | null;
          required: boolean;
          sort_order: number;
          status: string;
          tenant_id: string;
          updated_at: string;
          verification_config: Json;
          verification_type: string;
        };
        Insert: {
          created_at?: string;
          criterion_key: string;
          description: string;
          evidence_required?: string | null;
          goal_id: string;
          id?: string;
          last_verified_at?: string | null;
          required?: boolean;
          sort_order?: number;
          status?: string;
          tenant_id: string;
          updated_at?: string;
          verification_config?: Json;
          verification_type?: string;
        };
        Update: {
          created_at?: string;
          criterion_key?: string;
          description?: string;
          evidence_required?: string | null;
          goal_id?: string;
          id?: string;
          last_verified_at?: string | null;
          required?: boolean;
          sort_order?: number;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          verification_config?: Json;
          verification_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_success_criteria_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_success_criteria_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      goals: {
        Row: {
          agent_id: string | null;
          autonomous_mode: boolean;
          completion_criteria: string | null;
          constraints: Json;
          created_at: string;
          cursor_agent_id: string | null;
          cursor_session_url: string | null;
          description: string | null;
          due_date: string | null;
          engine_status: string;
          execution_mode: boolean;
          id: string;
          iteration_count: number;
          last_iteration_at: string | null;
          lock_holder: string | null;
          lock_until: string | null;
          next_action: string | null;
          next_run_at: string | null;
          objective: string | null;
          owner_id: string | null;
          owner_type: string;
          owner_user_id: string | null;
          parent_goal_id: string | null;
          plan: Json;
          priority: string;
          progress_percent: number | null;
          risk_level: string;
          scope: Json;
          status: string;
          stuck_score: number;
          tenant_id: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          agent_id?: string | null;
          autonomous_mode?: boolean;
          completion_criteria?: string | null;
          constraints?: Json;
          created_at?: string;
          cursor_agent_id?: string | null;
          cursor_session_url?: string | null;
          description?: string | null;
          due_date?: string | null;
          engine_status?: string;
          execution_mode?: boolean;
          id?: string;
          iteration_count?: number;
          last_iteration_at?: string | null;
          lock_holder?: string | null;
          lock_until?: string | null;
          next_action?: string | null;
          next_run_at?: string | null;
          objective?: string | null;
          owner_id?: string | null;
          owner_type?: string;
          owner_user_id?: string | null;
          parent_goal_id?: string | null;
          plan?: Json;
          priority?: string;
          progress_percent?: number | null;
          risk_level?: string;
          scope?: Json;
          status?: string;
          stuck_score?: number;
          tenant_id: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          agent_id?: string | null;
          autonomous_mode?: boolean;
          completion_criteria?: string | null;
          constraints?: Json;
          created_at?: string;
          cursor_agent_id?: string | null;
          cursor_session_url?: string | null;
          description?: string | null;
          due_date?: string | null;
          engine_status?: string;
          execution_mode?: boolean;
          id?: string;
          iteration_count?: number;
          last_iteration_at?: string | null;
          lock_holder?: string | null;
          lock_until?: string | null;
          next_action?: string | null;
          next_run_at?: string | null;
          objective?: string | null;
          owner_id?: string | null;
          owner_type?: string;
          owner_user_id?: string | null;
          parent_goal_id?: string | null;
          plan?: Json;
          priority?: string;
          progress_percent?: number | null;
          risk_level?: string;
          scope?: Json;
          status?: string;
          stuck_score?: number;
          tenant_id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goals_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "ai_agents";
            referencedColumns: ["id"];
          },
        ];
      };
      grok_dispatches: {
        Row: {
          agent_id: string | null;
          branch: string | null;
          context: string | null;
          created_at: string;
          cursor_agent_id: string | null;
          id: string;
          request_text: string;
          session_url: string | null;
          status: string;
          tenant_id: string | null;
          tool: string;
        };
        Insert: {
          agent_id?: string | null;
          branch?: string | null;
          context?: string | null;
          created_at?: string;
          cursor_agent_id?: string | null;
          id?: string;
          request_text: string;
          session_url?: string | null;
          status?: string;
          tenant_id?: string | null;
          tool: string;
        };
        Update: {
          agent_id?: string | null;
          branch?: string | null;
          context?: string | null;
          created_at?: string;
          cursor_agent_id?: string | null;
          id?: string;
          request_text?: string;
          session_url?: string | null;
          status?: string;
          tenant_id?: string | null;
          tool?: string;
        };
        Relationships: [];
      };
      grok_sticky_agents: {
        Row: {
          cursor_agent_id: string;
          session_url: string | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          cursor_agent_id: string;
          session_url?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          cursor_agent_id?: string;
          session_url?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      gsc_keyword_snapshots: {
        Row: {
          client_id: string | null;
          created_at: string;
          end_date: string;
          id: string;
          keywords: Json;
          period_key: string;
          row_count: number;
          site_url: string;
          start_date: string;
          synced_at: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          client_id?: string | null;
          created_at?: string;
          end_date: string;
          id?: string;
          keywords?: Json;
          period_key: string;
          row_count?: number;
          site_url: string;
          start_date: string;
          synced_at?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          client_id?: string | null;
          created_at?: string;
          end_date?: string;
          id?: string;
          keywords?: Json;
          period_key?: string;
          row_count?: number;
          site_url?: string;
          start_date?: string;
          synced_at?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      heartbeat_logs: {
        Row: {
          actions_taken: Json | null;
          agent_id: string | null;
          created_at: string;
          duration_ms: number | null;
          id: string;
          summary: string | null;
          tasks_reviewed: number | null;
          tenant_id: string;
          triggered_at: string;
        };
        Insert: {
          actions_taken?: Json | null;
          agent_id?: string | null;
          created_at?: string;
          duration_ms?: number | null;
          id?: string;
          summary?: string | null;
          tasks_reviewed?: number | null;
          tenant_id: string;
          triggered_at?: string;
        };
        Update: {
          actions_taken?: Json | null;
          agent_id?: string | null;
          created_at?: string;
          duration_ms?: number | null;
          id?: string;
          summary?: string | null;
          tasks_reviewed?: number | null;
          tenant_id?: string;
          triggered_at?: string;
        };
        Relationships: [];
      };
      hidden_chats: {
        Row: {
          client_id: string | null;
          created_at: string;
          group_id: string | null;
          hidden_at: string;
          id: string;
          lead_id: string | null;
          sender_phone: string | null;
          tenant_id: string;
          user_id: string;
        };
        Insert: {
          client_id?: string | null;
          created_at?: string;
          group_id?: string | null;
          hidden_at?: string;
          id?: string;
          lead_id?: string | null;
          sender_phone?: string | null;
          tenant_id: string;
          user_id: string;
        };
        Update: {
          client_id?: string | null;
          created_at?: string;
          group_id?: string | null;
          hidden_at?: string;
          id?: string;
          lead_id?: string | null;
          sender_phone?: string | null;
          tenant_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hidden_chats_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hidden_chats_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hidden_chats_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hidden_chats_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      import_history: {
        Row: {
          created_at: string;
          file_content: string;
          file_name: string;
          id: string;
          import_type: string;
          imported_at: string;
          imported_by: string | null;
          records_count: number | null;
          tenant_id: string | null;
        };
        Insert: {
          created_at?: string;
          file_content: string;
          file_name: string;
          id?: string;
          import_type: string;
          imported_at?: string;
          imported_by?: string | null;
          records_count?: number | null;
          tenant_id?: string | null;
        };
        Update: {
          created_at?: string;
          file_content?: string;
          file_name?: string;
          id?: string;
          import_type?: string;
          imported_at?: string;
          imported_by?: string | null;
          records_count?: number | null;
          tenant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "import_history_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      income_payments: {
        Row: {
          amount: number;
          client_id: string;
          client_name: string;
          created_at: string | null;
          id: string;
          notes: string | null;
          payment_month: string;
          received_at: string | null;
          received_by: string | null;
          tenant_id: string;
        };
        Insert: {
          amount: number;
          client_id: string;
          client_name: string;
          created_at?: string | null;
          id?: string;
          notes?: string | null;
          payment_month: string;
          received_at?: string | null;
          received_by?: string | null;
          tenant_id: string;
        };
        Update: {
          amount?: number;
          client_id?: string;
          client_name?: string;
          created_at?: string | null;
          id?: string;
          notes?: string | null;
          payment_month?: string;
          received_at?: string | null;
          received_by?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "income_payments_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "income_payments_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      integration_alerts_log: {
        Row: {
          account_id: string | null;
          alert_type: string;
          fired_at: string;
          id: string;
          payload: Json;
          provider: string;
          reason: string | null;
          tenant_id: string;
        };
        Insert: {
          account_id?: string | null;
          alert_type: string;
          fired_at?: string;
          id?: string;
          payload?: Json;
          provider: string;
          reason?: string | null;
          tenant_id: string;
        };
        Update: {
          account_id?: string | null;
          alert_type?: string;
          fired_at?: string;
          id?: string;
          payload?: Json;
          provider?: string;
          reason?: string | null;
          tenant_id?: string;
        };
        Relationships: [];
      };
      integration_health: {
        Row: {
          consecutive_failures: number;
          cooldown_until: string | null;
          id: string;
          is_circuit_open: boolean;
          last_failure_at: string | null;
          last_success_at: string | null;
          provider: string;
          tenant_id: string;
          total_calls: number;
          total_failures: number;
        };
        Insert: {
          consecutive_failures?: number;
          cooldown_until?: string | null;
          id?: string;
          is_circuit_open?: boolean;
          last_failure_at?: string | null;
          last_success_at?: string | null;
          provider: string;
          tenant_id: string;
          total_calls?: number;
          total_failures?: number;
        };
        Update: {
          consecutive_failures?: number;
          cooldown_until?: string | null;
          id?: string;
          is_circuit_open?: boolean;
          last_failure_at?: string | null;
          last_success_at?: string | null;
          provider?: string;
          tenant_id?: string;
          total_calls?: number;
          total_failures?: number;
        };
        Relationships: [];
      };
      integration_tenant_access: {
        Row: {
          accessing_tenant_id: string;
          granted_at: string;
          granted_by: string | null;
          id: string;
          integration_id: string;
        };
        Insert: {
          accessing_tenant_id: string;
          granted_at?: string;
          granted_by?: string | null;
          id?: string;
          integration_id: string;
        };
        Update: {
          accessing_tenant_id?: string;
          granted_at?: string;
          granted_by?: string | null;
          id?: string;
          integration_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "integration_tenant_access_accessing_tenant_id_fkey";
            columns: ["accessing_tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "integration_tenant_access_integration_id_fkey";
            columns: ["integration_id"];
            isOneToOne: false;
            referencedRelation: "tenant_integrations";
            referencedColumns: ["id"];
          },
        ];
      };
      integration_user_permissions: {
        Row: {
          created_at: string;
          granted_at: string;
          granted_by: string;
          id: string;
          integration_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          granted_at?: string;
          granted_by: string;
          id?: string;
          integration_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          granted_at?: string;
          granted_by?: string;
          id?: string;
          integration_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "integration_user_permissions_integration_id_fkey";
            columns: ["integration_id"];
            isOneToOne: false;
            referencedRelation: "tenant_integrations";
            referencedColumns: ["id"];
          },
        ];
      };
      invitation_tokens: {
        Row: {
          created_at: string;
          created_by: string;
          email: string | null;
          expires_at: string;
          id: string;
          metadata: Json | null;
          tenant_id: string;
          token: string;
          updated_at: string;
          used: boolean;
          used_at: string | null;
          used_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          email?: string | null;
          expires_at?: string;
          id?: string;
          metadata?: Json | null;
          tenant_id: string;
          token: string;
          updated_at?: string;
          used?: boolean;
          used_at?: string | null;
          used_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          email?: string | null;
          expires_at?: string;
          id?: string;
          metadata?: Json | null;
          tenant_id?: string;
          token?: string;
          updated_at?: string;
          used?: boolean;
          used_at?: string | null;
          used_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "invitation_tokens_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      invoice_uploads: {
        Row: {
          agency_id: string | null;
          client_id: string | null;
          created_at: string;
          currency: string | null;
          description: string | null;
          error_message: string | null;
          file_path: string;
          finance_id: string | null;
          id: string;
          invoice_date: string | null;
          invoice_number: string | null;
          mime_type: string | null;
          raw_extraction: Json | null;
          status: string;
          supplier_id: string | null;
          tenant_id: string;
          total_amount: number | null;
          updated_at: string;
          uploaded_by: string | null;
          vat_amount: number | null;
          vendor_name: string | null;
        };
        Insert: {
          agency_id?: string | null;
          client_id?: string | null;
          created_at?: string;
          currency?: string | null;
          description?: string | null;
          error_message?: string | null;
          file_path: string;
          finance_id?: string | null;
          id?: string;
          invoice_date?: string | null;
          invoice_number?: string | null;
          mime_type?: string | null;
          raw_extraction?: Json | null;
          status?: string;
          supplier_id?: string | null;
          tenant_id: string;
          total_amount?: number | null;
          updated_at?: string;
          uploaded_by?: string | null;
          vat_amount?: number | null;
          vendor_name?: string | null;
        };
        Update: {
          agency_id?: string | null;
          client_id?: string | null;
          created_at?: string;
          currency?: string | null;
          description?: string | null;
          error_message?: string | null;
          file_path?: string;
          finance_id?: string | null;
          id?: string;
          invoice_date?: string | null;
          invoice_number?: string | null;
          mime_type?: string | null;
          raw_extraction?: Json | null;
          status?: string;
          supplier_id?: string | null;
          tenant_id?: string;
          total_amount?: number | null;
          updated_at?: string;
          uploaded_by?: string | null;
          vat_amount?: number | null;
          vendor_name?: string | null;
        };
        Relationships: [];
      };
      job_queue: {
        Row: {
          attempts: number;
          created_at: string;
          error: string | null;
          finished_at: string | null;
          id: string;
          idempotency_key: string | null;
          job_type: Database["public"]["Enums"]["job_type"];
          locked_until: string | null;
          max_attempts: number;
          payload: Json;
          priority: Database["public"]["Enums"]["job_priority"];
          result: Json | null;
          started_at: string | null;
          status: Database["public"]["Enums"]["job_status"];
          tenant_id: string;
        };
        Insert: {
          attempts?: number;
          created_at?: string;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          idempotency_key?: string | null;
          job_type?: Database["public"]["Enums"]["job_type"];
          locked_until?: string | null;
          max_attempts?: number;
          payload?: Json;
          priority?: Database["public"]["Enums"]["job_priority"];
          result?: Json | null;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["job_status"];
          tenant_id: string;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          idempotency_key?: string | null;
          job_type?: Database["public"]["Enums"]["job_type"];
          locked_until?: string | null;
          max_attempts?: number;
          payload?: Json;
          priority?: Database["public"]["Enums"]["job_priority"];
          result?: Json | null;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["job_status"];
          tenant_id?: string;
        };
        Relationships: [];
      };
      lead_alert_failure_notifications: {
        Row: {
          automation_log_id: string;
          client_name: string | null;
          client_phone: string | null;
          created_at: string;
          error_message: string;
          lead_name: string | null;
          notified_at: string | null;
          tenant_id: string;
        };
        Insert: {
          automation_log_id: string;
          client_name?: string | null;
          client_phone?: string | null;
          created_at?: string;
          error_message: string;
          lead_name?: string | null;
          notified_at?: string | null;
          tenant_id: string;
        };
        Update: {
          automation_log_id?: string;
          client_name?: string | null;
          client_phone?: string | null;
          created_at?: string;
          error_message?: string;
          lead_name?: string | null;
          notified_at?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_alert_failure_notifications_automation_log_id_fkey";
            columns: ["automation_log_id"];
            isOneToOne: true;
            referencedRelation: "automation_logs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_alert_failure_notifications_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_filter_presets: {
        Row: {
          created_at: string;
          filters: Json;
          id: string;
          name: string;
          sort_order: number;
          tenant_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          filters?: Json;
          id?: string;
          name: string;
          sort_order?: number;
          tenant_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          filters?: Json;
          id?: string;
          name?: string;
          sort_order?: number;
          tenant_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_filter_presets_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_notification_events: {
        Row: {
          client_id: string | null;
          external_id: string;
          form_id: string | null;
          id: string;
          received_at: string;
          source: string;
          tenant_id: string;
        };
        Insert: {
          client_id?: string | null;
          external_id: string;
          form_id?: string | null;
          id?: string;
          received_at?: string;
          source: string;
          tenant_id: string;
        };
        Update: {
          client_id?: string | null;
          external_id?: string;
          form_id?: string | null;
          id?: string;
          received_at?: string;
          source?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_notification_events_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_notification_events_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_pipeline_stages: {
        Row: {
          color: string;
          created_at: string;
          id: string;
          is_active: boolean;
          label: string;
          sort_order: number;
          stage_key: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          color?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          label: string;
          sort_order?: number;
          stage_key: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          label?: string;
          sort_order?: number;
          stage_key?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_pipeline_stages_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_sales_people: {
        Row: {
          created_at: string | null;
          id: string;
          lead_id: string;
          sales_person_id: string;
          tenant_id: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          lead_id: string;
          sales_person_id: string;
          tenant_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          lead_id?: string;
          sales_person_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_sales_people_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_sales_people_sales_person_id_fkey";
            columns: ["sales_person_id"];
            isOneToOne: false;
            referencedRelation: "sales_people";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_sales_people_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_statuses: {
        Row: {
          color: string;
          created_at: string;
          id: string;
          is_active: boolean;
          label: string;
          sort_order: number;
          status_key: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          color?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          label: string;
          sort_order?: number;
          status_key: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          label?: string;
          sort_order?: number;
          status_key?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_statuses_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_updates: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          lead_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          id?: string;
          lead_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          lead_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_updates_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_updates_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      leads: {
        Row: {
          active_chat_provider:
            Database["public"]["Enums"]["chat_provider"] | null;
          agency_id: string | null;
          archived_at: string | null;
          archived_by: string | null;
          attachments: Json;
          campaign_name: string | null;
          client_id: string | null;
          closing_date: string | null;
          company_name: string;
          contact_name: string | null;
          created_at: string;
          email: string | null;
          estimated_deal_value: number | null;
          facebook_form_id: string | null;
          facebook_leadgen_id: string | null;
          first_created_at: string | null;
          first_source: Database["public"]["Enums"]["lead_source"] | null;
          folder_link: string | null;
          folder_links: Json;
          follow_up_date: string | null;
          form_data: Json;
          form_qa_summary: string | null;
          general_status: string | null;
          id: string;
          industry: string | null;
          itai_meeting_date: string | null;
          lost_reason: string | null;
          manychat_subscriber_id: string | null;
          meeting_date: string | null;
          meeting_location: string | null;
          meeting_reminder_day_after_sent_at: string | null;
          meeting_reminder_same_day_sent_at: string | null;
          meeting_set_date: string | null;
          meeting_time: string | null;
          monthly_budget: number | null;
          notes: string | null;
          phone: string | null;
          products: string | null;
          proposal_date: string | null;
          proposal_sent_date: string | null;
          response_status: string | null;
          sale_date: string | null;
          sales_person_id: string | null;
          source: Database["public"]["Enums"]["lead_source"];
          status: string;
          tenant_id: string | null;
          three_month_budget: number | null;
          updated_at: string;
          whatsapp_avatar_url: string | null;
          won_date: string | null;
        };
        Insert: {
          active_chat_provider?:
            Database["public"]["Enums"]["chat_provider"] | null;
          agency_id?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          attachments?: Json;
          campaign_name?: string | null;
          client_id?: string | null;
          closing_date?: string | null;
          company_name: string;
          contact_name?: string | null;
          created_at?: string;
          email?: string | null;
          estimated_deal_value?: number | null;
          facebook_form_id?: string | null;
          facebook_leadgen_id?: string | null;
          first_created_at?: string | null;
          first_source?: Database["public"]["Enums"]["lead_source"] | null;
          folder_link?: string | null;
          folder_links?: Json;
          follow_up_date?: string | null;
          form_data?: Json;
          form_qa_summary?: string | null;
          general_status?: string | null;
          id?: string;
          industry?: string | null;
          itai_meeting_date?: string | null;
          lost_reason?: string | null;
          manychat_subscriber_id?: string | null;
          meeting_date?: string | null;
          meeting_location?: string | null;
          meeting_reminder_day_after_sent_at?: string | null;
          meeting_reminder_same_day_sent_at?: string | null;
          meeting_set_date?: string | null;
          meeting_time?: string | null;
          monthly_budget?: number | null;
          notes?: string | null;
          phone?: string | null;
          products?: string | null;
          proposal_date?: string | null;
          proposal_sent_date?: string | null;
          response_status?: string | null;
          sale_date?: string | null;
          sales_person_id?: string | null;
          source?: Database["public"]["Enums"]["lead_source"];
          status?: string;
          tenant_id?: string | null;
          three_month_budget?: number | null;
          updated_at?: string;
          whatsapp_avatar_url?: string | null;
          won_date?: string | null;
        };
        Update: {
          active_chat_provider?:
            Database["public"]["Enums"]["chat_provider"] | null;
          agency_id?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          attachments?: Json;
          campaign_name?: string | null;
          client_id?: string | null;
          closing_date?: string | null;
          company_name?: string;
          contact_name?: string | null;
          created_at?: string;
          email?: string | null;
          estimated_deal_value?: number | null;
          facebook_form_id?: string | null;
          facebook_leadgen_id?: string | null;
          first_created_at?: string | null;
          first_source?: Database["public"]["Enums"]["lead_source"] | null;
          folder_link?: string | null;
          folder_links?: Json;
          follow_up_date?: string | null;
          form_data?: Json;
          form_qa_summary?: string | null;
          general_status?: string | null;
          id?: string;
          industry?: string | null;
          itai_meeting_date?: string | null;
          lost_reason?: string | null;
          manychat_subscriber_id?: string | null;
          meeting_date?: string | null;
          meeting_location?: string | null;
          meeting_reminder_day_after_sent_at?: string | null;
          meeting_reminder_same_day_sent_at?: string | null;
          meeting_set_date?: string | null;
          meeting_time?: string | null;
          monthly_budget?: number | null;
          notes?: string | null;
          phone?: string | null;
          products?: string | null;
          proposal_date?: string | null;
          proposal_sent_date?: string | null;
          response_status?: string | null;
          sale_date?: string | null;
          sales_person_id?: string | null;
          source?: Database["public"]["Enums"]["lead_source"];
          status?: string;
          tenant_id?: string | null;
          three_month_budget?: number | null;
          updated_at?: string;
          whatsapp_avatar_url?: string | null;
          won_date?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "leads_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_sales_person_id_fkey";
            columns: ["sales_person_id"];
            isOneToOne: false;
            referencedRelation: "sales_people";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      manually_read_contacts: {
        Row: {
          client_id: string | null;
          created_at: string;
          group_id: string | null;
          id: string;
          lead_id: string | null;
          marked_at: string;
          sender_phone: string | null;
          tenant_id: string;
          user_id: string;
        };
        Insert: {
          client_id?: string | null;
          created_at?: string;
          group_id?: string | null;
          id?: string;
          lead_id?: string | null;
          marked_at?: string;
          sender_phone?: string | null;
          tenant_id: string;
          user_id: string;
        };
        Update: {
          client_id?: string | null;
          created_at?: string;
          group_id?: string | null;
          id?: string;
          lead_id?: string | null;
          marked_at?: string;
          sender_phone?: string | null;
          tenant_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "manually_read_contacts_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "manually_read_contacts_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "manually_read_contacts_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "manually_read_contacts_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      manus_tasks: {
        Row: {
          created_at: string;
          created_by: string | null;
          credit_usage: number | null;
          id: string;
          output: Json | null;
          prompt: string;
          share_url: string | null;
          status: string;
          task_id: string;
          task_url: string | null;
          tenant_id: string;
          title: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          credit_usage?: number | null;
          id?: string;
          output?: Json | null;
          prompt: string;
          share_url?: string | null;
          status?: string;
          task_id: string;
          task_url?: string | null;
          tenant_id: string;
          title?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          credit_usage?: number | null;
          id?: string;
          output?: Json | null;
          prompt?: string;
          share_url?: string | null;
          status?: string;
          task_id?: string;
          task_url?: string | null;
          tenant_id?: string;
          title?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "manus_tasks_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      manychat_destination_send_locks: {
        Row: {
          destination_key: string;
          expires_at: string;
        };
        Insert: {
          destination_key: string;
          expires_at: string;
        };
        Update: {
          destination_key?: string;
          expires_at?: string;
        };
        Relationships: [];
      };
      marketing_ab_variants: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          label: string | null;
          selected: boolean;
          stage_id: string | null;
          tenant_id: string;
          work_item_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          id?: string;
          label?: string | null;
          selected?: boolean;
          stage_id?: string | null;
          tenant_id: string;
          work_item_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          label?: string | null;
          selected?: boolean;
          stage_id?: string | null;
          tenant_id?: string;
          work_item_id?: string;
        };
        Relationships: [];
      };
      marketing_assets: {
        Row: {
          content: string | null;
          created_at: string;
          id: string;
          item_id: string;
          meta: Json;
          run_id: string | null;
          stage_id: string | null;
          tenant_id: string;
          type: string;
          url: string | null;
        };
        Insert: {
          content?: string | null;
          created_at?: string;
          id?: string;
          item_id: string;
          meta?: Json;
          run_id?: string | null;
          stage_id?: string | null;
          tenant_id: string;
          type: string;
          url?: string | null;
        };
        Update: {
          content?: string | null;
          created_at?: string;
          id?: string;
          item_id?: string;
          meta?: Json;
          run_id?: string | null;
          stage_id?: string | null;
          tenant_id?: string;
          type?: string;
          url?: string | null;
        };
        Relationships: [];
      };
      marketing_item_transitions: {
        Row: {
          created_at: string;
          from_stage_id: string | null;
          id: string;
          item_id: string;
          notes: string | null;
          tenant_id: string;
          to_stage_id: string | null;
          trigger_type: string;
          triggered_by: string | null;
        };
        Insert: {
          created_at?: string;
          from_stage_id?: string | null;
          id?: string;
          item_id: string;
          notes?: string | null;
          tenant_id: string;
          to_stage_id?: string | null;
          trigger_type?: string;
          triggered_by?: string | null;
        };
        Update: {
          created_at?: string;
          from_stage_id?: string | null;
          id?: string;
          item_id?: string;
          notes?: string | null;
          tenant_id?: string;
          to_stage_id?: string | null;
          trigger_type?: string;
          triggered_by?: string | null;
        };
        Relationships: [];
      };
      marketing_media_library: {
        Row: {
          ad_ready: boolean;
          bucket_path: string;
          caption: string | null;
          client_id: string | null;
          created_at: string;
          created_by: string | null;
          duration_seconds: number | null;
          file_size: number | null;
          height: number | null;
          id: string;
          lead_id: string | null;
          mime_type: string;
          source: string;
          source_message_id: string | null;
          tags: string[];
          tenant_id: string;
          updated_at: string;
          usage_count: number;
          width: number | null;
        };
        Insert: {
          ad_ready?: boolean;
          bucket_path: string;
          caption?: string | null;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          duration_seconds?: number | null;
          file_size?: number | null;
          height?: number | null;
          id?: string;
          lead_id?: string | null;
          mime_type: string;
          source?: string;
          source_message_id?: string | null;
          tags?: string[];
          tenant_id: string;
          updated_at?: string;
          usage_count?: number;
          width?: number | null;
        };
        Update: {
          ad_ready?: boolean;
          bucket_path?: string;
          caption?: string | null;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          duration_seconds?: number | null;
          file_size?: number | null;
          height?: number | null;
          id?: string;
          lead_id?: string | null;
          mime_type?: string;
          source?: string;
          source_message_id?: string | null;
          tags?: string[];
          tenant_id?: string;
          updated_at?: string;
          usage_count?: number;
          width?: number | null;
        };
        Relationships: [];
      };
      marketing_pipeline_stages: {
        Row: {
          agent_id: string | null;
          approval_mode: Database["public"]["Enums"]["marketing_approval_mode"];
          configuration: Json;
          created_at: string;
          id: string;
          name: string;
          parent_stage_id: string | null;
          pipeline_id: string;
          position_x: number;
          position_y: number;
          sort_order: number;
          stage_type: Database["public"]["Enums"]["marketing_stage_type"];
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          agent_id?: string | null;
          approval_mode?: Database["public"]["Enums"]["marketing_approval_mode"];
          configuration?: Json;
          created_at?: string;
          id?: string;
          name: string;
          parent_stage_id?: string | null;
          pipeline_id: string;
          position_x?: number;
          position_y?: number;
          sort_order?: number;
          stage_type: Database["public"]["Enums"]["marketing_stage_type"];
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          agent_id?: string | null;
          approval_mode?: Database["public"]["Enums"]["marketing_approval_mode"];
          configuration?: Json;
          created_at?: string;
          id?: string;
          name?: string;
          parent_stage_id?: string | null;
          pipeline_id?: string;
          position_x?: number;
          position_y?: number;
          sort_order?: number;
          stage_type?: Database["public"]["Enums"]["marketing_stage_type"];
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "marketing_pipeline_stages_agent_fk";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "ai_agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "marketing_pipeline_stages_pipeline_fk";
            columns: ["pipeline_id"];
            isOneToOne: false;
            referencedRelation: "marketing_pipelines";
            referencedColumns: ["id"];
          },
        ];
      };
      marketing_pipelines: {
        Row: {
          client_id: string | null;
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          tenant_id: string;
          track: string;
          updated_at: string;
        };
        Insert: {
          client_id?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          tenant_id: string;
          track?: string;
          updated_at?: string;
        };
        Update: {
          client_id?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          tenant_id?: string;
          track?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      marketing_runs: {
        Row: {
          attempts: number;
          cost_usd: number;
          created_at: string;
          created_by: string | null;
          credits: number | null;
          error: string | null;
          finished_at: string | null;
          id: string;
          input: Json;
          item_id: string;
          kind: string | null;
          model: string | null;
          output: Json;
          provider: string | null;
          provider_job_id: string | null;
          scene_id: string | null;
          stage_id: string;
          started_at: string | null;
          status: string;
          tenant_id: string;
          tokens_in: number;
          tokens_out: number;
          updated_at: string;
        };
        Insert: {
          attempts?: number;
          cost_usd?: number;
          created_at?: string;
          created_by?: string | null;
          credits?: number | null;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          input?: Json;
          item_id: string;
          kind?: string | null;
          model?: string | null;
          output?: Json;
          provider?: string | null;
          provider_job_id?: string | null;
          scene_id?: string | null;
          stage_id: string;
          started_at?: string | null;
          status?: string;
          tenant_id: string;
          tokens_in?: number;
          tokens_out?: number;
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          cost_usd?: number;
          created_at?: string;
          created_by?: string | null;
          credits?: number | null;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          input?: Json;
          item_id?: string;
          kind?: string | null;
          model?: string | null;
          output?: Json;
          provider?: string | null;
          provider_job_id?: string | null;
          scene_id?: string | null;
          stage_id?: string;
          started_at?: string | null;
          status?: string;
          tenant_id?: string;
          tokens_in?: number;
          tokens_out?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "marketing_runs_scene_id_fkey";
            columns: ["scene_id"];
            isOneToOne: false;
            referencedRelation: "marketing_video_scenes";
            referencedColumns: ["id"];
          },
        ];
      };
      marketing_stage_templates: {
        Row: {
          created_at: string;
          default_agent_id: string | null;
          default_approval_mode: string;
          default_instructions: string | null;
          default_target: Json;
          default_tools: Json;
          id: string;
          is_system: boolean;
          name: string;
          stage_type: string;
          tenant_id: string;
          track: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          default_agent_id?: string | null;
          default_approval_mode?: string;
          default_instructions?: string | null;
          default_target?: Json;
          default_tools?: Json;
          id?: string;
          is_system?: boolean;
          name: string;
          stage_type: string;
          tenant_id: string;
          track: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          default_agent_id?: string | null;
          default_approval_mode?: string;
          default_instructions?: string | null;
          default_target?: Json;
          default_tools?: Json;
          id?: string;
          is_system?: boolean;
          name?: string;
          stage_type?: string;
          tenant_id?: string;
          track?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      marketing_triggers: {
        Row: {
          client_id: string;
          created_at: string;
          event_type: string | null;
          id: string;
          is_active: boolean;
          last_run_at: string | null;
          name: string;
          next_run_at: string | null;
          pipeline_id: string;
          schedule_cron: string | null;
          schedule_dom: number | null;
          schedule_dow: number | null;
          schedule_hour: number | null;
          schedule_preset: string | null;
          template_payload: Json;
          tenant_id: string;
          trigger_type: string;
          updated_at: string;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          event_type?: string | null;
          id?: string;
          is_active?: boolean;
          last_run_at?: string | null;
          name: string;
          next_run_at?: string | null;
          pipeline_id: string;
          schedule_cron?: string | null;
          schedule_dom?: number | null;
          schedule_dow?: number | null;
          schedule_hour?: number | null;
          schedule_preset?: string | null;
          template_payload?: Json;
          tenant_id: string;
          trigger_type?: string;
          updated_at?: string;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          event_type?: string | null;
          id?: string;
          is_active?: boolean;
          last_run_at?: string | null;
          name?: string;
          next_run_at?: string | null;
          pipeline_id?: string;
          schedule_cron?: string | null;
          schedule_dom?: number | null;
          schedule_dow?: number | null;
          schedule_hour?: number | null;
          schedule_preset?: string | null;
          template_payload?: Json;
          tenant_id?: string;
          trigger_type?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      marketing_video_scenes: {
        Row: {
          clip_asset_id: string | null;
          clip_stale: boolean;
          created_at: string;
          created_by: string | null;
          duration_s: number;
          focal_x: number;
          id: string;
          item_id: string;
          locked: boolean;
          meta: Json;
          motion_prompt: string;
          overlay_text: string;
          position: number;
          shot: string;
          status: Database["public"]["Enums"]["marketing_video_scene_status"];
          still_asset_id: string | null;
          tenant_id: string;
          title: string;
          updated_at: string;
          visual_prompt: string;
          voice_asset_id: string | null;
          voiceover_text: string;
        };
        Insert: {
          clip_asset_id?: string | null;
          clip_stale?: boolean;
          created_at?: string;
          created_by?: string | null;
          duration_s?: number;
          focal_x?: number;
          id?: string;
          item_id: string;
          locked?: boolean;
          meta?: Json;
          motion_prompt?: string;
          overlay_text?: string;
          position: number;
          shot?: string;
          status?: Database["public"]["Enums"]["marketing_video_scene_status"];
          still_asset_id?: string | null;
          tenant_id: string;
          title?: string;
          updated_at?: string;
          visual_prompt?: string;
          voice_asset_id?: string | null;
          voiceover_text?: string;
        };
        Update: {
          clip_asset_id?: string | null;
          clip_stale?: boolean;
          created_at?: string;
          created_by?: string | null;
          duration_s?: number;
          focal_x?: number;
          id?: string;
          item_id?: string;
          locked?: boolean;
          meta?: Json;
          motion_prompt?: string;
          overlay_text?: string;
          position?: number;
          shot?: string;
          status?: Database["public"]["Enums"]["marketing_video_scene_status"];
          still_asset_id?: string | null;
          tenant_id?: string;
          title?: string;
          updated_at?: string;
          visual_prompt?: string;
          voice_asset_id?: string | null;
          voiceover_text?: string;
        };
        Relationships: [
          {
            foreignKeyName: "marketing_video_scenes_clip_asset_id_fkey";
            columns: ["clip_asset_id"];
            isOneToOne: false;
            referencedRelation: "marketing_assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "marketing_video_scenes_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "marketing_work_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "marketing_video_scenes_still_asset_id_fkey";
            columns: ["still_asset_id"];
            isOneToOne: false;
            referencedRelation: "marketing_assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "marketing_video_scenes_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "marketing_video_scenes_voice_asset_id_fkey";
            columns: ["voice_asset_id"];
            isOneToOne: false;
            referencedRelation: "marketing_assets";
            referencedColumns: ["id"];
          },
        ];
      };
      marketing_work_items: {
        Row: {
          client_id: string | null;
          created_at: string;
          created_by: string | null;
          current_stage_id: string | null;
          id: string;
          links: Json;
          payload: Json;
          pipeline_id: string | null;
          scheduled_date: string | null;
          status: Database["public"]["Enums"]["marketing_item_status"];
          target_channel: string | null;
          tenant_id: string;
          title: string | null;
          updated_at: string;
        };
        Insert: {
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          current_stage_id?: string | null;
          id?: string;
          links?: Json;
          payload?: Json;
          pipeline_id?: string | null;
          scheduled_date?: string | null;
          status?: Database["public"]["Enums"]["marketing_item_status"];
          target_channel?: string | null;
          tenant_id: string;
          title?: string | null;
          updated_at?: string;
        };
        Update: {
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          current_stage_id?: string | null;
          id?: string;
          links?: Json;
          payload?: Json;
          pipeline_id?: string | null;
          scheduled_date?: string | null;
          status?: Database["public"]["Enums"]["marketing_item_status"];
          target_channel?: string | null;
          tenant_id?: string;
          title?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "marketing_work_items_current_stage_id_fkey";
            columns: ["current_stage_id"];
            isOneToOne: false;
            referencedRelation: "marketing_pipeline_stages";
            referencedColumns: ["id"];
          },
        ];
      };
      maskyoo_manual_overrides: {
        Row: {
          answered_count: number | null;
          created_at: string;
          created_by: string | null;
          id: string;
          incoming_count: number | null;
          maskyoo_last9: string;
          note: string | null;
          period_days: number;
          tenant_id: string;
          unique_count: number | null;
          updated_at: string;
        };
        Insert: {
          answered_count?: number | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          incoming_count?: number | null;
          maskyoo_last9: string;
          note?: string | null;
          period_days?: number;
          tenant_id: string;
          unique_count?: number | null;
          updated_at?: string;
        };
        Update: {
          answered_count?: number | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          incoming_count?: number | null;
          maskyoo_last9?: string;
          note?: string | null;
          period_days?: number;
          tenant_id?: string;
          unique_count?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      maskyoo_numbers: {
        Row: {
          category: string | null;
          client_id: string | null;
          created_at: string;
          display_number: string;
          id: string;
          is_ignored: boolean;
          label: string | null;
          phone_last9: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          category?: string | null;
          client_id?: string | null;
          created_at?: string;
          display_number: string;
          id?: string;
          is_ignored?: boolean;
          label?: string | null;
          phone_last9: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          category?: string | null;
          client_id?: string | null;
          created_at?: string;
          display_number?: string;
          id?: string;
          is_ignored?: boolean;
          label?: string | null;
          phone_last9?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      maskyoo_settings: {
        Row: {
          api_token: string;
          base_url: string;
          click2call_service: string;
          created_at: string;
          default_user_phone: string | null;
          id: string;
          is_active: boolean;
          last_cdr_sync_at: string | null;
          tenant_id: string;
          updated_at: string;
          webhook_secret: string | null;
        };
        Insert: {
          api_token: string;
          base_url: string;
          click2call_service?: string;
          created_at?: string;
          default_user_phone?: string | null;
          id?: string;
          is_active?: boolean;
          last_cdr_sync_at?: string | null;
          tenant_id: string;
          updated_at?: string;
          webhook_secret?: string | null;
        };
        Update: {
          api_token?: string;
          base_url?: string;
          click2call_service?: string;
          created_at?: string;
          default_user_phone?: string | null;
          id?: string;
          is_active?: boolean;
          last_cdr_sync_at?: string | null;
          tenant_id?: string;
          updated_at?: string;
          webhook_secret?: string | null;
        };
        Relationships: [];
      };
      meeting_bot_sessions: {
        Row: {
          agency_id: string | null;
          calendar_event_id: string | null;
          campaigner_ids: string[] | null;
          client_id: string | null;
          created_at: string;
          created_by: string | null;
          ended_at: string | null;
          error: string | null;
          external_bot_id: string | null;
          id: string;
          joined_at: string | null;
          lead_id: string | null;
          meeting_topic: string | null;
          meeting_url: string;
          platform: string;
          provider: string;
          scheduled_start: string | null;
          status: string;
          status_detail: string | null;
          summary_scope: string;
          tenant_id: string;
          updated_at: string;
          zoom_recording_id: string | null;
        };
        Insert: {
          agency_id?: string | null;
          calendar_event_id?: string | null;
          campaigner_ids?: string[] | null;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          ended_at?: string | null;
          error?: string | null;
          external_bot_id?: string | null;
          id?: string;
          joined_at?: string | null;
          lead_id?: string | null;
          meeting_topic?: string | null;
          meeting_url: string;
          platform: string;
          provider?: string;
          scheduled_start?: string | null;
          status?: string;
          status_detail?: string | null;
          summary_scope?: string;
          tenant_id: string;
          updated_at?: string;
          zoom_recording_id?: string | null;
        };
        Update: {
          agency_id?: string | null;
          calendar_event_id?: string | null;
          campaigner_ids?: string[] | null;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          ended_at?: string | null;
          error?: string | null;
          external_bot_id?: string | null;
          id?: string;
          joined_at?: string | null;
          lead_id?: string | null;
          meeting_topic?: string | null;
          meeting_url?: string;
          platform?: string;
          provider?: string;
          scheduled_start?: string | null;
          status?: string;
          status_detail?: string | null;
          summary_scope?: string;
          tenant_id?: string;
          updated_at?: string;
          zoom_recording_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "meeting_bot_sessions_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meeting_bot_sessions_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meeting_bot_sessions_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meeting_bot_sessions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meeting_bot_sessions_zoom_recording_id_fkey";
            columns: ["zoom_recording_id"];
            isOneToOne: false;
            referencedRelation: "zoom_recordings";
            referencedColumns: ["id"];
          },
        ];
      };
      menu_items: {
        Row: {
          badge: string | null;
          category: string | null;
          created_at: string;
          custom_label: string | null;
          icon: string | null;
          id: string;
          is_visible: boolean;
          menu_key: string;
          original_label: string;
          parent_menu_key: string | null;
          route: string;
          sort_order: number;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          badge?: string | null;
          category?: string | null;
          created_at?: string;
          custom_label?: string | null;
          icon?: string | null;
          id?: string;
          is_visible?: boolean;
          menu_key: string;
          original_label: string;
          parent_menu_key?: string | null;
          route: string;
          sort_order?: number;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          badge?: string | null;
          category?: string | null;
          created_at?: string;
          custom_label?: string | null;
          icon?: string | null;
          id?: string;
          is_visible?: boolean;
          menu_key?: string;
          original_label?: string;
          parent_menu_key?: string | null;
          route?: string;
          sort_order?: number;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      message_templates: {
        Row: {
          archived_at: string | null;
          attachments: Json;
          body_html: string | null;
          body_text: string | null;
          channel: string;
          created_at: string;
          created_by: string | null;
          html_mode: boolean;
          id: string;
          media_url: string | null;
          name: string;
          subject: string | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          archived_at?: string | null;
          attachments?: Json;
          body_html?: string | null;
          body_text?: string | null;
          channel?: string;
          created_at?: string;
          created_by?: string | null;
          html_mode?: boolean;
          id?: string;
          media_url?: string | null;
          name: string;
          subject?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          attachments?: Json;
          body_html?: string | null;
          body_text?: string | null;
          channel?: string;
          created_at?: string;
          created_by?: string | null;
          html_mode?: boolean;
          id?: string;
          media_url?: string | null;
          name?: string;
          subject?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_templates_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      meta_whatsapp_tenant_credentials: {
        Row: {
          access_token: string;
          api_token_last_4: string | null;
          created_at: string;
          tenant_id: string;
          token_type: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          access_token: string;
          api_token_last_4?: string | null;
          created_at?: string;
          tenant_id: string;
          token_type?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          access_token?: string;
          api_token_last_4?: string | null;
          created_at?: string;
          tenant_id?: string;
          token_type?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "meta_whatsapp_tenant_credentials_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      meta_whatsapp_tokens: {
        Row: {
          access_token: string;
          created_at: string;
          integration_id: string;
          updated_at: string;
        };
        Insert: {
          access_token: string;
          created_at?: string;
          integration_id: string;
          updated_at?: string;
        };
        Update: {
          access_token?: string;
          created_at?: string;
          integration_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "meta_whatsapp_tokens_integration_id_fkey";
            columns: ["integration_id"];
            isOneToOne: true;
            referencedRelation: "tenant_integrations";
            referencedColumns: ["id"];
          },
        ];
      };
      one_time_incomes: {
        Row: {
          amount: number;
          client_id: string;
          created_at: string;
          created_by: string | null;
          expense_amount: number;
          id: string;
          is_paid: boolean;
          notes: string | null;
          paid_at: string | null;
          payment_month: string;
          product_name: string;
          supplier_id: string | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          amount?: number;
          client_id: string;
          created_at?: string;
          created_by?: string | null;
          expense_amount?: number;
          id?: string;
          is_paid?: boolean;
          notes?: string | null;
          paid_at?: string | null;
          payment_month: string;
          product_name: string;
          supplier_id?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          client_id?: string;
          created_at?: string;
          created_by?: string | null;
          expense_amount?: number;
          id?: string;
          is_paid?: boolean;
          notes?: string | null;
          paid_at?: string | null;
          payment_month?: string;
          product_name?: string;
          supplier_id?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "one_time_incomes_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "one_time_incomes_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "one_time_incomes_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_links: {
        Row: {
          amount: number;
          client_id: string;
          created_at: string | null;
          created_by: string | null;
          description: string | null;
          expires_at: string | null;
          id: string;
          paid_at: string | null;
          payment_url: string;
          send_email: boolean | null;
          status: string | null;
          sumit_payment_id: string | null;
          tenant_id: string;
        };
        Insert: {
          amount: number;
          client_id: string;
          created_at?: string | null;
          created_by?: string | null;
          description?: string | null;
          expires_at?: string | null;
          id?: string;
          paid_at?: string | null;
          payment_url: string;
          send_email?: boolean | null;
          status?: string | null;
          sumit_payment_id?: string | null;
          tenant_id: string;
        };
        Update: {
          amount?: number;
          client_id?: string;
          created_at?: string | null;
          created_by?: string | null;
          description?: string | null;
          expires_at?: string | null;
          id?: string;
          paid_at?: string | null;
          payment_url?: string;
          send_email?: boolean | null;
          status?: string | null;
          sumit_payment_id?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_links_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_links_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      pbn_service_commands: {
        Row: {
          allowed_resource_ids: Json;
          created_at: string;
          expires_at: string;
          id: string;
          scope: string;
          tenant_id: string;
          token_hash: string;
          used_at: string | null;
        };
        Insert: {
          allowed_resource_ids?: Json;
          created_at?: string;
          expires_at: string;
          id?: string;
          scope: string;
          tenant_id: string;
          token_hash: string;
          used_at?: string | null;
        };
        Update: {
          allowed_resource_ids?: Json;
          created_at?: string;
          expires_at?: string;
          id?: string;
          scope?: string;
          tenant_id?: string;
          token_hash?: string;
          used_at?: string | null;
        };
        Relationships: [];
      };
      pbx_settings: {
        Row: {
          config: Json;
          created_at: string;
          id: string;
          inbound_secret: string;
          is_active: boolean;
          outbound_auth_value: string | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          config?: Json;
          created_at?: string;
          id?: string;
          inbound_secret: string;
          is_active?: boolean;
          outbound_auth_value?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          config?: Json;
          created_at?: string;
          id?: string;
          inbound_secret?: string;
          is_active?: boolean;
          outbound_auth_value?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pbx_settings_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      processed_events: {
        Row: {
          event_key: string;
          id: string;
          processed_at: string;
          tenant_id: string;
        };
        Insert: {
          event_key: string;
          id?: string;
          processed_at?: string;
          tenant_id: string;
        };
        Update: {
          event_key?: string;
          id?: string;
          processed_at?: string;
          tenant_id?: string;
        };
        Relationships: [];
      };
      processed_webhook_messages: {
        Row: {
          external_message_id: string;
          processed_at: string;
          provider: string;
          tenant_id: string;
        };
        Insert: {
          external_message_id: string;
          processed_at?: string;
          provider: string;
          tenant_id: string;
        };
        Update: {
          external_message_id?: string;
          processed_at?: string;
          provider?: string;
          tenant_id?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          active: boolean;
          agency_id: string | null;
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          price: number;
          tenant_id: string | null;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          agency_id?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          price?: number;
          tenant_id?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          agency_id?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          price?: number;
          tenant_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          calendar_iframe_code: string | null;
          campaigner_id: string | null;
          created_at: string;
          email: string;
          full_name: string | null;
          id: string;
          leads_default_view: string | null;
          notification_group_link: string | null;
          phone: string | null;
          sales_person_id: string | null;
          status: string;
          ui_mode: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          calendar_iframe_code?: string | null;
          campaigner_id?: string | null;
          created_at?: string;
          email: string;
          full_name?: string | null;
          id: string;
          leads_default_view?: string | null;
          notification_group_link?: string | null;
          phone?: string | null;
          sales_person_id?: string | null;
          status?: string;
          ui_mode?: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          calendar_iframe_code?: string | null;
          campaigner_id?: string | null;
          created_at?: string;
          email?: string;
          full_name?: string | null;
          id?: string;
          leads_default_view?: string | null;
          notification_group_link?: string | null;
          phone?: string | null;
          sales_person_id?: string | null;
          status?: string;
          ui_mode?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_campaigner_id_fkey";
            columns: ["campaigner_id"];
            isOneToOne: false;
            referencedRelation: "campaigners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profiles_sales_person_id_fkey";
            columns: ["sales_person_id"];
            isOneToOne: false;
            referencedRelation: "sales_people";
            referencedColumns: ["id"];
          },
        ];
      };
      publishing_articles: {
        Row: {
          anchor_text: string | null;
          category: string | null;
          client_id: string | null;
          content: Json;
          created_at: string;
          created_by: string | null;
          customer_name: string | null;
          excerpt: string | null;
          faq: Json;
          hero_image_url: string | null;
          id: string;
          image_alt: string | null;
          import_id: string | null;
          infographic: Json;
          inline_image_url: string | null;
          internal_links: Json;
          live_url: string | null;
          primary_keyword: string;
          proposed_topic: string | null;
          published_at: string | null;
          row_fingerprint: string | null;
          site_id: string | null;
          slug: string | null;
          source_month: string | null;
          source_row: number | null;
          source_sheet: string | null;
          sources: Json;
          status: string;
          target_url: string | null;
          tenant_id: string;
          title: string | null;
          updated_at: string;
        };
        Insert: {
          anchor_text?: string | null;
          category?: string | null;
          client_id?: string | null;
          content?: Json;
          created_at?: string;
          created_by?: string | null;
          customer_name?: string | null;
          excerpt?: string | null;
          faq?: Json;
          hero_image_url?: string | null;
          id?: string;
          image_alt?: string | null;
          import_id?: string | null;
          infographic?: Json;
          inline_image_url?: string | null;
          internal_links?: Json;
          live_url?: string | null;
          primary_keyword: string;
          proposed_topic?: string | null;
          published_at?: string | null;
          row_fingerprint?: string | null;
          site_id?: string | null;
          slug?: string | null;
          source_month?: string | null;
          source_row?: number | null;
          source_sheet?: string | null;
          sources?: Json;
          status?: string;
          target_url?: string | null;
          tenant_id: string;
          title?: string | null;
          updated_at?: string;
        };
        Update: {
          anchor_text?: string | null;
          category?: string | null;
          client_id?: string | null;
          content?: Json;
          created_at?: string;
          created_by?: string | null;
          customer_name?: string | null;
          excerpt?: string | null;
          faq?: Json;
          hero_image_url?: string | null;
          id?: string;
          image_alt?: string | null;
          import_id?: string | null;
          infographic?: Json;
          inline_image_url?: string | null;
          internal_links?: Json;
          live_url?: string | null;
          primary_keyword?: string;
          proposed_topic?: string | null;
          published_at?: string | null;
          row_fingerprint?: string | null;
          site_id?: string | null;
          slug?: string | null;
          source_month?: string | null;
          source_row?: number | null;
          source_sheet?: string | null;
          sources?: Json;
          status?: string;
          target_url?: string | null;
          tenant_id?: string;
          title?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "publishing_articles_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "publishing_articles_import_id_fkey";
            columns: ["import_id"];
            isOneToOne: false;
            referencedRelation: "publishing_imports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "publishing_articles_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "publishing_sites";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "publishing_articles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      publishing_imports: {
        Row: {
          created_at: string;
          created_by: string | null;
          duplicate_count: number;
          error_message: string | null;
          file_name: string;
          id: string;
          imported_count: number;
          row_count: number;
          sheet_count: number;
          status: string;
          tenant_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          duplicate_count?: number;
          error_message?: string | null;
          file_name: string;
          id?: string;
          imported_count?: number;
          row_count?: number;
          sheet_count?: number;
          status?: string;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          duplicate_count?: number;
          error_message?: string | null;
          file_name?: string;
          id?: string;
          imported_count?: number;
          row_count?: number;
          sheet_count?: number;
          status?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "publishing_imports_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      publishing_sites: {
        Row: {
          base_url: string | null;
          categories: Json;
          client_id: string | null;
          connection_id: string | null;
          created_at: string;
          created_by: string | null;
          destination_type: string;
          id: string;
          is_hidden: boolean;
          name: string;
          site_key: string;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          base_url?: string | null;
          categories?: Json;
          client_id?: string | null;
          connection_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          destination_type?: string;
          id?: string;
          is_hidden?: boolean;
          name: string;
          site_key: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          base_url?: string | null;
          categories?: Json;
          client_id?: string | null;
          connection_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          destination_type?: string;
          id?: string;
          is_hidden?: boolean;
          name?: string;
          site_key?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "publishing_sites_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "publishing_sites_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      pulse_instant_alert_log: {
        Row: {
          campaign_key: string | null;
          client_id: string | null;
          evidence: Json;
          fingerprint: string | null;
          id: string;
          message: string;
          recipient_phone: string | null;
          rule_type: string;
          sent_at: string;
          severity_score: number | null;
          tenant_id: string;
        };
        Insert: {
          campaign_key?: string | null;
          client_id?: string | null;
          evidence?: Json;
          fingerprint?: string | null;
          id?: string;
          message: string;
          recipient_phone?: string | null;
          rule_type: string;
          sent_at?: string;
          severity_score?: number | null;
          tenant_id: string;
        };
        Update: {
          campaign_key?: string | null;
          client_id?: string | null;
          evidence?: Json;
          fingerprint?: string | null;
          id?: string;
          message?: string;
          recipient_phone?: string | null;
          rule_type?: string;
          sent_at?: string;
          severity_score?: number | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pulse_instant_alert_log_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pulse_instant_alert_log_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      rank_tracking_alert_logs: {
        Row: {
          alert_id: string;
          id: string;
          keyword_id: string | null;
          message: string;
          new_position: number | null;
          old_position: number | null;
          triggered_at: string;
        };
        Insert: {
          alert_id: string;
          id?: string;
          keyword_id?: string | null;
          message: string;
          new_position?: number | null;
          old_position?: number | null;
          triggered_at?: string;
        };
        Update: {
          alert_id?: string;
          id?: string;
          keyword_id?: string | null;
          message?: string;
          new_position?: number | null;
          old_position?: number | null;
          triggered_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rank_tracking_alert_logs_alert_id_fkey";
            columns: ["alert_id"];
            isOneToOne: false;
            referencedRelation: "rank_tracking_alerts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rank_tracking_alert_logs_keyword_id_fkey";
            columns: ["keyword_id"];
            isOneToOne: false;
            referencedRelation: "rank_tracking_keywords";
            referencedColumns: ["id"];
          },
        ];
      };
      rank_tracking_alerts: {
        Row: {
          alert_type: string;
          created_at: string;
          id: string;
          is_active: boolean;
          last_triggered_at: string | null;
          notify_email: boolean;
          notify_whatsapp: boolean;
          project_id: string;
          threshold: number;
        };
        Insert: {
          alert_type: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          last_triggered_at?: string | null;
          notify_email?: boolean;
          notify_whatsapp?: boolean;
          project_id: string;
          threshold?: number;
        };
        Update: {
          alert_type?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          last_triggered_at?: string | null;
          notify_email?: boolean;
          notify_whatsapp?: boolean;
          project_id?: string;
          threshold?: number;
        };
        Relationships: [
          {
            foreignKeyName: "rank_tracking_alerts_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "rank_tracking_projects";
            referencedColumns: ["id"];
          },
        ];
      };
      rank_tracking_competitors: {
        Row: {
          created_at: string;
          domain: string;
          id: string;
          name: string | null;
          project_id: string;
        };
        Insert: {
          created_at?: string;
          domain: string;
          id?: string;
          name?: string | null;
          project_id: string;
        };
        Update: {
          created_at?: string;
          domain?: string;
          id?: string;
          name?: string | null;
          project_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rank_tracking_competitors_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "rank_tracking_projects";
            referencedColumns: ["id"];
          },
        ];
      };
      rank_tracking_history: {
        Row: {
          checked_at: string;
          competitors_data: Json | null;
          id: string;
          keyword_id: string;
          position: number | null;
          serp_features: Json | null;
          url_found: string | null;
        };
        Insert: {
          checked_at?: string;
          competitors_data?: Json | null;
          id?: string;
          keyword_id: string;
          position?: number | null;
          serp_features?: Json | null;
          url_found?: string | null;
        };
        Update: {
          checked_at?: string;
          competitors_data?: Json | null;
          id?: string;
          keyword_id?: string;
          position?: number | null;
          serp_features?: Json | null;
          url_found?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "rank_tracking_history_keyword_id_fkey";
            columns: ["keyword_id"];
            isOneToOne: false;
            referencedRelation: "rank_tracking_keywords";
            referencedColumns: ["id"];
          },
        ];
      };
      rank_tracking_keywords: {
        Row: {
          best_position: number | null;
          created_at: string;
          current_position: number | null;
          found_url: string | null;
          id: string;
          is_active: boolean;
          keyword: string;
          last_checked_at: string | null;
          position_change: number | null;
          previous_position: number | null;
          project_id: string;
          search_volume: number | null;
          target_url: string | null;
          updated_at: string;
          worst_position: number | null;
        };
        Insert: {
          best_position?: number | null;
          created_at?: string;
          current_position?: number | null;
          found_url?: string | null;
          id?: string;
          is_active?: boolean;
          keyword: string;
          last_checked_at?: string | null;
          position_change?: number | null;
          previous_position?: number | null;
          project_id: string;
          search_volume?: number | null;
          target_url?: string | null;
          updated_at?: string;
          worst_position?: number | null;
        };
        Update: {
          best_position?: number | null;
          created_at?: string;
          current_position?: number | null;
          found_url?: string | null;
          id?: string;
          is_active?: boolean;
          keyword?: string;
          last_checked_at?: string | null;
          position_change?: number | null;
          previous_position?: number | null;
          project_id?: string;
          search_volume?: number | null;
          target_url?: string | null;
          updated_at?: string;
          worst_position?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "rank_tracking_keywords_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "rank_tracking_projects";
            referencedColumns: ["id"];
          },
        ];
      };
      rank_tracking_projects: {
        Row: {
          agency_id: string | null;
          check_frequency: string;
          client_id: string | null;
          country: string;
          created_at: string;
          device: string;
          domain: string;
          id: string;
          is_active: boolean;
          language: string;
          last_checked_at: string | null;
          name: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          agency_id?: string | null;
          check_frequency?: string;
          client_id?: string | null;
          country?: string;
          created_at?: string;
          device?: string;
          domain: string;
          id?: string;
          is_active?: boolean;
          language?: string;
          last_checked_at?: string | null;
          name: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          agency_id?: string | null;
          check_frequency?: string;
          client_id?: string | null;
          country?: string;
          created_at?: string;
          device?: string;
          domain?: string;
          id?: string;
          is_active?: boolean;
          language?: string;
          last_checked_at?: string | null;
          name?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rank_tracking_projects_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rank_tracking_projects_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rank_tracking_projects_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      recording_folders: {
        Row: {
          created_at: string;
          icon: string | null;
          id: string;
          name: string;
          position: number;
          tenant_id: string;
        };
        Insert: {
          created_at?: string;
          icon?: string | null;
          id?: string;
          name: string;
          position?: number;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          icon?: string | null;
          id?: string;
          name?: string;
          position?: number;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recording_folders_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      report_alerts: {
        Row: {
          comparison_type: string;
          created_at: string | null;
          created_by: string | null;
          id: string;
          is_active: boolean | null;
          is_percentage: boolean | null;
          last_triggered_at: string | null;
          last_triggered_data: Json | null;
          metric: string;
          name: string;
          operator: string;
          table_id: string;
          tenant_id: string;
          threshold: number;
          updated_at: string | null;
        };
        Insert: {
          comparison_type: string;
          created_at?: string | null;
          created_by?: string | null;
          id?: string;
          is_active?: boolean | null;
          is_percentage?: boolean | null;
          last_triggered_at?: string | null;
          last_triggered_data?: Json | null;
          metric: string;
          name: string;
          operator: string;
          table_id: string;
          tenant_id: string;
          threshold: number;
          updated_at?: string | null;
        };
        Update: {
          comparison_type?: string;
          created_at?: string | null;
          created_by?: string | null;
          id?: string;
          is_active?: boolean | null;
          is_percentage?: boolean | null;
          last_triggered_at?: string | null;
          last_triggered_data?: Json | null;
          metric?: string;
          name?: string;
          operator?: string;
          table_id?: string;
          tenant_id?: string;
          threshold?: number;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "report_alerts_table_id_fkey";
            columns: ["table_id"];
            isOneToOne: false;
            referencedRelation: "crm_tables";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "report_alerts_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      report_deliveries: {
        Row: {
          channels: string[];
          client_id: string;
          created_at: string;
          details: Json;
          id: string;
          schedule_id: string | null;
          status: string;
          target_id: string;
          target_type: string;
          tenant_id: string;
        };
        Insert: {
          channels?: string[];
          client_id: string;
          created_at?: string;
          details?: Json;
          id?: string;
          schedule_id?: string | null;
          status: string;
          target_id: string;
          target_type: string;
          tenant_id: string;
        };
        Update: {
          channels?: string[];
          client_id?: string;
          created_at?: string;
          details?: Json;
          id?: string;
          schedule_id?: string | null;
          status?: string;
          target_id?: string;
          target_type?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "report_deliveries_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "report_deliveries_schedule_id_fkey";
            columns: ["schedule_id"];
            isOneToOne: false;
            referencedRelation: "report_schedules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "report_deliveries_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      report_schedules: {
        Row: {
          channels: string[];
          client_id: string;
          created_at: string;
          created_by: string | null;
          dashboard_id: string | null;
          day_of_month: number | null;
          day_of_week: number | null;
          email_recipients: string[];
          email_subject: string | null;
          enabled: boolean;
          frequency: string;
          id: string;
          last_run_at: string | null;
          locked_at: string | null;
          message: string | null;
          next_run_at: string | null;
          phone: string | null;
          send_time: string;
          table_id: string | null;
          target_type: string;
          tenant_id: string;
          timezone: string;
          updated_at: string;
          whatsapp_group_id: string | null;
        };
        Insert: {
          channels?: string[];
          client_id: string;
          created_at?: string;
          created_by?: string | null;
          dashboard_id?: string | null;
          day_of_month?: number | null;
          day_of_week?: number | null;
          email_recipients?: string[];
          email_subject?: string | null;
          enabled?: boolean;
          frequency?: string;
          id?: string;
          last_run_at?: string | null;
          locked_at?: string | null;
          message?: string | null;
          next_run_at?: string | null;
          phone?: string | null;
          send_time?: string;
          table_id?: string | null;
          target_type: string;
          tenant_id: string;
          timezone?: string;
          updated_at?: string;
          whatsapp_group_id?: string | null;
        };
        Update: {
          channels?: string[];
          client_id?: string;
          created_at?: string;
          created_by?: string | null;
          dashboard_id?: string | null;
          day_of_month?: number | null;
          day_of_week?: number | null;
          email_recipients?: string[];
          email_subject?: string | null;
          enabled?: boolean;
          frequency?: string;
          id?: string;
          last_run_at?: string | null;
          locked_at?: string | null;
          message?: string | null;
          next_run_at?: string | null;
          phone?: string | null;
          send_time?: string;
          table_id?: string | null;
          target_type?: string;
          tenant_id?: string;
          timezone?: string;
          updated_at?: string;
          whatsapp_group_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "report_schedules_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "report_schedules_dashboard_id_fkey";
            columns: ["dashboard_id"];
            isOneToOne: false;
            referencedRelation: "crm_dashboards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "report_schedules_table_id_fkey";
            columns: ["table_id"];
            isOneToOne: false;
            referencedRelation: "crm_tables";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "report_schedules_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "report_schedules_whatsapp_group_id_fkey";
            columns: ["whatsapp_group_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_groups";
            referencedColumns: ["id"];
          },
        ];
      };
      sales_people: {
        Row: {
          active: boolean;
          agency_id: string;
          created_at: string;
          email: string | null;
          folder_link: string | null;
          full_name: string;
          id: string;
          notes: string | null;
          phone: string | null;
          tenant_id: string | null;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          agency_id: string;
          created_at?: string;
          email?: string | null;
          folder_link?: string | null;
          full_name: string;
          id?: string;
          notes?: string | null;
          phone?: string | null;
          tenant_id?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          agency_id?: string;
          created_at?: string;
          email?: string | null;
          folder_link?: string | null;
          full_name?: string;
          id?: string;
          notes?: string | null;
          phone?: string | null;
          tenant_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sales_people_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_people_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      sales_person_agencies: {
        Row: {
          agency_id: string;
          created_at: string;
          id: string;
          sales_person_id: string;
        };
        Insert: {
          agency_id: string;
          created_at?: string;
          id?: string;
          sales_person_id: string;
        };
        Update: {
          agency_id?: string;
          created_at?: string;
          id?: string;
          sales_person_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sales_person_agencies_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_person_agencies_sales_person_id_fkey";
            columns: ["sales_person_id"];
            isOneToOne: false;
            referencedRelation: "sales_people";
            referencedColumns: ["id"];
          },
        ];
      };
      seo_call_snapshots: {
        Row: {
          category: string;
          client_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          incoming_count: number;
          is_manual: boolean;
          note: string | null;
          period_end: string;
          period_start: string;
          synced_at: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          category: string;
          client_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          incoming_count?: number;
          is_manual?: boolean;
          note?: string | null;
          period_end: string;
          period_start: string;
          synced_at?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          category?: string;
          client_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          incoming_count?: number;
          is_manual?: boolean;
          note?: string | null;
          period_end?: string;
          period_start?: string;
          synced_at?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      seo_geo_calendar_entries: {
        Row: {
          angle: string | null;
          approval_status: string;
          approved_at: string | null;
          approved_by: string | null;
          approved_by_carmen: boolean;
          client_id: string;
          cluster: string | null;
          content_html: string | null;
          content_type: string | null;
          created_at: string;
          excerpt: string | null;
          generation_status: string;
          geo_questions: Json;
          id: string;
          intent: string | null;
          live_url: string | null;
          meta_description: string | null;
          plan_index: number | null;
          primary_keyword: string | null;
          publish_error: string | null;
          published_at: string | null;
          scheduled_date: string;
          tenant_id: string;
          title: string;
          title_draft: string | null;
          updated_at: string;
          wordpress_post_id: string | null;
          work_item_id: string;
        };
        Insert: {
          angle?: string | null;
          approval_status?: string;
          approved_at?: string | null;
          approved_by?: string | null;
          approved_by_carmen?: boolean;
          client_id: string;
          cluster?: string | null;
          content_html?: string | null;
          content_type?: string | null;
          created_at?: string;
          excerpt?: string | null;
          generation_status?: string;
          geo_questions?: Json;
          id?: string;
          intent?: string | null;
          live_url?: string | null;
          meta_description?: string | null;
          plan_index?: number | null;
          primary_keyword?: string | null;
          publish_error?: string | null;
          published_at?: string | null;
          scheduled_date: string;
          tenant_id: string;
          title: string;
          title_draft?: string | null;
          updated_at?: string;
          wordpress_post_id?: string | null;
          work_item_id: string;
        };
        Update: {
          angle?: string | null;
          approval_status?: string;
          approved_at?: string | null;
          approved_by?: string | null;
          approved_by_carmen?: boolean;
          client_id?: string;
          cluster?: string | null;
          content_html?: string | null;
          content_type?: string | null;
          created_at?: string;
          excerpt?: string | null;
          generation_status?: string;
          geo_questions?: Json;
          id?: string;
          intent?: string | null;
          live_url?: string | null;
          meta_description?: string | null;
          plan_index?: number | null;
          primary_keyword?: string | null;
          publish_error?: string | null;
          published_at?: string | null;
          scheduled_date?: string;
          tenant_id?: string;
          title?: string;
          title_draft?: string | null;
          updated_at?: string;
          wordpress_post_id?: string | null;
          work_item_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "seo_geo_calendar_entries_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seo_geo_calendar_entries_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seo_geo_calendar_entries_work_item_id_fkey";
            columns: ["work_item_id"];
            isOneToOne: false;
            referencedRelation: "marketing_work_items";
            referencedColumns: ["id"];
          },
        ];
      };
      seo_geo_keywords: {
        Row: {
          client_id: string;
          created_at: string;
          evidence: string | null;
          id: string;
          intent: string | null;
          keyword: string;
          metadata: Json;
          priority: string | null;
          promoted: boolean;
          sort_order: number;
          source: string;
          tenant_id: string;
          updated_at: string;
          work_item_id: string;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          evidence?: string | null;
          id?: string;
          intent?: string | null;
          keyword: string;
          metadata?: Json;
          priority?: string | null;
          promoted?: boolean;
          sort_order?: number;
          source?: string;
          tenant_id: string;
          updated_at?: string;
          work_item_id: string;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          evidence?: string | null;
          id?: string;
          intent?: string | null;
          keyword?: string;
          metadata?: Json;
          priority?: string | null;
          promoted?: boolean;
          sort_order?: number;
          source?: string;
          tenant_id?: string;
          updated_at?: string;
          work_item_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "seo_geo_keywords_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seo_geo_keywords_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seo_geo_keywords_work_item_id_fkey";
            columns: ["work_item_id"];
            isOneToOne: false;
            referencedRelation: "marketing_work_items";
            referencedColumns: ["id"];
          },
        ];
      };
      seo_geo_programs: {
        Row: {
          auto_approve: boolean;
          client_id: string;
          created_at: string;
          horizon_months: number;
          id: string;
          tenant_id: string;
          updated_at: string;
          wordpress_site_id: string | null;
          work_item_id: string;
        };
        Insert: {
          auto_approve?: boolean;
          client_id: string;
          created_at?: string;
          horizon_months?: number;
          id?: string;
          tenant_id: string;
          updated_at?: string;
          wordpress_site_id?: string | null;
          work_item_id: string;
        };
        Update: {
          auto_approve?: boolean;
          client_id?: string;
          created_at?: string;
          horizon_months?: number;
          id?: string;
          tenant_id?: string;
          updated_at?: string;
          wordpress_site_id?: string | null;
          work_item_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "seo_geo_programs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seo_geo_programs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seo_geo_programs_wordpress_site_id_fkey";
            columns: ["wordpress_site_id"];
            isOneToOne: false;
            referencedRelation: "social_media_wordpress_sites";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seo_geo_programs_work_item_id_fkey";
            columns: ["work_item_id"];
            isOneToOne: true;
            referencedRelation: "marketing_work_items";
            referencedColumns: ["id"];
          },
        ];
      };
      seo_monthly_shares: {
        Row: {
          client_id: string;
          created_at: string;
          created_by: string;
          id: string;
          is_active: boolean;
          month: string;
          share_token: string;
          snapshot: Json;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          created_by: string;
          id?: string;
          is_active?: boolean;
          month: string;
          share_token?: string;
          snapshot?: Json;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          is_active?: boolean;
          month?: string;
          share_token?: string;
          snapshot?: Json;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "seo_monthly_shares_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seo_monthly_shares_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      seo_monthly_updates: {
        Row: {
          client_id: string;
          created_at: string;
          id: string;
          month: string;
          notes: string | null;
          status: Database["public"]["Enums"]["seo_monthly_status"];
          tenant_id: string;
          updated_by: string | null;
          work: Json;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          id?: string;
          month: string;
          notes?: string | null;
          status: Database["public"]["Enums"]["seo_monthly_status"];
          tenant_id: string;
          updated_by?: string | null;
          work?: Json;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          id?: string;
          month?: string;
          notes?: string | null;
          status?: Database["public"]["Enums"]["seo_monthly_status"];
          tenant_id?: string;
          updated_by?: string | null;
          work?: Json;
        };
        Relationships: [];
      };
      seo_share_response_cache: {
        Row: {
          created_at: string;
          expires_at: string;
          payload: Json;
          share_token: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          expires_at: string;
          payload: Json;
          share_token: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          payload?: Json;
          share_token?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      service_health_checks: {
        Row: {
          checked_at: string;
          detail: string | null;
          id: string;
          latency_ms: number | null;
          service: string;
          status: string;
          tenant_id: string | null;
        };
        Insert: {
          checked_at?: string;
          detail?: string | null;
          id?: string;
          latency_ms?: number | null;
          service: string;
          status: string;
          tenant_id?: string | null;
        };
        Update: {
          checked_at?: string;
          detail?: string | null;
          id?: string;
          latency_ms?: number | null;
          service?: string;
          status?: string;
          tenant_id?: string | null;
        };
        Relationships: [];
      };
      signature_documents: {
        Row: {
          business_stamp_company_id: string | null;
          business_stamp_name: string | null;
          client_id: string | null;
          completed_at: string | null;
          content: string | null;
          created_at: string | null;
          created_by: string;
          document_fields: Json;
          document_type: string;
          file_url: string | null;
          id: string;
          is_template: boolean;
          lead_id: string | null;
          saved_to_entity_at: string | null;
          signed_file_url: string | null;
          status: string;
          template_name: string | null;
          tenant_id: string;
          title: string;
          updated_at: string | null;
        };
        Insert: {
          business_stamp_company_id?: string | null;
          business_stamp_name?: string | null;
          client_id?: string | null;
          completed_at?: string | null;
          content?: string | null;
          created_at?: string | null;
          created_by: string;
          document_fields?: Json;
          document_type?: string;
          file_url?: string | null;
          id?: string;
          is_template?: boolean;
          lead_id?: string | null;
          saved_to_entity_at?: string | null;
          signed_file_url?: string | null;
          status?: string;
          template_name?: string | null;
          tenant_id: string;
          title: string;
          updated_at?: string | null;
        };
        Update: {
          business_stamp_company_id?: string | null;
          business_stamp_name?: string | null;
          client_id?: string | null;
          completed_at?: string | null;
          content?: string | null;
          created_at?: string | null;
          created_by?: string;
          document_fields?: Json;
          document_type?: string;
          file_url?: string | null;
          id?: string;
          is_template?: boolean;
          lead_id?: string | null;
          saved_to_entity_at?: string | null;
          signed_file_url?: string | null;
          status?: string;
          template_name?: string | null;
          tenant_id?: string;
          title?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "signature_documents_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "signature_documents_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "signature_documents_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      signature_events: {
        Row: {
          created_at: string;
          document_id: string;
          event_type: string;
          id: string;
          ip_address: string | null;
          metadata: Json | null;
          recipient_id: string | null;
          tenant_id: string;
        };
        Insert: {
          created_at?: string;
          document_id: string;
          event_type: string;
          id?: string;
          ip_address?: string | null;
          metadata?: Json | null;
          recipient_id?: string | null;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          document_id?: string;
          event_type?: string;
          id?: string;
          ip_address?: string | null;
          metadata?: Json | null;
          recipient_id?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "signature_events_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "signature_documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "signature_events_recipient_id_fkey";
            columns: ["recipient_id"];
            isOneToOne: false;
            referencedRelation: "signature_recipients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "signature_events_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      signature_recipients: {
        Row: {
          created_at: string | null;
          document_id: string;
          email: string;
          field_values: Json;
          id: string;
          ip_address: string | null;
          name: string;
          role: string | null;
          sign_order: number | null;
          sign_token: string | null;
          signature_data: string | null;
          signature_position: Json | null;
          signed_at: string | null;
          status: string;
          tenant_id: string;
          viewed_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          document_id: string;
          email: string;
          field_values?: Json;
          id?: string;
          ip_address?: string | null;
          name: string;
          role?: string | null;
          sign_order?: number | null;
          sign_token?: string | null;
          signature_data?: string | null;
          signature_position?: Json | null;
          signed_at?: string | null;
          status?: string;
          tenant_id: string;
          viewed_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          document_id?: string;
          email?: string;
          field_values?: Json;
          id?: string;
          ip_address?: string | null;
          name?: string;
          role?: string | null;
          sign_order?: number | null;
          sign_token?: string | null;
          signature_data?: string | null;
          signature_position?: Json | null;
          signed_at?: string | null;
          status?: string;
          tenant_id?: string;
          viewed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "signature_recipients_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "signature_documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "signature_recipients_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      site_events: {
        Row: {
          event_category: string | null;
          event_data: Json | null;
          event_label: string | null;
          event_name: string;
          event_value: number | null;
          id: string;
          occurred_at: string;
          page_url: string | null;
          session_id: string;
          tenant_id: string;
          tracking_config_id: string;
          visitor_id: string;
        };
        Insert: {
          event_category?: string | null;
          event_data?: Json | null;
          event_label?: string | null;
          event_name: string;
          event_value?: number | null;
          id?: string;
          occurred_at?: string;
          page_url?: string | null;
          session_id: string;
          tenant_id: string;
          tracking_config_id: string;
          visitor_id: string;
        };
        Update: {
          event_category?: string | null;
          event_data?: Json | null;
          event_label?: string | null;
          event_name?: string;
          event_value?: number | null;
          id?: string;
          occurred_at?: string;
          page_url?: string | null;
          session_id?: string;
          tenant_id?: string;
          tracking_config_id?: string;
          visitor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "site_events_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "site_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "site_events_tracking_config_id_fkey";
            columns: ["tracking_config_id"];
            isOneToOne: false;
            referencedRelation: "site_tracking_configs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "site_events_visitor_id_fkey";
            columns: ["visitor_id"];
            isOneToOne: false;
            referencedRelation: "site_visitors";
            referencedColumns: ["id"];
          },
        ];
      };
      site_pageviews: {
        Row: {
          id: string;
          left_at: string | null;
          page_path: string | null;
          page_title: string | null;
          page_url: string;
          scroll_depth: number | null;
          session_id: string;
          tenant_id: string;
          time_on_page: number | null;
          tracking_config_id: string;
          viewed_at: string;
          visitor_id: string;
        };
        Insert: {
          id?: string;
          left_at?: string | null;
          page_path?: string | null;
          page_title?: string | null;
          page_url: string;
          scroll_depth?: number | null;
          session_id: string;
          tenant_id: string;
          time_on_page?: number | null;
          tracking_config_id: string;
          viewed_at?: string;
          visitor_id: string;
        };
        Update: {
          id?: string;
          left_at?: string | null;
          page_path?: string | null;
          page_title?: string | null;
          page_url?: string;
          scroll_depth?: number | null;
          session_id?: string;
          tenant_id?: string;
          time_on_page?: number | null;
          tracking_config_id?: string;
          viewed_at?: string;
          visitor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "site_pageviews_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "site_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "site_pageviews_tracking_config_id_fkey";
            columns: ["tracking_config_id"];
            isOneToOne: false;
            referencedRelation: "site_tracking_configs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "site_pageviews_visitor_id_fkey";
            columns: ["visitor_id"];
            isOneToOne: false;
            referencedRelation: "site_visitors";
            referencedColumns: ["id"];
          },
        ];
      };
      site_sessions: {
        Row: {
          browser: string | null;
          city: string | null;
          country: string | null;
          created_at: string;
          device_type: string | null;
          duration_seconds: number | null;
          ended_at: string | null;
          exit_page: string | null;
          id: string;
          is_bounce: boolean | null;
          landing_page: string | null;
          os: string | null;
          page_count: number | null;
          referrer: string | null;
          screen_resolution: string | null;
          started_at: string;
          tenant_id: string;
          tracking_config_id: string;
          utm_campaign: string | null;
          utm_content: string | null;
          utm_medium: string | null;
          utm_source: string | null;
          utm_term: string | null;
          visitor_id: string;
        };
        Insert: {
          browser?: string | null;
          city?: string | null;
          country?: string | null;
          created_at?: string;
          device_type?: string | null;
          duration_seconds?: number | null;
          ended_at?: string | null;
          exit_page?: string | null;
          id?: string;
          is_bounce?: boolean | null;
          landing_page?: string | null;
          os?: string | null;
          page_count?: number | null;
          referrer?: string | null;
          screen_resolution?: string | null;
          started_at?: string;
          tenant_id: string;
          tracking_config_id: string;
          utm_campaign?: string | null;
          utm_content?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
          utm_term?: string | null;
          visitor_id: string;
        };
        Update: {
          browser?: string | null;
          city?: string | null;
          country?: string | null;
          created_at?: string;
          device_type?: string | null;
          duration_seconds?: number | null;
          ended_at?: string | null;
          exit_page?: string | null;
          id?: string;
          is_bounce?: boolean | null;
          landing_page?: string | null;
          os?: string | null;
          page_count?: number | null;
          referrer?: string | null;
          screen_resolution?: string | null;
          started_at?: string;
          tenant_id?: string;
          tracking_config_id?: string;
          utm_campaign?: string | null;
          utm_content?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
          utm_term?: string | null;
          visitor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "site_sessions_tracking_config_id_fkey";
            columns: ["tracking_config_id"];
            isOneToOne: false;
            referencedRelation: "site_tracking_configs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "site_sessions_visitor_id_fkey";
            columns: ["visitor_id"];
            isOneToOne: false;
            referencedRelation: "site_visitors";
            referencedColumns: ["id"];
          },
        ];
      };
      site_tracking_configs: {
        Row: {
          client_id: string | null;
          created_at: string;
          id: string;
          is_active: boolean | null;
          settings: Json | null;
          tenant_id: string;
          tracking_id: string | null;
          updated_at: string;
          website_domain: string | null;
        };
        Insert: {
          client_id?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean | null;
          settings?: Json | null;
          tenant_id: string;
          tracking_id?: string | null;
          updated_at?: string;
          website_domain?: string | null;
        };
        Update: {
          client_id?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean | null;
          settings?: Json | null;
          tenant_id?: string;
          tracking_id?: string | null;
          updated_at?: string;
          website_domain?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "site_tracking_configs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      site_visitors: {
        Row: {
          client_id: string | null;
          client_id_ref: string | null;
          created_at: string;
          first_utm: Json | null;
          first_visit: string;
          id: string;
          last_visit: string;
          lead_id: string | null;
          tenant_id: string;
          tracking_config_id: string;
          visit_count: number | null;
          visitor_fingerprint: string;
        };
        Insert: {
          client_id?: string | null;
          client_id_ref?: string | null;
          created_at?: string;
          first_utm?: Json | null;
          first_visit?: string;
          id?: string;
          last_visit?: string;
          lead_id?: string | null;
          tenant_id: string;
          tracking_config_id: string;
          visit_count?: number | null;
          visitor_fingerprint: string;
        };
        Update: {
          client_id?: string | null;
          client_id_ref?: string | null;
          created_at?: string;
          first_utm?: Json | null;
          first_visit?: string;
          id?: string;
          last_visit?: string;
          lead_id?: string | null;
          tenant_id?: string;
          tracking_config_id?: string;
          visit_count?: number | null;
          visitor_fingerprint?: string;
        };
        Relationships: [
          {
            foreignKeyName: "site_visitors_client_id_ref_fkey";
            columns: ["client_id_ref"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "site_visitors_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "site_visitors_tracking_config_id_fkey";
            columns: ["tracking_config_id"];
            isOneToOne: false;
            referencedRelation: "site_tracking_configs";
            referencedColumns: ["id"];
          },
        ];
      };
      social_comments: {
        Row: {
          author_id: string | null;
          author_name: string | null;
          client_id: string | null;
          created_at: string;
          created_at_external: string | null;
          external_comment_id: string;
          external_post_id: string | null;
          hidden_at: string | null;
          id: string;
          is_from_page: boolean | null;
          message: string | null;
          page_id: string | null;
          parent_comment_id: string | null;
          platform: string;
          replied_at: string | null;
          reply_text: string | null;
          sentiment: string | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          author_id?: string | null;
          author_name?: string | null;
          client_id?: string | null;
          created_at?: string;
          created_at_external?: string | null;
          external_comment_id: string;
          external_post_id?: string | null;
          hidden_at?: string | null;
          id?: string;
          is_from_page?: boolean | null;
          message?: string | null;
          page_id?: string | null;
          parent_comment_id?: string | null;
          platform: string;
          replied_at?: string | null;
          reply_text?: string | null;
          sentiment?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          author_id?: string | null;
          author_name?: string | null;
          client_id?: string | null;
          created_at?: string;
          created_at_external?: string | null;
          external_comment_id?: string;
          external_post_id?: string | null;
          hidden_at?: string | null;
          id?: string;
          is_from_page?: boolean | null;
          message?: string | null;
          page_id?: string | null;
          parent_comment_id?: string | null;
          platform?: string;
          replied_at?: string | null;
          reply_text?: string | null;
          sentiment?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "social_comments_page_id_fkey";
            columns: ["page_id"];
            isOneToOne: false;
            referencedRelation: "social_pages";
            referencedColumns: ["id"];
          },
        ];
      };
      social_gantt_posts: {
        Row: {
          copy_prompt: string | null;
          copy_text: string | null;
          created_at: string;
          creative_prompt: string | null;
          creative_url: string | null;
          id: string;
          notes: string | null;
          platform: string;
          scheduled_date: string;
          status: string;
          tenant_id: string;
          topic: string;
          updated_at: string;
        };
        Insert: {
          copy_prompt?: string | null;
          copy_text?: string | null;
          created_at?: string;
          creative_prompt?: string | null;
          creative_url?: string | null;
          id?: string;
          notes?: string | null;
          platform: string;
          scheduled_date: string;
          status?: string;
          tenant_id: string;
          topic: string;
          updated_at?: string;
        };
        Update: {
          copy_prompt?: string | null;
          copy_text?: string | null;
          created_at?: string;
          creative_prompt?: string | null;
          creative_url?: string | null;
          id?: string;
          notes?: string | null;
          platform?: string;
          scheduled_date?: string;
          status?: string;
          tenant_id?: string;
          topic?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "social_gantt_posts_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      social_media_channels: {
        Row: {
          access_token: string | null;
          avatar_url: string | null;
          channel_id: string | null;
          channel_name: string;
          created_at: string | null;
          id: string;
          is_active: boolean | null;
          metadata: Json | null;
          platform: string;
          refresh_token: string | null;
          tenant_id: string;
          token_expires_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          access_token?: string | null;
          avatar_url?: string | null;
          channel_id?: string | null;
          channel_name: string;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          metadata?: Json | null;
          platform: string;
          refresh_token?: string | null;
          tenant_id: string;
          token_expires_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          access_token?: string | null;
          avatar_url?: string | null;
          channel_id?: string | null;
          channel_name?: string;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          metadata?: Json | null;
          platform?: string;
          refresh_token?: string | null;
          tenant_id?: string;
          token_expires_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "social_media_channels_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      social_media_post_channels: {
        Row: {
          channel_id: string;
          created_at: string | null;
          error_message: string | null;
          id: string;
          platform_post_id: string | null;
          post_id: string;
          published_at: string | null;
          status: string;
        };
        Insert: {
          channel_id: string;
          created_at?: string | null;
          error_message?: string | null;
          id?: string;
          platform_post_id?: string | null;
          post_id: string;
          published_at?: string | null;
          status?: string;
        };
        Update: {
          channel_id?: string;
          created_at?: string | null;
          error_message?: string | null;
          id?: string;
          platform_post_id?: string | null;
          post_id?: string;
          published_at?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "social_media_post_channels_channel_id_fkey";
            columns: ["channel_id"];
            isOneToOne: false;
            referencedRelation: "social_media_channels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "social_media_post_channels_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "social_media_posts";
            referencedColumns: ["id"];
          },
        ];
      };
      social_media_posts: {
        Row: {
          content: string;
          created_at: string | null;
          created_by: string | null;
          error_message: string | null;
          id: string;
          media_urls: string[] | null;
          metadata: Json | null;
          post_type: string;
          publish_to_wordpress: boolean | null;
          published_at: string | null;
          scheduled_at: string | null;
          status: string;
          tenant_id: string;
          title: string | null;
          updated_at: string | null;
          wordpress_post_id: string | null;
          wordpress_site_url: string | null;
        };
        Insert: {
          content: string;
          created_at?: string | null;
          created_by?: string | null;
          error_message?: string | null;
          id?: string;
          media_urls?: string[] | null;
          metadata?: Json | null;
          post_type?: string;
          publish_to_wordpress?: boolean | null;
          published_at?: string | null;
          scheduled_at?: string | null;
          status?: string;
          tenant_id: string;
          title?: string | null;
          updated_at?: string | null;
          wordpress_post_id?: string | null;
          wordpress_site_url?: string | null;
        };
        Update: {
          content?: string;
          created_at?: string | null;
          created_by?: string | null;
          error_message?: string | null;
          id?: string;
          media_urls?: string[] | null;
          metadata?: Json | null;
          post_type?: string;
          publish_to_wordpress?: boolean | null;
          published_at?: string | null;
          scheduled_at?: string | null;
          status?: string;
          tenant_id?: string;
          title?: string | null;
          updated_at?: string | null;
          wordpress_post_id?: string | null;
          wordpress_site_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "social_media_posts_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      social_media_wordpress_sites: {
        Row: {
          agency_id: string | null;
          app_password: string;
          campaign_form_mapping: Json | null;
          campaign_url_mapping: Json | null;
          client_id: string | null;
          created_at: string | null;
          id: string;
          is_active: boolean | null;
          last_woocommerce_sync_at: string | null;
          notes: string | null;
          site_name: string | null;
          site_url: string;
          tenant_id: string;
          updated_at: string | null;
          username: string;
          woo_consumer_key: string | null;
          woo_consumer_secret: string | null;
          woo_last_sync_at: string | null;
          woo_sync_enabled: boolean;
          woocommerce_consumer_key: string | null;
          woocommerce_consumer_secret: string | null;
          woocommerce_enabled: boolean;
        };
        Insert: {
          agency_id?: string | null;
          app_password: string;
          campaign_form_mapping?: Json | null;
          campaign_url_mapping?: Json | null;
          client_id?: string | null;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          last_woocommerce_sync_at?: string | null;
          notes?: string | null;
          site_name?: string | null;
          site_url: string;
          tenant_id: string;
          updated_at?: string | null;
          username: string;
          woo_consumer_key?: string | null;
          woo_consumer_secret?: string | null;
          woo_last_sync_at?: string | null;
          woo_sync_enabled?: boolean;
          woocommerce_consumer_key?: string | null;
          woocommerce_consumer_secret?: string | null;
          woocommerce_enabled?: boolean;
        };
        Update: {
          agency_id?: string | null;
          app_password?: string;
          campaign_form_mapping?: Json | null;
          campaign_url_mapping?: Json | null;
          client_id?: string | null;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          last_woocommerce_sync_at?: string | null;
          notes?: string | null;
          site_name?: string | null;
          site_url?: string;
          tenant_id?: string;
          updated_at?: string | null;
          username?: string;
          woo_consumer_key?: string | null;
          woo_consumer_secret?: string | null;
          woo_last_sync_at?: string | null;
          woo_sync_enabled?: boolean;
          woocommerce_consumer_key?: string | null;
          woocommerce_consumer_secret?: string | null;
          woocommerce_enabled?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "social_media_wordpress_sites_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      social_pages: {
        Row: {
          category: string | null;
          client_id: string | null;
          created_at: string;
          id: string;
          ig_business_id: string | null;
          is_active: boolean | null;
          metadata: Json | null;
          page_access_token: string | null;
          page_id: string;
          page_name: string | null;
          picture_url: string | null;
          platform: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          category?: string | null;
          client_id?: string | null;
          created_at?: string;
          id?: string;
          ig_business_id?: string | null;
          is_active?: boolean | null;
          metadata?: Json | null;
          page_access_token?: string | null;
          page_id: string;
          page_name?: string | null;
          picture_url?: string | null;
          platform: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          category?: string | null;
          client_id?: string | null;
          created_at?: string;
          id?: string;
          ig_business_id?: string | null;
          is_active?: boolean | null;
          metadata?: Json | null;
          page_access_token?: string | null;
          page_id?: string;
          page_name?: string | null;
          picture_url?: string | null;
          platform?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      social_pages_shared_tenants: {
        Row: {
          id: string;
          shared_at: string;
          shared_by: string | null;
          social_page_id: string;
          tenant_id: string;
        };
        Insert: {
          id?: string;
          shared_at?: string;
          shared_by?: string | null;
          social_page_id: string;
          tenant_id: string;
        };
        Update: {
          id?: string;
          shared_at?: string;
          shared_by?: string | null;
          social_page_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "social_pages_shared_tenants_social_page_id_fkey";
            columns: ["social_page_id"];
            isOneToOne: false;
            referencedRelation: "social_pages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "social_pages_shared_tenants_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      social_publications: {
        Row: {
          caption: string | null;
          client_id: string | null;
          created_at: string;
          error_message: string | null;
          external_id: string | null;
          id: string;
          media_url: string | null;
          page_id: string | null;
          permalink: string | null;
          platform: string;
          post_type: string;
          published_at: string | null;
          published_by: string | null;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          caption?: string | null;
          client_id?: string | null;
          created_at?: string;
          error_message?: string | null;
          external_id?: string | null;
          id?: string;
          media_url?: string | null;
          page_id?: string | null;
          permalink?: string | null;
          platform: string;
          post_type: string;
          published_at?: string | null;
          published_by?: string | null;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          caption?: string | null;
          client_id?: string | null;
          created_at?: string;
          error_message?: string | null;
          external_id?: string | null;
          id?: string;
          media_url?: string | null;
          page_id?: string | null;
          permalink?: string | null;
          platform?: string;
          post_type?: string;
          published_at?: string | null;
          published_by?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      supplier_invoices: {
        Row: {
          ai_extracted: boolean;
          created_at: string;
          file_name: string | null;
          file_url: string | null;
          id: string;
          invoice_amount: number;
          invoice_date: string | null;
          invoice_month: string;
          invoice_name: string;
          notes: string | null;
          supplier_id: string;
          tenant_id: string;
        };
        Insert: {
          ai_extracted?: boolean;
          created_at?: string;
          file_name?: string | null;
          file_url?: string | null;
          id?: string;
          invoice_amount?: number;
          invoice_date?: string | null;
          invoice_month?: string;
          invoice_name?: string;
          notes?: string | null;
          supplier_id: string;
          tenant_id: string;
        };
        Update: {
          ai_extracted?: boolean;
          created_at?: string;
          file_name?: string | null;
          file_url?: string | null;
          id?: string;
          invoice_amount?: number;
          invoice_date?: string | null;
          invoice_month?: string;
          invoice_name?: string;
          notes?: string | null;
          supplier_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "supplier_invoices_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "supplier_invoices_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      suppliers: {
        Row: {
          agency_id_1: string | null;
          agency_id_2: string | null;
          agency_id_3: string | null;
          created_at: string;
          email: string | null;
          folder_link: string | null;
          id: string;
          name: string;
          notes: string | null;
          payment: number | null;
          payment_1: number | null;
          payment_2: number | null;
          payment_3: number | null;
          phone: string | null;
          related_campaigner_id: string | null;
          tenant_id: string | null;
          type: Database["public"]["Enums"]["supplier_type"];
          updated_at: string;
        };
        Insert: {
          agency_id_1?: string | null;
          agency_id_2?: string | null;
          agency_id_3?: string | null;
          created_at?: string;
          email?: string | null;
          folder_link?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          payment?: number | null;
          payment_1?: number | null;
          payment_2?: number | null;
          payment_3?: number | null;
          phone?: string | null;
          related_campaigner_id?: string | null;
          tenant_id?: string | null;
          type: Database["public"]["Enums"]["supplier_type"];
          updated_at?: string;
        };
        Update: {
          agency_id_1?: string | null;
          agency_id_2?: string | null;
          agency_id_3?: string | null;
          created_at?: string;
          email?: string | null;
          folder_link?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          payment?: number | null;
          payment_1?: number | null;
          payment_2?: number | null;
          payment_3?: number | null;
          phone?: string | null;
          related_campaigner_id?: string | null;
          tenant_id?: string | null;
          type?: Database["public"]["Enums"]["supplier_type"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "suppliers_agency_id_1_fkey";
            columns: ["agency_id_1"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "suppliers_agency_id_2_fkey";
            columns: ["agency_id_2"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "suppliers_agency_id_3_fkey";
            columns: ["agency_id_3"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "suppliers_related_campaigner_id_fkey";
            columns: ["related_campaigner_id"];
            isOneToOne: false;
            referencedRelation: "campaigners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "suppliers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      sync_jobs: {
        Row: {
          completed_at: string | null;
          created_at: string;
          error_message: string | null;
          id: string;
          job_type: string;
          progress: Json;
          settings: Json;
          started_at: string | null;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          error_message?: string | null;
          id?: string;
          job_type?: string;
          progress?: Json;
          settings?: Json;
          started_at?: string | null;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          error_message?: string | null;
          id?: string;
          job_type?: string;
          progress?: Json;
          settings?: Json;
          started_at?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sync_jobs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      table_shares: {
        Row: {
          allowed_emails: string[] | null;
          created_at: string;
          created_by: string;
          id: string;
          is_active: boolean;
          share_token: string;
          table_id: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          allowed_emails?: string[] | null;
          created_at?: string;
          created_by: string;
          id?: string;
          is_active?: boolean;
          share_token?: string;
          table_id: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          allowed_emails?: string[] | null;
          created_at?: string;
          created_by?: string;
          id?: string;
          is_active?: boolean;
          share_token?: string;
          table_id?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "table_shares_table_id_fkey";
            columns: ["table_id"];
            isOneToOne: false;
            referencedRelation: "crm_tables";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "table_shares_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      task_checklist_items: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          is_done: boolean;
          sort_order: number;
          task_id: string;
          tenant_id: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_done?: boolean;
          sort_order?: number;
          task_id: string;
          tenant_id: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_done?: boolean;
          sort_order?: number;
          task_id?: string;
          tenant_id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_checklist_items_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_checklist_items_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      task_collaborators: {
        Row: {
          added_at: string;
          added_by: string | null;
          campaigner_id: string;
          id: string;
          task_id: string;
          tenant_id: string;
        };
        Insert: {
          added_at?: string;
          added_by?: string | null;
          campaigner_id: string;
          id?: string;
          task_id: string;
          tenant_id: string;
        };
        Update: {
          added_at?: string;
          added_by?: string | null;
          campaigner_id?: string;
          id?: string;
          task_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_collaborators_campaigner_id_fkey";
            columns: ["campaigner_id"];
            isOneToOne: false;
            referencedRelation: "campaigners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_collaborators_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_collaborators_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      task_notification_deliveries: {
        Row: {
          delivered_at: string;
          notification_type: string;
          recipient_key: string;
          task_id: string;
        };
        Insert: {
          delivered_at?: string;
          notification_type: string;
          recipient_key?: string;
          task_id: string;
        };
        Update: {
          delivered_at?: string;
          notification_type?: string;
          recipient_key?: string;
          task_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_notification_deliveries_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      task_updates: {
        Row: {
          attachments: Json | null;
          content: string;
          created_at: string;
          id: string;
          task_id: string;
          update_type: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          attachments?: Json | null;
          content: string;
          created_at?: string;
          id?: string;
          task_id: string;
          update_type?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          attachments?: Json | null;
          content?: string;
          created_at?: string;
          id?: string;
          task_id?: string;
          update_type?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_updates_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_updates_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      tasks: {
        Row: {
          agency_id: string;
          assigned_agent: string | null;
          assignment_notification_sent_at: string | null;
          attachments: Json;
          campaigner_id: string | null;
          client_id: string | null;
          completion_creator_notified_at: string | null;
          created_at: string;
          created_by: string | null;
          due_date: string | null;
          due_time: string | null;
          duration_minutes: number | null;
          goal_id: string | null;
          google_calendar_event_id: string | null;
          high_priority_creator_notified_at: string | null;
          high_priority_reminder_sent_at: string | null;
          id: string;
          impersonated_by: string | null;
          lead_id: string | null;
          notes: string | null;
          overdue_creator_notified_at: string | null;
          overdue_notified_at: string | null;
          priority: number;
          recurrence_frequency: string | null;
          recurrence_interval: number;
          recurrence_monthday: number | null;
          recurrence_previous_task_id: string | null;
          recurrence_series_id: string | null;
          recurrence_weekday: number | null;
          sales_person_id: string | null;
          self_reminder_at: string | null;
          self_reminder_sent_at: string | null;
          sort_order: number | null;
          status: Database["public"]["Enums"]["task_status"];
          target_date: string | null;
          task_type: Database["public"]["Enums"]["task_type"] | null;
          tenant_id: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          agency_id: string;
          assigned_agent?: string | null;
          assignment_notification_sent_at?: string | null;
          attachments?: Json;
          campaigner_id?: string | null;
          client_id?: string | null;
          completion_creator_notified_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          due_date?: string | null;
          due_time?: string | null;
          duration_minutes?: number | null;
          goal_id?: string | null;
          google_calendar_event_id?: string | null;
          high_priority_creator_notified_at?: string | null;
          high_priority_reminder_sent_at?: string | null;
          id?: string;
          impersonated_by?: string | null;
          lead_id?: string | null;
          notes?: string | null;
          overdue_creator_notified_at?: string | null;
          overdue_notified_at?: string | null;
          priority?: number;
          recurrence_frequency?: string | null;
          recurrence_interval?: number;
          recurrence_monthday?: number | null;
          recurrence_previous_task_id?: string | null;
          recurrence_series_id?: string | null;
          recurrence_weekday?: number | null;
          sales_person_id?: string | null;
          self_reminder_at?: string | null;
          self_reminder_sent_at?: string | null;
          sort_order?: number | null;
          status?: Database["public"]["Enums"]["task_status"];
          target_date?: string | null;
          task_type?: Database["public"]["Enums"]["task_type"] | null;
          tenant_id: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          agency_id?: string;
          assigned_agent?: string | null;
          assignment_notification_sent_at?: string | null;
          attachments?: Json;
          campaigner_id?: string | null;
          client_id?: string | null;
          completion_creator_notified_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          due_date?: string | null;
          due_time?: string | null;
          duration_minutes?: number | null;
          goal_id?: string | null;
          google_calendar_event_id?: string | null;
          high_priority_creator_notified_at?: string | null;
          high_priority_reminder_sent_at?: string | null;
          id?: string;
          impersonated_by?: string | null;
          lead_id?: string | null;
          notes?: string | null;
          overdue_creator_notified_at?: string | null;
          overdue_notified_at?: string | null;
          priority?: number;
          recurrence_frequency?: string | null;
          recurrence_interval?: number;
          recurrence_monthday?: number | null;
          recurrence_previous_task_id?: string | null;
          recurrence_series_id?: string | null;
          recurrence_weekday?: number | null;
          sales_person_id?: string | null;
          self_reminder_at?: string | null;
          self_reminder_sent_at?: string | null;
          sort_order?: number | null;
          status?: Database["public"]["Enums"]["task_status"];
          target_date?: string | null;
          task_type?: Database["public"]["Enums"]["task_type"] | null;
          tenant_id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_campaigner_id_fkey";
            columns: ["campaigner_id"];
            isOneToOne: false;
            referencedRelation: "campaigners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_recurrence_previous_task_id_fkey";
            columns: ["recurrence_previous_task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_sales_person_id_fkey";
            columns: ["sales_person_id"];
            isOneToOne: false;
            referencedRelation: "sales_people";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      team_channel_categories: {
        Row: {
          created_at: string;
          icon: string;
          id: string;
          name: string;
          sort_order: number;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          icon?: string;
          id?: string;
          name: string;
          sort_order?: number;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          icon?: string;
          id?: string;
          name?: string;
          sort_order?: number;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_channel_categories_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      team_channel_invites: {
        Row: {
          channel_id: string;
          created_at: string;
          created_by: string;
          id: string;
          is_active: boolean;
          tenant_id: string;
          token: string;
        };
        Insert: {
          channel_id: string;
          created_at?: string;
          created_by: string;
          id?: string;
          is_active?: boolean;
          tenant_id: string;
          token?: string;
        };
        Update: {
          channel_id?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          is_active?: boolean;
          tenant_id?: string;
          token?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_channel_invites_channel_id_fkey";
            columns: ["channel_id"];
            isOneToOne: false;
            referencedRelation: "team_channels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_channel_invites_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      team_channel_members: {
        Row: {
          channel_id: string;
          id: string;
          joined_at: string;
          notify_enabled: boolean | null;
          notify_override_group: string | null;
          notify_override_phone: string | null;
          role: string;
          tenant_id: string;
          user_id: string;
        };
        Insert: {
          channel_id: string;
          id?: string;
          joined_at?: string;
          notify_enabled?: boolean | null;
          notify_override_group?: string | null;
          notify_override_phone?: string | null;
          role?: string;
          tenant_id: string;
          user_id: string;
        };
        Update: {
          channel_id?: string;
          id?: string;
          joined_at?: string;
          notify_enabled?: boolean | null;
          notify_override_group?: string | null;
          notify_override_phone?: string | null;
          role?: string;
          tenant_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_channel_members_channel_id_fkey";
            columns: ["channel_id"];
            isOneToOne: false;
            referencedRelation: "team_channels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_channel_members_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      team_channel_whatsapp_links: {
        Row: {
          channel_id: string;
          client_id: string | null;
          created_at: string | null;
          created_by: string | null;
          display_name: string | null;
          forward_files: boolean | null;
          id: string;
          lead_id: string | null;
          tenant_id: string;
          whatsapp_chat_id: string | null;
          whatsapp_group_id: string | null;
        };
        Insert: {
          channel_id: string;
          client_id?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          display_name?: string | null;
          forward_files?: boolean | null;
          id?: string;
          lead_id?: string | null;
          tenant_id: string;
          whatsapp_chat_id?: string | null;
          whatsapp_group_id?: string | null;
        };
        Update: {
          channel_id?: string;
          client_id?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          display_name?: string | null;
          forward_files?: boolean | null;
          id?: string;
          lead_id?: string | null;
          tenant_id?: string;
          whatsapp_chat_id?: string | null;
          whatsapp_group_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "team_channel_whatsapp_links_channel_id_fkey";
            columns: ["channel_id"];
            isOneToOne: false;
            referencedRelation: "team_channels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_channel_whatsapp_links_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_channel_whatsapp_links_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_channel_whatsapp_links_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_channel_whatsapp_links_whatsapp_group_id_fkey";
            columns: ["whatsapp_group_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_groups";
            referencedColumns: ["id"];
          },
        ];
      };
      team_channels: {
        Row: {
          agency_id: string | null;
          avatar_url: string | null;
          category: string;
          category_id: string | null;
          color: string | null;
          created_at: string;
          created_by: string;
          description: string | null;
          id: string;
          is_private: boolean | null;
          linked_client_id: string | null;
          linked_lead_id: string | null;
          name: string;
          notification_group_link: string | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          agency_id?: string | null;
          avatar_url?: string | null;
          category?: string;
          category_id?: string | null;
          color?: string | null;
          created_at?: string;
          created_by: string;
          description?: string | null;
          id?: string;
          is_private?: boolean | null;
          linked_client_id?: string | null;
          linked_lead_id?: string | null;
          name: string;
          notification_group_link?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          agency_id?: string | null;
          avatar_url?: string | null;
          category?: string;
          category_id?: string | null;
          color?: string | null;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          id?: string;
          is_private?: boolean | null;
          linked_client_id?: string | null;
          linked_lead_id?: string | null;
          name?: string;
          notification_group_link?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_channels_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_channels_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "team_channel_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_channels_linked_client_id_fkey";
            columns: ["linked_client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_channels_linked_lead_id_fkey";
            columns: ["linked_lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_channels_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      team_chat_files: {
        Row: {
          channel_id: string;
          client_id: string | null;
          created_at: string;
          file_name: string;
          file_size: number | null;
          file_type: string;
          file_url: string;
          id: string;
          lead_id: string | null;
          message_id: string | null;
          tenant_id: string;
          uploaded_by: string;
        };
        Insert: {
          channel_id: string;
          client_id?: string | null;
          created_at?: string;
          file_name: string;
          file_size?: number | null;
          file_type?: string;
          file_url: string;
          id?: string;
          lead_id?: string | null;
          message_id?: string | null;
          tenant_id: string;
          uploaded_by: string;
        };
        Update: {
          channel_id?: string;
          client_id?: string | null;
          created_at?: string;
          file_name?: string;
          file_size?: number | null;
          file_type?: string;
          file_url?: string;
          id?: string;
          lead_id?: string | null;
          message_id?: string | null;
          tenant_id?: string;
          uploaded_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_chat_files_channel_id_fkey";
            columns: ["channel_id"];
            isOneToOne: false;
            referencedRelation: "team_channels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_chat_files_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_chat_files_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_chat_files_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "team_messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_chat_files_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      team_message_attachments: {
        Row: {
          created_at: string;
          file_name: string;
          file_size: number | null;
          file_type: string | null;
          file_url: string;
          id: string;
          linked_client_id: string | null;
          linked_lead_id: string | null;
          message_id: string;
        };
        Insert: {
          created_at?: string;
          file_name: string;
          file_size?: number | null;
          file_type?: string | null;
          file_url: string;
          id?: string;
          linked_client_id?: string | null;
          linked_lead_id?: string | null;
          message_id: string;
        };
        Update: {
          created_at?: string;
          file_name?: string;
          file_size?: number | null;
          file_type?: string | null;
          file_url?: string;
          id?: string;
          linked_client_id?: string | null;
          linked_lead_id?: string | null;
          message_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_message_attachments_linked_client_id_fkey";
            columns: ["linked_client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_message_attachments_linked_lead_id_fkey";
            columns: ["linked_lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_message_attachments_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "team_messages";
            referencedColumns: ["id"];
          },
        ];
      };
      team_message_reactions: {
        Row: {
          created_at: string;
          emoji: string;
          id: string;
          message_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          emoji: string;
          id?: string;
          message_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          emoji?: string;
          id?: string;
          message_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_message_reactions_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "team_messages";
            referencedColumns: ["id"];
          },
        ];
      };
      team_message_read_status: {
        Row: {
          channel_id: string;
          id: string;
          last_read_at: string;
          last_read_message_id: string | null;
          user_id: string;
        };
        Insert: {
          channel_id: string;
          id?: string;
          last_read_at?: string;
          last_read_message_id?: string | null;
          user_id: string;
        };
        Update: {
          channel_id?: string;
          id?: string;
          last_read_at?: string;
          last_read_message_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_message_read_status_channel_id_fkey";
            columns: ["channel_id"];
            isOneToOne: false;
            referencedRelation: "team_channels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_message_read_status_last_read_message_id_fkey";
            columns: ["last_read_message_id"];
            isOneToOne: false;
            referencedRelation: "team_messages";
            referencedColumns: ["id"];
          },
        ];
      };
      team_messages: {
        Row: {
          attachments: Json | null;
          channel_id: string;
          content: string;
          created_at: string;
          id: string;
          is_edited: boolean | null;
          parent_message_id: string | null;
          sender_id: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          attachments?: Json | null;
          channel_id: string;
          content: string;
          created_at?: string;
          id?: string;
          is_edited?: boolean | null;
          parent_message_id?: string | null;
          sender_id: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          attachments?: Json | null;
          channel_id?: string;
          content?: string;
          created_at?: string;
          id?: string;
          is_edited?: boolean | null;
          parent_message_id?: string | null;
          sender_id?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_messages_channel_id_fkey";
            columns: ["channel_id"];
            isOneToOne: false;
            referencedRelation: "team_channels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_messages_parent_message_id_fkey";
            columns: ["parent_message_id"];
            isOneToOne: false;
            referencedRelation: "team_messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_messages_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      telegram_bot_state: {
        Row: {
          bot_name: string | null;
          bot_username: string | null;
          created_at: string;
          id: string;
          is_active: boolean;
          shared_from_state_id: string | null;
          tenant_id: string;
          update_offset: number;
          updated_at: string;
        };
        Insert: {
          bot_name?: string | null;
          bot_username?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          shared_from_state_id?: string | null;
          tenant_id: string;
          update_offset?: number;
          updated_at?: string;
        };
        Update: {
          bot_name?: string | null;
          bot_username?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          shared_from_state_id?: string | null;
          tenant_id?: string;
          update_offset?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      telegram_messages: {
        Row: {
          chat_id: number;
          client_id: string | null;
          created_at: string;
          direction: string;
          id: string;
          lead_id: string | null;
          raw_update: Json | null;
          sender_name: string | null;
          sender_username: string | null;
          tenant_id: string;
          text: string | null;
          update_id: number | null;
        };
        Insert: {
          chat_id: number;
          client_id?: string | null;
          created_at?: string;
          direction?: string;
          id?: string;
          lead_id?: string | null;
          raw_update?: Json | null;
          sender_name?: string | null;
          sender_username?: string | null;
          tenant_id: string;
          text?: string | null;
          update_id?: number | null;
        };
        Update: {
          chat_id?: number;
          client_id?: string | null;
          created_at?: string;
          direction?: string;
          id?: string;
          lead_id?: string | null;
          raw_update?: Json | null;
          sender_name?: string | null;
          sender_username?: string | null;
          tenant_id?: string;
          text?: string | null;
          update_id?: number | null;
        };
        Relationships: [];
      };
      telephony_settings: {
        Row: {
          auto_record: boolean | null;
          created_at: string;
          id: string;
          personal_phone: string | null;
          provider: string | null;
          tenant_id: string;
          updated_at: string;
          user_id: string;
          virtual_number: string | null;
        };
        Insert: {
          auto_record?: boolean | null;
          created_at?: string;
          id?: string;
          personal_phone?: string | null;
          provider?: string | null;
          tenant_id: string;
          updated_at?: string;
          user_id: string;
          virtual_number?: string | null;
        };
        Update: {
          auto_record?: boolean | null;
          created_at?: string;
          id?: string;
          personal_phone?: string | null;
          provider?: string | null;
          tenant_id?: string;
          updated_at?: string;
          user_id?: string;
          virtual_number?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "telephony_settings_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_heartbeat_settings: {
        Row: {
          active_hours_end: number;
          active_hours_start: number;
          allowed_actions: Json;
          campaign_pulse_deliver_to_campaigners: boolean;
          campaign_pulse_deliver_to_team_managers: boolean;
          campaign_pulse_enabled: boolean;
          campaign_pulse_last_sent_at: string | null;
          campaign_pulse_phone: string | null;
          campaign_pulse_preview_phone: string | null;
          client_retention_last_sent_at: string | null;
          enabled: boolean;
          health_digest_last_sent_at: string | null;
          interval_hours: number;
          max_concurrent_tasks: number;
          pulse_alert_rules: Json;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          active_hours_end?: number;
          active_hours_start?: number;
          allowed_actions?: Json;
          campaign_pulse_deliver_to_campaigners?: boolean;
          campaign_pulse_deliver_to_team_managers?: boolean;
          campaign_pulse_enabled?: boolean;
          campaign_pulse_last_sent_at?: string | null;
          campaign_pulse_phone?: string | null;
          campaign_pulse_preview_phone?: string | null;
          client_retention_last_sent_at?: string | null;
          enabled?: boolean;
          health_digest_last_sent_at?: string | null;
          interval_hours?: number;
          max_concurrent_tasks?: number;
          pulse_alert_rules?: Json;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          active_hours_end?: number;
          active_hours_start?: number;
          allowed_actions?: Json;
          campaign_pulse_deliver_to_campaigners?: boolean;
          campaign_pulse_deliver_to_team_managers?: boolean;
          campaign_pulse_enabled?: boolean;
          campaign_pulse_last_sent_at?: string | null;
          campaign_pulse_phone?: string | null;
          campaign_pulse_preview_phone?: string | null;
          client_retention_last_sent_at?: string | null;
          enabled?: boolean;
          health_digest_last_sent_at?: string | null;
          interval_hours?: number;
          max_concurrent_tasks?: number;
          pulse_alert_rules?: Json;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tenant_integrations: {
        Row: {
          api_key: string | null;
          api_token_last_4: string | null;
          auto_sync_enabled: boolean;
          company_id: string | null;
          connection_visibility: string;
          created_at: string;
          display_name: string | null;
          id: string;
          instance_id: string | null;
          integration_type: string;
          is_active: boolean;
          last_sync_at: string | null;
          settings: Json | null;
          shared_from_integration_id: string | null;
          tenant_id: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          api_key?: string | null;
          api_token_last_4?: string | null;
          auto_sync_enabled?: boolean;
          company_id?: string | null;
          connection_visibility?: string;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          instance_id?: string | null;
          integration_type?: string;
          is_active?: boolean;
          last_sync_at?: string | null;
          settings?: Json | null;
          shared_from_integration_id?: string | null;
          tenant_id: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          api_key?: string | null;
          api_token_last_4?: string | null;
          auto_sync_enabled?: boolean;
          company_id?: string | null;
          connection_visibility?: string;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          instance_id?: string | null;
          integration_type?: string;
          is_active?: boolean;
          last_sync_at?: string | null;
          settings?: Json | null;
          shared_from_integration_id?: string | null;
          tenant_id?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_integrations_shared_from_integration_id_fkey";
            columns: ["shared_from_integration_id"];
            isOneToOne: false;
            referencedRelation: "tenant_integrations";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_rate_limits: {
        Row: {
          current_count: number;
          id: string;
          max_per_minute: number;
          resource_type: string;
          tenant_id: string;
          window_start: string;
        };
        Insert: {
          current_count?: number;
          id?: string;
          max_per_minute?: number;
          resource_type: string;
          tenant_id: string;
          window_start?: string;
        };
        Update: {
          current_count?: number;
          id?: string;
          max_per_minute?: number;
          resource_type?: string;
          tenant_id?: string;
          window_start?: string;
        };
        Relationships: [];
      };
      tenant_settings: {
        Row: {
          created_at: string;
          id: string;
          setting_key: string;
          setting_value: Json;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          setting_key: string;
          setting_value: Json;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          setting_key?: string;
          setting_value?: Json;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_templates: {
        Row: {
          created_at: string | null;
          created_by: string;
          description: string | null;
          id: string;
          is_public: boolean | null;
          name: string;
          source_tenant_id: string;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          created_by: string;
          description?: string | null;
          id?: string;
          is_public?: boolean | null;
          name: string;
          source_tenant_id: string;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          created_by?: string;
          description?: string | null;
          id?: string;
          is_public?: boolean | null;
          name?: string;
          source_tenant_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_templates_source_tenant_id_fkey";
            columns: ["source_tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_terminology: {
        Row: {
          created_at: string;
          id: string;
          original_plural: string;
          original_singular: string;
          plural: string;
          singular: string;
          tenant_id: string;
          term_key: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          original_plural: string;
          original_singular: string;
          plural: string;
          singular: string;
          tenant_id: string;
          term_key: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          original_plural?: string;
          original_singular?: string;
          plural?: string;
          singular?: string;
          tenant_id?: string;
          term_key?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_terminology_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_users: {
        Row: {
          created_at: string;
          id: string;
          role: string;
          tenant_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role?: string;
          tenant_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: string;
          tenant_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_users_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenants: {
        Row: {
          allow_super_admin_access: boolean;
          contact_email: string | null;
          contact_name: string | null;
          created_at: string;
          id: string;
          is_premium: boolean | null;
          name: string;
          notes: string | null;
          org_type: Database["public"]["Enums"]["org_type"];
          parent_tenant_id: string | null;
          settings: Json | null;
          slug: string;
          status: Database["public"]["Enums"]["tenant_status"];
          subdomain: string | null;
          trial_ends_at: string | null;
          updated_at: string;
        };
        Insert: {
          allow_super_admin_access?: boolean;
          contact_email?: string | null;
          contact_name?: string | null;
          created_at?: string;
          id?: string;
          is_premium?: boolean | null;
          name: string;
          notes?: string | null;
          org_type?: Database["public"]["Enums"]["org_type"];
          parent_tenant_id?: string | null;
          settings?: Json | null;
          slug: string;
          status?: Database["public"]["Enums"]["tenant_status"];
          subdomain?: string | null;
          trial_ends_at?: string | null;
          updated_at?: string;
        };
        Update: {
          allow_super_admin_access?: boolean;
          contact_email?: string | null;
          contact_name?: string | null;
          created_at?: string;
          id?: string;
          is_premium?: boolean | null;
          name?: string;
          notes?: string | null;
          org_type?: Database["public"]["Enums"]["org_type"];
          parent_tenant_id?: string | null;
          settings?: Json | null;
          slug?: string;
          status?: Database["public"]["Enums"]["tenant_status"];
          subdomain?: string | null;
          trial_ends_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenants_parent_tenant_id_fkey";
            columns: ["parent_tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      terminology_presets: {
        Row: {
          created_at: string | null;
          created_by_tenant_id: string | null;
          created_by_user_id: string | null;
          description: string | null;
          id: string;
          is_public: boolean | null;
          name: string;
          terms: Json;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          created_by_tenant_id?: string | null;
          created_by_user_id?: string | null;
          description?: string | null;
          id?: string;
          is_public?: boolean | null;
          name: string;
          terms: Json;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          created_by_tenant_id?: string | null;
          created_by_user_id?: string | null;
          description?: string | null;
          id?: string;
          is_public?: boolean | null;
          name?: string;
          terms?: Json;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "terminology_presets_created_by_tenant_id_fkey";
            columns: ["created_by_tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      time_entries: {
        Row: {
          campaigner_id: string;
          created_at: string;
          end_time: string | null;
          id: string;
          notes: string | null;
          start_time: string;
          tenant_id: string | null;
          updated_at: string;
        };
        Insert: {
          campaigner_id: string;
          created_at?: string;
          end_time?: string | null;
          id?: string;
          notes?: string | null;
          start_time: string;
          tenant_id?: string | null;
          updated_at?: string;
        };
        Update: {
          campaigner_id?: string;
          created_at?: string;
          end_time?: string | null;
          id?: string;
          notes?: string | null;
          start_time?: string;
          tenant_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "time_entries_campaigner_id_fkey";
            columns: ["campaigner_id"];
            isOneToOne: false;
            referencedRelation: "campaigners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_entries_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      time_entry_breaks: {
        Row: {
          created_at: string;
          end_time: string | null;
          id: string;
          start_time: string;
          tenant_id: string;
          time_entry_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          end_time?: string | null;
          id?: string;
          start_time?: string;
          tenant_id: string;
          time_entry_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          end_time?: string | null;
          id?: string;
          start_time?: string;
          tenant_id?: string;
          time_entry_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "time_entry_breaks_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_entry_breaks_time_entry_id_fkey";
            columns: ["time_entry_id"];
            isOneToOne: false;
            referencedRelation: "time_entries";
            referencedColumns: ["id"];
          },
        ];
      };
      user_active_tenant: {
        Row: {
          created_at: string;
          tenant_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          tenant_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          tenant_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_active_tenant_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      user_api_keys: {
        Row: {
          api_key: string;
          created_at: string;
          provider: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          api_key: string;
          created_at?: string;
          provider?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          api_key?: string;
          created_at?: string;
          provider?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_managed_agencies: {
        Row: {
          agency_id: string;
          created_at: string;
          id: string;
          user_id: string;
        };
        Insert: {
          agency_id: string;
          created_at?: string;
          id?: string;
          user_id: string;
        };
        Update: {
          agency_id?: string;
          created_at?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_managed_agencies_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
        ];
      };
      user_permissions: {
        Row: {
          can_access: boolean;
          created_at: string;
          id: string;
          module: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          can_access?: boolean;
          created_at?: string;
          id?: string;
          module: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          can_access?: boolean;
          created_at?: string;
          id?: string;
          module?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          tenant_id: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          tenant_id?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          tenant_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      user_workspace_layout: {
        Row: {
          created_at: string;
          height: number;
          id: string;
          is_open: boolean;
          module_id: string;
          tenant_id: string;
          updated_at: string;
          user_id: string;
          width: number;
          x_position: number;
          y_position: number;
        };
        Insert: {
          created_at?: string;
          height?: number;
          id?: string;
          is_open?: boolean;
          module_id: string;
          tenant_id: string;
          updated_at?: string;
          user_id: string;
          width?: number;
          x_position?: number;
          y_position?: number;
        };
        Update: {
          created_at?: string;
          height?: number;
          id?: string;
          is_open?: boolean;
          module_id?: string;
          tenant_id?: string;
          updated_at?: string;
          user_id?: string;
          width?: number;
          x_position?: number;
          y_position?: number;
        };
        Relationships: [];
      };
      wa_group_members: {
        Row: {
          contact_id: string | null;
          contact_name: string | null;
          contact_type: string | null;
          created_at: string | null;
          group_chat_id: string;
          id: string;
          is_admin: boolean | null;
          last_synced_at: string | null;
          name: string | null;
          phone: string;
          tenant_id: string;
          updated_at: string | null;
          wa_id: string | null;
        };
        Insert: {
          contact_id?: string | null;
          contact_name?: string | null;
          contact_type?: string | null;
          created_at?: string | null;
          group_chat_id: string;
          id?: string;
          is_admin?: boolean | null;
          last_synced_at?: string | null;
          name?: string | null;
          phone: string;
          tenant_id: string;
          updated_at?: string | null;
          wa_id?: string | null;
        };
        Update: {
          contact_id?: string | null;
          contact_name?: string | null;
          contact_type?: string | null;
          created_at?: string | null;
          group_chat_id?: string;
          id?: string;
          is_admin?: boolean | null;
          last_synced_at?: string | null;
          name?: string | null;
          phone?: string;
          tenant_id?: string;
          updated_at?: string | null;
          wa_id?: string | null;
        };
        Relationships: [];
      };
      wa_lid_map: {
        Row: {
          connection_user_id: string | null;
          lid: string;
          phone: string;
          source: string | null;
          updated_at: string;
        };
        Insert: {
          connection_user_id?: string | null;
          lid: string;
          phone: string;
          source?: string | null;
          updated_at?: string;
        };
        Update: {
          connection_user_id?: string | null;
          lid?: string;
          phone?: string;
          source?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      wa_pending_activations: {
        Row: {
          activation_message_id: string | null;
          code: string;
          completed_at: string | null;
          completed_lid: string | null;
          created_at: string;
          group_chat_id: string | null;
          id: string;
          integration_id: string | null;
          phone: string;
          status: string;
          tenant_id: string;
        };
        Insert: {
          activation_message_id?: string | null;
          code: string;
          completed_at?: string | null;
          completed_lid?: string | null;
          created_at?: string;
          group_chat_id?: string | null;
          id?: string;
          integration_id?: string | null;
          phone: string;
          status?: string;
          tenant_id: string;
        };
        Update: {
          activation_message_id?: string | null;
          code?: string;
          completed_at?: string | null;
          completed_lid?: string | null;
          created_at?: string;
          group_chat_id?: string | null;
          id?: string;
          integration_id?: string | null;
          phone?: string;
          status?: string;
          tenant_id?: string;
        };
        Relationships: [];
      };
      wa_warm_campaigns: {
        Row: {
          admin_confirm_phrase: string | null;
          admin_confirmed_at: string | null;
          audience_filter: Json;
          audience_source: string;
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          daily_cap: number;
          id: string;
          integration_id: string;
          last_error: string | null;
          name: string;
          optin_template_language: string;
          optin_template_name: string;
          started_at: string | null;
          stats: Json;
          status: string;
          tenant_id: string;
          thanks_text: string;
          throttle_max_seconds: number;
          throttle_min_seconds: number;
          updated_at: string;
        };
        Insert: {
          admin_confirm_phrase?: string | null;
          admin_confirmed_at?: string | null;
          audience_filter?: Json;
          audience_source?: string;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          daily_cap?: number;
          id?: string;
          integration_id: string;
          last_error?: string | null;
          name?: string;
          optin_template_language?: string;
          optin_template_name?: string;
          started_at?: string | null;
          stats?: Json;
          status?: string;
          tenant_id: string;
          thanks_text?: string;
          throttle_max_seconds?: number;
          throttle_min_seconds?: number;
          updated_at?: string;
        };
        Update: {
          admin_confirm_phrase?: string | null;
          admin_confirmed_at?: string | null;
          audience_filter?: Json;
          audience_source?: string;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          daily_cap?: number;
          id?: string;
          integration_id?: string;
          last_error?: string | null;
          name?: string;
          optin_template_language?: string;
          optin_template_name?: string;
          started_at?: string | null;
          stats?: Json;
          status?: string;
          tenant_id?: string;
          thanks_text?: string;
          throttle_max_seconds?: number;
          throttle_min_seconds?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "wa_warm_campaigns_integration_id_fkey";
            columns: ["integration_id"];
            isOneToOne: false;
            referencedRelation: "tenant_integrations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wa_warm_campaigns_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      wa_warm_opt_ins: {
        Row: {
          campaign_id: string | null;
          contact_name: string | null;
          created_at: string;
          id: string;
          integration_id: string;
          last_auto_reply_at: string | null;
          opted_in_at: string;
          phone: string;
          source: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          campaign_id?: string | null;
          contact_name?: string | null;
          created_at?: string;
          id?: string;
          integration_id: string;
          last_auto_reply_at?: string | null;
          opted_in_at?: string;
          phone: string;
          source?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          campaign_id?: string | null;
          contact_name?: string | null;
          created_at?: string;
          id?: string;
          integration_id?: string;
          last_auto_reply_at?: string | null;
          opted_in_at?: string;
          phone?: string;
          source?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "wa_warm_opt_ins_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "wa_warm_campaigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wa_warm_opt_ins_integration_id_fkey";
            columns: ["integration_id"];
            isOneToOne: false;
            referencedRelation: "tenant_integrations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wa_warm_opt_ins_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      wa_warm_recipients: {
        Row: {
          attempts: number;
          campaign_id: string;
          contact_name: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string | null;
          error: string | null;
          id: string;
          opted_in_at: string | null;
          phone: string;
          provider_message_id: string | null;
          replied_at: string | null;
          sent_at: string | null;
          status: string;
          tenant_id: string;
          thanked_at: string | null;
          updated_at: string;
        };
        Insert: {
          attempts?: number;
          campaign_id: string;
          contact_name?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          error?: string | null;
          id?: string;
          opted_in_at?: string | null;
          phone: string;
          provider_message_id?: string | null;
          replied_at?: string | null;
          sent_at?: string | null;
          status?: string;
          tenant_id: string;
          thanked_at?: string | null;
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          campaign_id?: string;
          contact_name?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          error?: string | null;
          id?: string;
          opted_in_at?: string | null;
          phone?: string;
          provider_message_id?: string | null;
          replied_at?: string | null;
          sent_at?: string | null;
          status?: string;
          tenant_id?: string;
          thanked_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "wa_warm_recipients_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "wa_warm_campaigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wa_warm_recipients_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_groups: {
        Row: {
          agency_id: string | null;
          created_at: string;
          description: string | null;
          group_chat_id: string;
          group_name: string;
          id: string;
          invite_link: string | null;
          is_blocked: boolean;
          tenant_id: string;
          updated_at: string;
          whatsapp_avatar_url: string | null;
        };
        Insert: {
          agency_id?: string | null;
          created_at?: string;
          description?: string | null;
          group_chat_id: string;
          group_name: string;
          id?: string;
          invite_link?: string | null;
          is_blocked?: boolean;
          tenant_id: string;
          updated_at?: string;
          whatsapp_avatar_url?: string | null;
        };
        Update: {
          agency_id?: string | null;
          created_at?: string;
          description?: string | null;
          group_chat_id?: string;
          group_name?: string;
          id?: string;
          invite_link?: string | null;
          is_blocked?: boolean;
          tenant_id?: string;
          updated_at?: string;
          whatsapp_avatar_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_groups_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_groups_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_sessions: {
        Row: {
          chat_id: string;
          conversation_history: Json | null;
          created_at: string | null;
          id: string;
          last_message_at: string | null;
          status: string | null;
          tenant_id: string;
        };
        Insert: {
          chat_id: string;
          conversation_history?: Json | null;
          created_at?: string | null;
          id?: string;
          last_message_at?: string | null;
          status?: string | null;
          tenant_id: string;
        };
        Update: {
          chat_id?: string;
          conversation_history?: Json | null;
          created_at?: string | null;
          id?: string;
          last_message_at?: string | null;
          status?: string | null;
          tenant_id?: string;
        };
        Relationships: [];
      };
      woocommerce_customers: {
        Row: {
          avatar_url: string | null;
          billing: Json | null;
          created_at: string | null;
          email: string | null;
          first_name: string | null;
          id: string;
          last_name: string | null;
          orders_count: number | null;
          raw_data: Json | null;
          role: string | null;
          shipping: Json | null;
          site_id: string;
          synced_at: string | null;
          tenant_id: string;
          total_spent: number | null;
          updated_at: string | null;
          username: string | null;
          woo_customer_id: number;
        };
        Insert: {
          avatar_url?: string | null;
          billing?: Json | null;
          created_at?: string | null;
          email?: string | null;
          first_name?: string | null;
          id?: string;
          last_name?: string | null;
          orders_count?: number | null;
          raw_data?: Json | null;
          role?: string | null;
          shipping?: Json | null;
          site_id: string;
          synced_at?: string | null;
          tenant_id: string;
          total_spent?: number | null;
          updated_at?: string | null;
          username?: string | null;
          woo_customer_id: number;
        };
        Update: {
          avatar_url?: string | null;
          billing?: Json | null;
          created_at?: string | null;
          email?: string | null;
          first_name?: string | null;
          id?: string;
          last_name?: string | null;
          orders_count?: number | null;
          raw_data?: Json | null;
          role?: string | null;
          shipping?: Json | null;
          site_id?: string;
          synced_at?: string | null;
          tenant_id?: string;
          total_spent?: number | null;
          updated_at?: string | null;
          username?: string | null;
          woo_customer_id?: number;
        };
        Relationships: [];
      };
      woocommerce_orders: {
        Row: {
          attribution: Json | null;
          billing: Json | null;
          created_at: string | null;
          currency: string | null;
          customer_email: string | null;
          customer_first_name: string | null;
          customer_id: number | null;
          customer_last_name: string | null;
          customer_phone: string | null;
          date_completed: string | null;
          date_created: string | null;
          date_modified: string | null;
          date_paid: string | null;
          discount_total: number | null;
          id: string;
          line_items: Json | null;
          order_number: string | null;
          payment_method: string | null;
          payment_method_title: string | null;
          raw_data: Json | null;
          shipping: Json | null;
          shipping_total: number | null;
          site_id: string;
          status: string | null;
          subtotal: number | null;
          synced_at: string | null;
          tenant_id: string;
          total: number | null;
          total_tax: number | null;
          updated_at: string | null;
          woo_order_id: number;
        };
        Insert: {
          attribution?: Json | null;
          billing?: Json | null;
          created_at?: string | null;
          currency?: string | null;
          customer_email?: string | null;
          customer_first_name?: string | null;
          customer_id?: number | null;
          customer_last_name?: string | null;
          customer_phone?: string | null;
          date_completed?: string | null;
          date_created?: string | null;
          date_modified?: string | null;
          date_paid?: string | null;
          discount_total?: number | null;
          id?: string;
          line_items?: Json | null;
          order_number?: string | null;
          payment_method?: string | null;
          payment_method_title?: string | null;
          raw_data?: Json | null;
          shipping?: Json | null;
          shipping_total?: number | null;
          site_id: string;
          status?: string | null;
          subtotal?: number | null;
          synced_at?: string | null;
          tenant_id: string;
          total?: number | null;
          total_tax?: number | null;
          updated_at?: string | null;
          woo_order_id: number;
        };
        Update: {
          attribution?: Json | null;
          billing?: Json | null;
          created_at?: string | null;
          currency?: string | null;
          customer_email?: string | null;
          customer_first_name?: string | null;
          customer_id?: number | null;
          customer_last_name?: string | null;
          customer_phone?: string | null;
          date_completed?: string | null;
          date_created?: string | null;
          date_modified?: string | null;
          date_paid?: string | null;
          discount_total?: number | null;
          id?: string;
          line_items?: Json | null;
          order_number?: string | null;
          payment_method?: string | null;
          payment_method_title?: string | null;
          raw_data?: Json | null;
          shipping?: Json | null;
          shipping_total?: number | null;
          site_id?: string;
          status?: string | null;
          subtotal?: number | null;
          synced_at?: string | null;
          tenant_id?: string;
          total?: number | null;
          total_tax?: number | null;
          updated_at?: string | null;
          woo_order_id?: number;
        };
        Relationships: [];
      };
      woocommerce_products: {
        Row: {
          categories: Json | null;
          created_at: string | null;
          id: string;
          images: Json | null;
          name: string | null;
          price: number | null;
          raw_data: Json | null;
          regular_price: number | null;
          sale_price: number | null;
          site_id: string;
          sku: string | null;
          slug: string | null;
          status: string | null;
          stock_quantity: number | null;
          stock_status: string | null;
          synced_at: string | null;
          tenant_id: string;
          total_sales: number | null;
          type: string | null;
          updated_at: string | null;
          woo_product_id: number;
        };
        Insert: {
          categories?: Json | null;
          created_at?: string | null;
          id?: string;
          images?: Json | null;
          name?: string | null;
          price?: number | null;
          raw_data?: Json | null;
          regular_price?: number | null;
          sale_price?: number | null;
          site_id: string;
          sku?: string | null;
          slug?: string | null;
          status?: string | null;
          stock_quantity?: number | null;
          stock_status?: string | null;
          synced_at?: string | null;
          tenant_id: string;
          total_sales?: number | null;
          type?: string | null;
          updated_at?: string | null;
          woo_product_id: number;
        };
        Update: {
          categories?: Json | null;
          created_at?: string | null;
          id?: string;
          images?: Json | null;
          name?: string | null;
          price?: number | null;
          raw_data?: Json | null;
          regular_price?: number | null;
          sale_price?: number | null;
          site_id?: string;
          sku?: string | null;
          slug?: string | null;
          status?: string | null;
          stock_quantity?: number | null;
          stock_status?: string | null;
          synced_at?: string | null;
          tenant_id?: string;
          total_sales?: number | null;
          type?: string | null;
          updated_at?: string | null;
          woo_product_id?: number;
        };
        Relationships: [];
      };
      woocommerce_sync_log: {
        Row: {
          created_at: string;
          customers_synced: number | null;
          error_message: string | null;
          finished_at: string | null;
          id: string;
          orders_synced: number | null;
          products_synced: number | null;
          site_id: string;
          started_at: string | null;
          status: string;
          sync_type: string;
          tenant_id: string;
        };
        Insert: {
          created_at?: string;
          customers_synced?: number | null;
          error_message?: string | null;
          finished_at?: string | null;
          id?: string;
          orders_synced?: number | null;
          products_synced?: number | null;
          site_id: string;
          started_at?: string | null;
          status?: string;
          sync_type?: string;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          customers_synced?: number | null;
          error_message?: string | null;
          finished_at?: string | null;
          id?: string;
          orders_synced?: number | null;
          products_synced?: number | null;
          site_id?: string;
          started_at?: string | null;
          status?: string;
          sync_type?: string;
          tenant_id?: string;
        };
        Relationships: [];
      };
      wordpress_sites_shared_tenants: {
        Row: {
          id: string;
          shared_at: string;
          shared_by: string | null;
          site_id: string;
          tenant_id: string;
        };
        Insert: {
          id?: string;
          shared_at?: string;
          shared_by?: string | null;
          site_id: string;
          tenant_id: string;
        };
        Update: {
          id?: string;
          shared_at?: string;
          shared_by?: string | null;
          site_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "wordpress_sites_shared_tenants_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "social_media_wordpress_sites";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wordpress_sites_shared_tenants_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      zoom_recordings: {
        Row: {
          agency_id: string | null;
          audio_file_path: string | null;
          audio_file_paths: string[] | null;
          calendar_event_id: string | null;
          calendar_matched_at: string | null;
          campaigner_ids: string[] | null;
          client_id: string | null;
          created_at: string;
          duration: number | null;
          file_path: string | null;
          file_size: number | null;
          folder_id: string | null;
          host_email: string | null;
          id: string;
          lead_id: string | null;
          meeting_id: string;
          meeting_topic: string | null;
          notes: string | null;
          recording_password: string | null;
          recording_type: string | null;
          recording_url: string | null;
          source: string;
          start_time: string | null;
          suggested_client_id: string | null;
          summary_file_url: string | null;
          summary_generated_at: string | null;
          summary_md: string | null;
          summary_scope: string | null;
          tenant_id: string;
          thumbnail_path: string | null;
          transcription: string | null;
          transcription_error: string | null;
          transcription_status: string | null;
          updated_at: string;
        };
        Insert: {
          agency_id?: string | null;
          audio_file_path?: string | null;
          audio_file_paths?: string[] | null;
          calendar_event_id?: string | null;
          calendar_matched_at?: string | null;
          campaigner_ids?: string[] | null;
          client_id?: string | null;
          created_at?: string;
          duration?: number | null;
          file_path?: string | null;
          file_size?: number | null;
          folder_id?: string | null;
          host_email?: string | null;
          id?: string;
          lead_id?: string | null;
          meeting_id: string;
          meeting_topic?: string | null;
          notes?: string | null;
          recording_password?: string | null;
          recording_type?: string | null;
          recording_url?: string | null;
          source?: string;
          start_time?: string | null;
          suggested_client_id?: string | null;
          summary_file_url?: string | null;
          summary_generated_at?: string | null;
          summary_md?: string | null;
          summary_scope?: string | null;
          tenant_id: string;
          thumbnail_path?: string | null;
          transcription?: string | null;
          transcription_error?: string | null;
          transcription_status?: string | null;
          updated_at?: string;
        };
        Update: {
          agency_id?: string | null;
          audio_file_path?: string | null;
          audio_file_paths?: string[] | null;
          calendar_event_id?: string | null;
          calendar_matched_at?: string | null;
          campaigner_ids?: string[] | null;
          client_id?: string | null;
          created_at?: string;
          duration?: number | null;
          file_path?: string | null;
          file_size?: number | null;
          folder_id?: string | null;
          host_email?: string | null;
          id?: string;
          lead_id?: string | null;
          meeting_id?: string;
          meeting_topic?: string | null;
          notes?: string | null;
          recording_password?: string | null;
          recording_type?: string | null;
          recording_url?: string | null;
          source?: string;
          start_time?: string | null;
          suggested_client_id?: string | null;
          summary_file_url?: string | null;
          summary_generated_at?: string | null;
          summary_md?: string | null;
          summary_scope?: string | null;
          tenant_id?: string;
          thumbnail_path?: string | null;
          transcription?: string | null;
          transcription_error?: string | null;
          transcription_status?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "zoom_recordings_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "zoom_recordings_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "zoom_recordings_folder_id_fkey";
            columns: ["folder_id"];
            isOneToOne: false;
            referencedRelation: "recording_folders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "zoom_recordings_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "zoom_recordings_suggested_client_id_fkey";
            columns: ["suggested_client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "zoom_recordings_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      advance_video_production: {
        Args: { p_item_id: string };
        Returns: string;
      };
      archive_leads: { Args: { p_lead_ids: string[] }; Returns: number };
      assign_role_by_email: {
        Args: {
          _email: string;
          _role: Database["public"]["Enums"]["app_role"];
        };
        Returns: string;
      };
      attach_video_scene_asset: {
        Args: {
          p_kind: string;
          p_meta?: Json;
          p_run_id?: string;
          p_scene_id: string;
          p_url: string;
        };
        Returns: {
          content: string | null;
          created_at: string;
          id: string;
          item_id: string;
          meta: Json;
          run_id: string | null;
          stage_id: string | null;
          tenant_id: string;
          type: string;
          url: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "marketing_assets";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      broadcast_dispatch_candidates: {
        Args: { p_limit: number };
        Returns: {
          attachments: Json;
          audience_filter: Json;
          automation_id: string | null;
          automation_step_key: string | null;
          body_html: string | null;
          body_text: string | null;
          channel: string;
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          daily_cap: number;
          from_email: string | null;
          from_name: string | null;
          html_mode: boolean;
          id: string;
          integration_id: string | null;
          last_error: string | null;
          media_url: string | null;
          name: string;
          origin: string;
          provider: string;
          reply_to: string | null;
          scheduled_at: string | null;
          started_at: string | null;
          stats: Json;
          status: string;
          subject: string | null;
          template_id: string | null;
          tenant_id: string;
          throttle_max_seconds: number;
          throttle_min_seconds: number;
          timezone: string;
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "broadcasts";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      broadcast_entity_matches: {
        Args: {
          p_entity_id: string;
          p_entity_type: string;
          p_filter: Json;
          p_tenant_id: string;
        };
        Returns: boolean;
      };
      broadcast_filter_hit: {
        Args: { p_current: string; p_mode: string; p_values: Json };
        Returns: boolean;
      };
      broadcast_list_add_members: {
        Args: { p_added_via?: string; p_list_id: string; p_rows: Json };
        Returns: number;
      };
      broadcast_list_sync_entity: {
        Args: {
          p_entity_id: string;
          p_entity_type: string;
          p_tenant_id: string;
        };
        Returns: undefined;
      };
      broadcast_matching_entity_ids: {
        Args: { p_entity_type: string; p_filter: Json; p_tenant_id: string };
        Returns: string[];
      };
      broadcast_normalize_phone: { Args: { p: string }; Returns: string };
      broadcast_reserve_automation_send: {
        Args: {
          p_automation_id: string;
          p_channel: string;
          p_min_interval_hours: number;
          p_name: string;
          p_provider: string;
          p_step_key: string;
          p_tenant_id: string;
        };
        Returns: { broadcast_id: string; reserved: boolean }[];
      };
      broadcast_tenant_has_synced_lists: {
        Args: { p_tenant_id: string };
        Returns: boolean;
      };
      bump_skill_usage_by_slug: {
        Args: { p_slugs: string[]; p_tenant_id: string };
        Returns: undefined;
      };
      can_access_agency: {
        Args: { _agency_id: string; _user_id: string };
        Returns: boolean;
      };
      can_manage_lead_archive: {
        Args: { _tenant_id: string };
        Returns: boolean;
      };
      can_manage_user_permissions: {
        Args: { target_user_id: string };
        Returns: boolean;
      };
      can_view_cross_tenant_campaigner: {
        Args: { _campaigner_id: string; _user_id?: string };
        Returns: boolean;
      };
      carmen_activate_system_graph: {
        Args: {
          p_expected_edges: number;
          p_expected_nodes: number;
          p_version: string;
        };
        Returns: Json;
      };
      carmen_fix_campaigner_access: {
        Args: {
          p_campaigner_id: string;
          p_client_id: string;
          p_tenant: string;
        };
        Returns: Json;
      };
      carmen_member_has_personal_key: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
      carmen_memory_decay_episodes: {
        Args: { p_lambda?: number };
        Returns: number;
      };
      carmen_normalize_staff_phone: {
        Args: { value: string };
        Returns: string;
      };
      carmen_query_system_graph: {
        Args: { p_depth?: number; p_limit?: number; p_query: string };
        Returns: {
          community_name: string;
          connections: Json;
          distance: number;
          file_type: string;
          label: string;
          node_id: string;
          source_file: string;
          source_location: string;
        }[];
      };
      carmen_send_activation: {
        Args: { p_integration: string; p_phone: string; p_tenant: string };
        Returns: Json;
      };
      check_circuit_breaker: {
        Args: { p_provider: string; p_tenant_id: string };
        Returns: boolean;
      };
      check_idempotency: {
        Args: { p_event_key: string; p_tenant_id: string };
        Returns: boolean;
      };
      check_rate_limit:
        | {
            Args: { p_resource_type: string; p_tenant_id: string };
            Returns: boolean;
          }
        | {
            Args: {
              p_default_max?: number;
              p_resource_type: string;
              p_tenant_id: string;
            };
            Returns: boolean;
          };
      claim_campaign_pulse_delivery: {
        Args: { p_tenant_id: string };
        Returns: boolean;
      };
      claim_client_retention_delivery: {
        Args: { p_tenant_id: string };
        Returns: boolean;
      };
      claim_health_digest_delivery: {
        Args: { p_tenant_id: string };
        Returns: boolean;
      };
      claim_next_job: {
        Args: { p_job_types?: string[] };
        Returns: {
          attempts: number;
          id: string;
          job_type: string;
          max_attempts: number;
          payload: Json;
          priority: number;
          tenant_id: string;
        }[];
      };
      claim_video_run: {
        Args: { p_kinds: string[]; p_worker?: string };
        Returns: {
          attempts: number;
          cost_usd: number;
          created_at: string;
          created_by: string | null;
          credits: number | null;
          error: string | null;
          finished_at: string | null;
          id: string;
          input: Json;
          item_id: string;
          kind: string | null;
          model: string | null;
          output: Json;
          provider: string | null;
          provider_job_id: string | null;
          scene_id: string | null;
          stage_id: string;
          started_at: string | null;
          status: string;
          tenant_id: string;
          tokens_in: number;
          tokens_out: number;
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "marketing_runs";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      claude_notify_david: {
        Args: { p_chat_id?: string; p_message: string; p_tenant?: string };
        Returns: Json;
      };
      cleanup_old_events: { Args: never; Returns: number };
      cleanup_old_jobs: { Args: never; Returns: number };
      client_update_documents_phone_call: {
        Args: { p_content: string };
        Returns: boolean;
      };
      complete_job: {
        Args: { p_error?: string; p_job_id: string; p_success: boolean };
        Returns: undefined;
      };
      copy_custom_fields_to_tenant: {
        Args: { _source_tenant_id: string; _target_tenant_id: string };
        Returns: undefined;
      };
      copy_tenant_template: {
        Args: { _source_tenant_id: string; _target_tenant_id: string };
        Returns: undefined;
      };
      count_leads_by_tags: {
        Args: {
          p_agency_ids?: string[];
          p_tag_ids: string[];
          p_tenant_id: string;
        };
        Returns: number;
      };
      create_client_with_assignment: {
        Args: {
          p_agency_id: string;
          p_contact_name?: string;
          p_email?: string;
          p_folder_link?: string;
          p_google_ads_account_id?: string;
          p_is_seo_client?: boolean;
          p_meta_ads_account_id?: string;
          p_monthly_budget?: number;
          p_name: string;
          p_notes?: string;
          p_phone?: string;
          p_retainer?: number;
          p_services?: string[];
          p_tenant_id: string;
          p_website?: string;
        };
        Returns: string;
      };
      decline_signature_by_token:
        | { Args: { _token: string }; Returns: Json }
        | { Args: { _ip: string; _token: string }; Returns: Json };
      enqueue_job: {
        Args: {
          p_job_type: string;
          p_max_attempts?: number;
          p_payload?: Json;
          p_priority?: number;
          p_tenant_id: string;
        };
        Returns: string;
      };
      extract_report_table_account_id: {
        Args: { p_integration_type: string; p_settings: Json };
        Returns: string;
      };
      find_campaign_tables: {
        Args: { p_client_ids: string[] };
        Returns: {
          client_id: string;
          integration_type: string;
          name: string;
          slug: string;
          table_id: string;
        }[];
      };
      find_phone_owner: {
        Args: { p_match_key: string; p_tenant_id: string };
        Returns: {
          client_id: string;
          lead_id: string;
        }[];
      };
      format_client_mood_status_label: {
        Args: { status: Database["public"]["Enums"]["client_mood_status"] };
        Returns: string;
      };
      generate_tracking_id: { Args: never; Returns: string };
      get_carmen_memory_counts: {
        Args: { p_tenant_id: string };
        Returns: {
          episode_count: number;
          pointer_count: number;
          total_count: number;
        }[];
      };
      get_channel_invite_by_token: { Args: { _token: string }; Returns: Json };
      get_chat_contacts:
        | {
            Args: never;
            Returns: {
              active_chat_provider: Database["public"]["Enums"]["chat_provider"];
              agency_id: string;
              agency_name: string;
              contact_id: string;
              contact_name: string;
              contact_type: string;
              email: string;
              is_blocked: boolean;
              last_message_at: string;
              manychat_subscriber_id: string;
              name: string;
              phone: string;
              unread_count: number;
            }[];
          }
        | {
            Args: { p_tenant_id?: string };
            Returns: {
              active_chat_provider: Database["public"]["Enums"]["chat_provider"];
              agency_id: string;
              agency_name: string;
              contact_id: string;
              contact_name: string;
              contact_type: string;
              email: string;
              is_blocked: boolean;
              last_message_at: string;
              manychat_subscriber_id: string;
              name: string;
              phone: string;
              unread_count: number;
              whatsapp_avatar_url: string;
            }[];
          }
        | {
            Args: {
              p_connection_user_ids: string[];
              p_provider: Database["public"]["Enums"]["chat_provider"];
              p_tenant_id: string;
            };
            Returns: {
              active_chat_provider: Database["public"]["Enums"]["chat_provider"];
              agency_id: string;
              agency_name: string;
              contact_id: string;
              contact_name: string;
              contact_type: string;
              email: string;
              is_blocked: boolean;
              last_message_at: string;
              manychat_subscriber_id: string;
              name: string;
              phone: string;
              sender_phone: string;
              unread_count: number;
              whatsapp_avatar_url: string;
            }[];
          };
      get_client_tenant_id: { Args: { _client_id: string }; Returns: string };
      get_cron_job_history: {
        Args: { p_jobid: number; p_limit?: number };
        Returns: {
          duration_ms: number;
          end_time: string;
          return_message: string;
          runid: number;
          start_time: string;
          status: string;
        }[];
      };
      get_cross_tenant_campaigner_ids: {
        Args: { p_user_id: string };
        Returns: string[];
      };
      get_effective_setting: {
        Args: { _setting_key: string; _tenant_id: string };
        Returns: Json;
      };
      get_effective_tenant_id: { Args: never; Returns: string };
      get_latest_client_call_updates: {
        Args: { p_client_ids: string[] };
        Returns: {
          client_id: string;
          last_client_call_at: string;
          last_client_call_by: string;
        }[];
      };
      get_lead_visitor_journey: {
        Args: { p_lead_id: string };
        Returns: {
          device_type: string;
          duration_seconds: number;
          events: Json;
          landing_page: string;
          page_count: number;
          pages: Json;
          referrer: string;
          session_id: string;
          started_at: string;
          utm_campaign: string;
          utm_medium: string;
          utm_source: string;
        }[];
      };
      get_leads_by_stages: {
        Args: {
          p_agency_ids?: string[];
          p_end_date?: string;
          p_follow_up_today?: boolean;
          p_from_date?: string;
          p_limit_per_stage?: number;
          p_offset_per_stage?: number;
          p_response_statuses?: string[];
          p_sales_person_ids?: string[];
          p_search_query?: string;
          p_stages?: string[];
          p_start_date?: string;
          p_tag_ids?: string[];
          p_tenant_id: string;
          p_to_date?: string;
        };
        Returns: Json;
      };
      get_leads_by_tags: {
        Args: {
          p_agency_ids?: string[];
          p_limit?: number;
          p_offset?: number;
          p_tag_ids: string[];
          p_tenant_id: string;
        };
        Returns: {
          active_chat_provider:
            Database["public"]["Enums"]["chat_provider"] | null;
          agency_id: string | null;
          archived_at: string | null;
          archived_by: string | null;
          attachments: Json;
          campaign_name: string | null;
          client_id: string | null;
          closing_date: string | null;
          company_name: string;
          contact_name: string | null;
          created_at: string;
          email: string | null;
          estimated_deal_value: number | null;
          facebook_form_id: string | null;
          facebook_leadgen_id: string | null;
          first_created_at: string | null;
          first_source: Database["public"]["Enums"]["lead_source"] | null;
          folder_link: string | null;
          folder_links: Json;
          follow_up_date: string | null;
          form_data: Json;
          form_qa_summary: string | null;
          general_status: string | null;
          id: string;
          industry: string | null;
          itai_meeting_date: string | null;
          lost_reason: string | null;
          manychat_subscriber_id: string | null;
          meeting_date: string | null;
          meeting_location: string | null;
          meeting_reminder_day_after_sent_at: string | null;
          meeting_reminder_same_day_sent_at: string | null;
          meeting_set_date: string | null;
          meeting_time: string | null;
          monthly_budget: number | null;
          notes: string | null;
          phone: string | null;
          products: string | null;
          proposal_date: string | null;
          proposal_sent_date: string | null;
          response_status: string | null;
          sale_date: string | null;
          sales_person_id: string | null;
          source: Database["public"]["Enums"]["lead_source"];
          status: string;
          tenant_id: string | null;
          three_month_budget: number | null;
          updated_at: string;
          whatsapp_avatar_url: string | null;
          won_date: string | null;
        }[];
        SetofOptions: {
          from: "*";
          to: "leads";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      get_signature_by_token: { Args: { _token: string }; Returns: Json };
      get_tenant_home_agency_id: {
        Args: { _tenant_id: string };
        Returns: string;
      };
      get_unknown_chat_contacts:
        | {
            Args: never;
            Returns: {
              agency_id: string;
              agency_name: string;
              contact_type: string;
              id: string;
              is_blocked: boolean;
              last_message_at: string;
              name: string;
              sender_phone: string;
              unread_count: number;
              whatsapp_avatar_url: string;
              wid: string;
            }[];
          }
        | {
            Args: { p_tenant_id: string };
            Returns: {
              agency_id: string;
              agency_name: string;
              contact_type: string;
              id: string;
              is_blocked: boolean;
              last_message_at: string;
              name: string;
              sender_phone: string;
              unread_count: number;
              whatsapp_avatar_url: string;
              wid: string;
            }[];
          };
      get_user_agency_ids: { Args: { _user_id: string }; Returns: string[] };
      get_user_campaigner_id: { Args: { _user_id: string }; Returns: string };
      get_user_client_ids: { Args: { _user_id: string }; Returns: string[] };
      get_user_sales_person_agency_ids: {
        Args: { _user_id: string };
        Returns: string[];
      };
      get_user_sales_person_id: { Args: { _user_id: string }; Returns: string };
      get_user_tenant_id: { Args: { _user_id: string }; Returns: string };
      graphify_group_subgraph: {
        Args: { p_group: string; p_limit?: number };
        Returns: Json;
      };
      graphify_is_admin: { Args: never; Returns: boolean };
      graphify_node_group: {
        Args: { p_community_name: string; p_source_file: string };
        Returns: string;
      };
      graphify_overview: { Args: never; Returns: Json };
      graphify_search: {
        Args: { p_depth?: number; p_limit?: number; p_query: string };
        Returns: Json;
      };
      has_finance_permission: { Args: { _user_id: string }; Returns: boolean };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      increment_skill_usage: {
        Args: { skill_ids: string[] };
        Returns: undefined;
      };
      initialize_all_tenants_menu_items: { Args: never; Returns: undefined };
      initialize_default_custom_fields: {
        Args: { _tenant_id: string };
        Returns: undefined;
      };
      initialize_default_pipeline_stages: {
        Args: { p_tenant_id: string };
        Returns: undefined;
      };
      initialize_tenant_lead_statuses: {
        Args: { _tenant_id: string };
        Returns: undefined;
      };
      initialize_tenant_menu_items: {
        Args: { _tenant_id: string };
        Returns: undefined;
      };
      initialize_tenant_pipeline_stages: {
        Args: { _tenant_id: string };
        Returns: undefined;
      };
      initialize_tenant_terminology: {
        Args: { _business_type?: string; _tenant_id: string };
        Returns: undefined;
      };
      initialize_tenant_terminology_from_preset: {
        Args: { _preset_id: string; _tenant_id: string };
        Returns: undefined;
      };
      is_automation_shared_to_tenant: {
        Args: { _automation_id: string; _tenant_id: string };
        Returns: boolean;
      };
      is_channel_member: {
        Args: { p_channel_id: string; p_user_id: string };
        Returns: boolean;
      };
      is_root_tenant: { Args: { tenant_id: string }; Returns: boolean };
      is_seo_staff: { Args: { _user_id: string }; Returns: boolean };
      is_super_admin: { Args: { _user_id: string }; Returns: boolean };
      is_user_admin_of_automation_source_tenant: {
        Args: { _automation_id: string; _user_id: string };
        Returns: boolean;
      };
      is_user_in_automation_source_tenant: {
        Args: { _automation_id: string; _user_id: string };
        Returns: boolean;
      };
      kb_match_pointers: {
        Args: {
          p_category?: string;
          p_limit?: number;
          p_query_embedding: string;
          p_since_days?: number;
          p_tenant_id: string;
        };
        Returns: {
          category: string;
          entity_id: string;
          entity_type: string;
          id: string;
          path: string;
          ref_date: string;
          similarity: number;
          subcategory: string;
          summary: string;
          title: string;
        }[];
      };
      kick_internal_function: {
        Args: { p_body: Json; p_function: string };
        Returns: number;
      };
      lead_origin_tag_names: {
        Args: { p_campaign_name: string; p_source: string };
        Returns: string[];
      };
      lead_source_tag_name: { Args: { p_source: string }; Returns: string };
      link_visitor_to_lead: {
        Args: {
          p_lead_id: string;
          p_tracking_id: string;
          p_visitor_fingerprint: string;
        };
        Returns: string;
      };
      list_system_cron_jobs: {
        Args: never;
        Returns: {
          active: boolean;
          command: string;
          fail_count_7d: number;
          jobid: number;
          jobname: string;
          last_duration_ms: number;
          last_return_message: string;
          last_run_at: string;
          last_status: string;
          schedule: string;
          success_count_7d: number;
        }[];
      };
      log_signature_event: {
        Args: {
          _document_id: string;
          _event_type: string;
          _ip?: string;
          _metadata?: Json;
          _recipient_id: string;
        };
        Returns: undefined;
      };
      mark_all_chats_read: { Args: { p_tenant_id: string }; Returns: number };
      mark_automation_log_delivery_failure: {
        Args: { p_error: Json; p_provider_message_id: string };
        Returns: boolean;
      };
      match_agent_memory: {
        Args: {
          p_agent_id: string;
          p_limit?: number;
          p_query_embedding: string;
        };
        Returns: {
          category: string;
          id: string;
          importance: number;
          similarity: number;
          summary: string;
          title: string;
        }[];
      };
      match_agent_tools: {
        Args: { match_count?: number; query_embedding: string };
        Returns: {
          similarity: number;
          tool_name: string;
        }[];
      };
      merge_assigned_campaigner_duplicate: {
        Args: { p_canonical: string; p_duplicate: string };
        Returns: string;
      };
      merge_duplicate_campaigner_pair: {
        Args: { p_left: string; p_right: string };
        Returns: string;
      };
      merge_orphan_profile_by_email: {
        Args: { _auth_user_id: string; _email: string };
        Returns: undefined;
      };
      migrate_storyboard_to_video_scenes: {
        Args: { p_item_id?: string };
        Returns: number;
      };
      next_task_recurrence_date: {
        Args: {
          as_of_date?: string;
          base_date: string;
          frequency: string;
          frequency_interval: number;
          monthday?: number;
          weekday?: number;
        };
        Returns: string;
      };
      normalize_google_customer_id: { Args: { raw: string }; Returns: string };
      normalize_meta_ad_account_id: { Args: { raw: string }; Returns: string };
      permanently_delete_archived_leads: {
        Args: { p_lead_ids: string[] };
        Returns: number;
      };
      phone_match_key: { Args: { p_phone: string }; Returns: string };
      produce_video: {
        Args: {
          p_aspect?: string;
          p_estimate?: Json;
          p_generate_audio?: boolean;
          p_item_id: string;
          p_music_prompt?: string;
          p_provider?: string;
          p_stage_id?: string;
          p_voice_id?: string;
          p_with_music?: boolean;
          p_with_voice?: boolean;
        };
        Returns: Json;
      };
      queue_video_clips: {
        Args: {
          p_aspect?: string;
          p_estimate?: Json;
          p_generate_audio?: boolean;
          p_item_id: string;
          p_provider?: string;
          p_scene_ids: string[];
          p_stage_id?: string;
        };
        Returns: {
          attempts: number;
          cost_usd: number;
          created_at: string;
          created_by: string | null;
          credits: number | null;
          error: string | null;
          finished_at: string | null;
          id: string;
          input: Json;
          item_id: string;
          kind: string | null;
          model: string | null;
          output: Json;
          provider: string | null;
          provider_job_id: string | null;
          scene_id: string | null;
          stage_id: string;
          started_at: string | null;
          status: string;
          tenant_id: string;
          tokens_in: number;
          tokens_out: number;
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "marketing_runs";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      queue_video_render: {
        Args: { p_aspect?: string; p_item_id: string; p_stage_id?: string };
        Returns: {
          attempts: number;
          cost_usd: number;
          created_at: string;
          created_by: string | null;
          credits: number | null;
          error: string | null;
          finished_at: string | null;
          id: string;
          input: Json;
          item_id: string;
          kind: string | null;
          model: string | null;
          output: Json;
          provider: string | null;
          provider_job_id: string | null;
          scene_id: string | null;
          stage_id: string;
          started_at: string | null;
          status: string;
          tenant_id: string;
          tokens_in: number;
          tokens_out: number;
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "marketing_runs";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      queue_video_sound: {
        Args: {
          p_estimate?: Json;
          p_item_id: string;
          p_kind: string;
          p_prompt?: string;
          p_provider?: string;
          p_scene_ids?: string[];
          p_stage_id?: string;
          p_voice_id?: string;
        };
        Returns: {
          attempts: number;
          cost_usd: number;
          created_at: string;
          created_by: string | null;
          credits: number | null;
          error: string | null;
          finished_at: string | null;
          id: string;
          input: Json;
          item_id: string;
          kind: string | null;
          model: string | null;
          output: Json;
          provider: string | null;
          provider_job_id: string | null;
          scene_id: string | null;
          stage_id: string;
          started_at: string | null;
          status: string;
          tenant_id: string;
          tokens_in: number;
          tokens_out: number;
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "marketing_runs";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      record_integration_failure: {
        Args: { p_provider: string; p_tenant_id: string };
        Returns: undefined;
      };
      record_integration_result: {
        Args: {
          p_cooldown_minutes?: number;
          p_failure_threshold?: number;
          p_provider: string;
          p_success: boolean;
          p_tenant_id: string;
        };
        Returns: undefined;
      };
      record_integration_success: {
        Args: { p_provider: string; p_tenant_id: string };
        Returns: undefined;
      };
      release_manychat_destination_lock: {
        Args: { p_destination_key: string };
        Returns: undefined;
      };
      restore_archived_leads: {
        Args: { p_lead_ids: string[] };
        Returns: number;
      };
      run_ddl_once: { Args: { sql: string }; Returns: string };
      run_system_cron_job_now: { Args: { p_jobid: number }; Returns: string };
      save_video_storyboard: {
        Args: { p_item_id: string; p_scenes: Json };
        Returns: {
          clip_asset_id: string | null;
          clip_stale: boolean;
          created_at: string;
          created_by: string | null;
          duration_s: number;
          focal_x: number;
          id: string;
          item_id: string;
          locked: boolean;
          meta: Json;
          motion_prompt: string;
          overlay_text: string;
          position: number;
          shot: string;
          status: Database["public"]["Enums"]["marketing_video_scene_status"];
          still_asset_id: string | null;
          tenant_id: string;
          title: string;
          updated_at: string;
          visual_prompt: string;
          voice_asset_id: string | null;
          voiceover_text: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "marketing_video_scenes";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      search_contacts_for_chat:
        | {
            Args: { p_search_term: string };
            Returns: {
              active_chat_provider: Database["public"]["Enums"]["chat_provider"];
              agency_id: string;
              agency_name: string;
              contact_id: string;
              contact_name: string;
              contact_type: string;
              email: string;
              has_messages: boolean;
              is_blocked: boolean;
              last_message_at: string;
              manychat_subscriber_id: string;
              name: string;
              phone: string;
              unread_count: number;
            }[];
          }
        | {
            Args: { p_search_term: string; p_tenant_id?: string };
            Returns: {
              active_chat_provider: Database["public"]["Enums"]["chat_provider"];
              agency_id: string;
              agency_name: string;
              contact_id: string;
              contact_name: string;
              contact_type: string;
              email: string;
              has_messages: boolean;
              is_blocked: boolean;
              last_message_at: string;
              manychat_subscriber_id: string;
              name: string;
              phone: string;
              sender_phone: string;
              unread_count: number;
              whatsapp_avatar_url: string;
            }[];
          };
      set_video_production: {
        Args: { p_item_id: string; p_patch: Json };
        Returns: Json;
      };
      signature_png_is_valid: { Args: { _value: string }; Returns: boolean };
      submit_signature_by_token:
        | {
            Args: { _ip?: string; _signature_data: string; _token: string };
            Returns: Json;
          }
        | {
            Args: {
              _field_values?: Json;
              _ip?: string;
              _signature_data: string;
              _token: string;
            };
            Returns: Json;
          };
      sync_lead_origin_tags_for_lead: {
        Args: { p_lead_id: string };
        Returns: undefined;
      };
      tenant_can_use_integration: {
        Args: { p_integration_id: string; p_tenant_id: string };
        Returns: boolean;
      };
      try_acquire_manychat_destination_lock: {
        Args: { p_destination_key: string; p_ttl_seconds?: number };
        Returns: boolean;
      };
      update_system_cron_job: {
        Args: { p_active?: boolean; p_jobid: number; p_schedule?: string };
        Returns: undefined;
      };
      user_can_access_client: {
        Args: { _client_id: string; _user_id: string };
        Returns: boolean;
      };
      user_can_access_crm_table: {
        Args: { _table_id: string; _user_id: string };
        Returns: boolean;
      };
      user_can_annotate_lead: { Args: { _lead_id: string }; Returns: boolean };
      user_can_delete_users_for_tenant: {
        Args: { check_tenant_id: string };
        Returns: boolean;
      };
      user_can_manage_campaigners_for_tenant: {
        Args: { check_tenant_id: string };
        Returns: boolean;
      };
      user_can_manage_crm_dashboard: {
        Args: {
          _agency_id: string;
          _client_id: string;
          _tenant_id: string;
          _user_id: string;
        };
        Returns: boolean;
      };
      user_can_view_campaigner: {
        Args: { _campaigner_id: string; _user_id: string };
        Returns: boolean;
      };
      user_has_agency_access: {
        Args: { _agency_id: string; _user_id: string };
        Returns: boolean;
      };
      user_has_calendar_access: {
        Args: {
          _accessor_user_id: string;
          _owner_user_id: string;
          _required_permission?: string;
        };
        Returns: boolean;
      };
      user_has_cross_tenant_agency_access: {
        Args: { _agency_id: string; _user_id: string };
        Returns: boolean;
      };
      user_has_cross_tenant_client_access: {
        Args: { p_client_id: string; p_user_id: string };
        Returns: boolean;
      };
      user_has_cross_tenant_integration_access: {
        Args: { _integration_tenant_id: string; _user_id: string };
        Returns: boolean;
      };
      user_has_integration_access: {
        Args: { p_integration_id: string };
        Returns: boolean;
      };
      user_has_integration_permission: {
        Args: { p_integration_id: string; p_user_id: string };
        Returns: boolean;
      };
      user_has_seo_scope: { Args: { _user_id: string }; Returns: boolean };
      user_is_restricted_client_viewer: {
        Args: { _user_id: string };
        Returns: boolean;
      };
      user_is_tenant_member: {
        Args: { check_tenant_id: string };
        Returns: boolean;
      };
      user_manages_agency: {
        Args: { _agency_id: string; _user_id: string };
        Returns: boolean;
      };
      user_owns_agency: {
        Args: { _agency_id: string; _user_id: string };
        Returns: boolean;
      };
      user_owns_integration: {
        Args: { p_integration_id: string };
        Returns: boolean;
      };
      validate_crm_record: {
        Args: { p_data: Json; p_table_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      agency_status: "active" | "paused" | "former";
      agent_memory_layer: "working" | "episodic" | "semantic" | "user_model";
      app_role:
        | "owner"
        | "agency_owner"
        | "team_manager"
        | "campaigner"
        | "sales_person"
        | "super_admin"
        | "seo";
      automation_action:
        | "webhook"
        | "email"
        | "notification"
        | "update_status"
        | "send_whatsapp"
        | "create_manychat_subscriber"
        | "send_greenapi_message"
        | "add_lead_update"
        | "add_client_update"
        | "send_greenapi_to_campaigner"
        | "create_task"
        | "create_lead"
        | "send_telegram"
        | "send_meta_whatsapp_message"
        | "send_signature";
      automation_trigger:
        | "task_assigned"
        | "task_status_changed"
        | "lead_status_changed"
        | "lead_created"
        | "client_created"
        | "client_status_changed"
        | "onboarding_status_changed"
        | "meeting_created"
        | "task_calendar_created"
        | "task_overdue"
        | "meeting_day_after"
        | "meeting_same_day"
        | "inbound_webhook_task"
        | "inbound_webhook_lead"
        | "manual_command"
        | "whatsapp_message_received"
        | "carmen_whatsapp_session"
        | "telegram_message_received"
        | "account_stopped_spending"
        | "ad_account_billing_issue"
        | "ad_account_blocked"
        | "integration_disconnected";
      chat_provider:
        "manychat" | "green_api" | "internal" | "manus_wa" | "meta_whatsapp";
      client_mood_status:
        "happy" | "wavering" | "churn_risk" | "not_progressing";
      client_status: "active" | "paused" | "ended" | "onboarding" | "inactive";
      client_tier: "A" | "B" | "C";
      communication_status: "normal" | "sensitive" | "complaint";
      finance_type: "income" | "expense";
      interaction_type:
        | "client_initiated"
        | "campaigner_initiated"
        | "call"
        | "whatsapp"
        | "meeting"
        | "other"
        | "system_alert";
      job_priority: "critical" | "high" | "medium" | "low";
      job_status: "queued" | "running" | "done" | "failed" | "dead_letter";
      job_type: "user_action" | "workflow" | "integration" | "heavy_job";
      lead_response_status:
        | "no_answer_1"
        | "no_answer_2"
        | "no_answer_3"
        | "no_answer_4"
        | "denies_contact"
        | "not_relevant"
        | "in_progress";
      lead_source:
        | "website"
        | "referral"
        | "social_media"
        | "paid_ads"
        | "cold_call"
        | "email_campaign"
        | "event"
        | "other"
        | "whatsapp";
      lead_status:
        | "new"
        | "contacted"
        | "follow_up"
        | "proposal_sent"
        | "closed"
        | "transferred_to_onboarding"
        | "meeting_scheduled"
        | "negotiation";
      marketing_approval_mode: "manual" | "auto" | "hybrid";
      marketing_item_status:
        | "draft"
        | "in_progress"
        | "waiting_approval"
        | "approved"
        | "published"
        | "failed"
        | "archived";
      marketing_stage_type:
        | "strategy"
        | "copy"
        | "creative"
        | "target_paid"
        | "target_seo"
        | "target_organic"
        | "measurement";
      marketing_video_scene_status:
        | "draft"
        | "still_generating"
        | "still_ready"
        | "still_approved"
        | "clip_generating"
        | "clip_ready"
        | "clip_approved"
        | "failed";
      onboarding_status:
        | "research_meeting"
        | "receiving_access"
        | "setup_and_content"
        | "campaign_live";
      org_type: "root" | "organization" | "sub_organization";
      payment_method: "cash" | "card" | "wire" | "check";
      priority_level: "high" | "medium" | "low";
      seo_monthly_status: "up" | "stable" | "down";
      supplier_type:
        "campaigner" | "media" | "design" | "creative" | "dev" | "other";
      task_status: "open" | "in_progress" | "done";
      task_type: "campaign" | "collection" | "creative" | "other";
      tenant_status: "active" | "inactive" | "suspended" | "trial";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      agency_status: ["active", "paused", "former"],
      agent_memory_layer: ["working", "episodic", "semantic", "user_model"],
      app_role: [
        "owner",
        "agency_owner",
        "team_manager",
        "campaigner",
        "sales_person",
        "super_admin",
        "seo",
      ],
      automation_action: [
        "webhook",
        "email",
        "notification",
        "update_status",
        "send_whatsapp",
        "create_manychat_subscriber",
        "send_greenapi_message",
        "add_lead_update",
        "add_client_update",
        "send_greenapi_to_campaigner",
        "create_task",
        "create_lead",
        "send_telegram",
        "send_meta_whatsapp_message",
        "send_signature",
      ],
      automation_trigger: [
        "task_assigned",
        "task_status_changed",
        "lead_status_changed",
        "lead_created",
        "client_created",
        "client_status_changed",
        "onboarding_status_changed",
        "meeting_created",
        "task_calendar_created",
        "task_overdue",
        "meeting_day_after",
        "meeting_same_day",
        "inbound_webhook_task",
        "inbound_webhook_lead",
        "manual_command",
        "whatsapp_message_received",
        "carmen_whatsapp_session",
        "telegram_message_received",
        "account_stopped_spending",
        "ad_account_billing_issue",
        "ad_account_blocked",
        "integration_disconnected",
      ],
      chat_provider: [
        "manychat",
        "green_api",
        "internal",
        "manus_wa",
        "meta_whatsapp",
      ],
      client_mood_status: [
        "happy",
        "wavering",
        "churn_risk",
        "not_progressing",
      ],
      client_status: ["active", "paused", "ended", "onboarding", "inactive"],
      client_tier: ["A", "B", "C"],
      communication_status: ["normal", "sensitive", "complaint"],
      finance_type: ["income", "expense"],
      interaction_type: [
        "client_initiated",
        "campaigner_initiated",
        "call",
        "whatsapp",
        "meeting",
        "other",
        "system_alert",
      ],
      job_priority: ["critical", "high", "medium", "low"],
      job_status: ["queued", "running", "done", "failed", "dead_letter"],
      job_type: ["user_action", "workflow", "integration", "heavy_job"],
      lead_response_status: [
        "no_answer_1",
        "no_answer_2",
        "no_answer_3",
        "no_answer_4",
        "denies_contact",
        "not_relevant",
        "in_progress",
      ],
      lead_source: [
        "website",
        "referral",
        "social_media",
        "paid_ads",
        "cold_call",
        "email_campaign",
        "event",
        "other",
        "whatsapp",
      ],
      lead_status: [
        "new",
        "contacted",
        "follow_up",
        "proposal_sent",
        "closed",
        "transferred_to_onboarding",
        "meeting_scheduled",
        "negotiation",
      ],
      marketing_approval_mode: ["manual", "auto", "hybrid"],
      marketing_item_status: [
        "draft",
        "in_progress",
        "waiting_approval",
        "approved",
        "published",
        "failed",
        "archived",
      ],
      marketing_stage_type: [
        "strategy",
        "copy",
        "creative",
        "target_paid",
        "target_seo",
        "target_organic",
        "measurement",
      ],
      marketing_video_scene_status: [
        "draft",
        "still_generating",
        "still_ready",
        "still_approved",
        "clip_generating",
        "clip_ready",
        "clip_approved",
        "failed",
      ],
      onboarding_status: [
        "research_meeting",
        "receiving_access",
        "setup_and_content",
        "campaign_live",
      ],
      org_type: ["root", "organization", "sub_organization"],
      payment_method: ["cash", "card", "wire", "check"],
      priority_level: ["high", "medium", "low"],
      seo_monthly_status: ["up", "stable", "down"],
      supplier_type: [
        "campaigner",
        "media",
        "design",
        "creative",
        "dev",
        "other",
      ],
      task_status: ["open", "in_progress", "done"],
      task_type: ["campaign", "collection", "creative", "other"],
      tenant_status: ["active", "inactive", "suspended", "trial"],
    },
  },
} as const;
