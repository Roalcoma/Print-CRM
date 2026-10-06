export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
  orgName?: string | null;
  permissions?: string[];
  mustChangePassword?: boolean;
}

export interface AdRef {
  title: string | null;
  body: string | null;
  source_app: string | null;
  source_type: string | null;
  source_url: string | null;
  source_id: string | null;
  media_url: string | null;
  thumbnail: string | null;
  greeting: string | null;
}

export interface Stage { id: string; pipeline_id: string; name: string; position: number; color: string }
export interface Pipeline { id: string; name: string; stages: Stage[] }

export interface Opportunity {
  id: string;
  pipeline_id: string;
  stage_id: string;
  contact_id: string | null;
  title: string;
  value: string | number | null;
  status: 'open' | 'won' | 'lost';
  created_at: string;
  source: string | null;
  business_name: string | null;
  owner_name: string | null;
  notes_count: number;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_ad_source?: AdRef | null;
}

export interface OppTotal { stage_id: string; status: string; count: number; value: number }
export interface OppPage { opportunities: Opportunity[]; totals: OppTotal[] }

export interface Note { id: string; body: string; author_name: string | null; created_at: string }

export interface Contact {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string | null;
  ad_source?: AdRef | null;
}

export type Channel = 'whatsapp' | 'instagram_dm' | 'facebook_dm';

export interface Conversation {
  id: string;
  contact_id: string | null;
  display_name: string;
  contact_full_name: string | null;
  phone: string | null;
  channel: Channel | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  status: string;
}

export interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  msg_type: string;
  body: string | null;
  media_mime: string | null;
  media_filename: string | null;
  status: string | null;
  sender_name: string | null;
  created_at: string;
  pending?: boolean;
}

export interface NotificationPrefs {
  new_lead: boolean;
  new_message: boolean;
  appointment: boolean;
  task: boolean;
  system: boolean;
}
