// Hand-written to match supabase/migrations/0001_init.sql.
// Regenerate with `supabase gen types typescript` once a real project exists
// if these ever drift from the actual schema.
//
// Every table needs `Relationships` and the schema needs Views/Functions/
// Enums/CompositeTypes present (even if empty) - @supabase/supabase-js's
// generic constraints silently collapse Row/Insert/Update to `never`
// without them.

export type UserRole = "salesperson" | "approver";

export type ProposalStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "client_rejected"
  | "awaiting_reproposal"
  | "reproposal_sent";

export type SectionKey =
  | "introduction"
  | "proposed_solution"
  | "deliverables"
  | "timeline"
  | "pricing"
  | "next_steps";

export type GenerationStatus = "generated" | "scanty" | "missing";

export type ApprovalDecision = "approved" | "rejected";

export type DeliveryEventType =
  | "pdf_generated"
  | "access_code_sent"
  | "client_notification_sent"
  | "access_verified"
  | "proposal_viewed";

export type DeliveryStatus = "success" | "failed";

export type NotificationEventType =
  | "approval_requested"
  | "approved"
  | "rejected"
  | "generation_complete"
  | "client_rejection_flagged"
  | "revision_unlocked"
  | "client_response_reminder"
  | "approval_reminder";

export type RevisionDecision = "pending" | "unlocked" | "declined";

export type ClientResponseStatus = "pending" | "accepted" | "rejected";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: UserRole;
          first_name: string;
          last_name: string;
          email: string;
          created_at: string;
        };
        Insert: {
          id: string;
          role: UserRole;
          first_name: string;
          last_name: string;
          email: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      proposals: {
        Row: {
          id: string;
          created_by: string;
          status: ProposalStatus;
          client_first_name: string | null;
          client_last_name: string | null;
          client_email: string | null;
          company_name: string | null;
          date_of_call: string | null;
          salesperson_name: string | null;
          proposed_timeline: string | null;
          estimated_pricing: string | null;
          client_needs_summary: string | null;
          project_scope: string | null;
          goals_and_objectives: string | null;
          recommended_services: string | null;
          call_transcript: string | null;
          approver_note: string | null;
          client_response_status: ClientResponseStatus | null;
          approved_at: string | null;
          last_client_response_reminder_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["proposals"]["Row"]> & {
          created_by: string;
        };
        Update: Partial<Database["public"]["Tables"]["proposals"]["Row"]>;
        Relationships: [];
      };
      proposal_sections: {
        Row: {
          id: string;
          proposal_id: string;
          section_key: SectionKey;
          content: string | null;
          source_fields: unknown[];
          generation_status: GenerationStatus;
          scanty_reason: string | null;
          regeneration_count: number;
          version: number;
          previous_content: string | null;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["proposal_sections"]["Row"]> & {
          proposal_id: string;
          section_key: SectionKey;
        };
        Update: Partial<Database["public"]["Tables"]["proposal_sections"]["Row"]>;
        Relationships: [];
      };
      approvals: {
        Row: {
          id: string;
          proposal_id: string;
          approver_id: string;
          decision: ApprovalDecision;
          note: string | null;
          decided_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["approvals"]["Row"]> & {
          proposal_id: string;
          approver_id: string;
          decision: ApprovalDecision;
        };
        Update: Partial<Database["public"]["Tables"]["approvals"]["Row"]>;
        Relationships: [];
      };
      access_grants: {
        Row: {
          id: string;
          proposal_id: string;
          client_email: string;
          verification_code_hash: string;
          expires_at: string;
          verified_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["access_grants"]["Row"]> & {
          proposal_id: string;
          client_email: string;
          verification_code_hash: string;
          expires_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["access_grants"]["Row"]>;
        Relationships: [];
      };
      delivery_log: {
        Row: {
          id: string;
          proposal_id: string;
          event_type: DeliveryEventType;
          status: DeliveryStatus;
          detail: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["delivery_log"]["Row"]> & {
          proposal_id: string;
          event_type: DeliveryEventType;
          status: DeliveryStatus;
        };
        Update: Partial<Database["public"]["Tables"]["delivery_log"]["Row"]>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          recipient_user_id: string | null;
          proposal_id: string | null;
          event_type: NotificationEventType;
          status: DeliveryStatus;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["notifications"]["Row"]> & {
          event_type: NotificationEventType;
          status: DeliveryStatus;
        };
        Update: Partial<Database["public"]["Tables"]["notifications"]["Row"]>;
        Relationships: [];
      };
      revision_requests: {
        Row: {
          id: string;
          proposal_id: string;
          requested_by: string;
          evidence: string;
          decided_by: string | null;
          decision: RevisionDecision;
          created_at: string;
          decided_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["revision_requests"]["Row"]> & {
          proposal_id: string;
          requested_by: string;
          evidence: string;
        };
        Update: Partial<Database["public"]["Tables"]["revision_requests"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
      proposal_status: ProposalStatus;
      section_key: SectionKey;
      generation_status: GenerationStatus;
      approval_decision: ApprovalDecision;
      delivery_event_type: DeliveryEventType;
      delivery_status: DeliveryStatus;
      notification_event_type: NotificationEventType;
      revision_decision: RevisionDecision;
      client_response_status: ClientResponseStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
