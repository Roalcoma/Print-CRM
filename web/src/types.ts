export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
  preferences?: Record<string, unknown>;
  permissions?: string[];
  created_at?: string;
}

export interface Contact {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  email_secondary: string | null;
  phone_secondary: string | null;
  company: string | null;
  position: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  birthday: string | null;
  linkedin: string | null;
  twitter: string | null;
  instagram: string | null;
  website: string | null;
  source: string | null;
  status: 'active' | 'inactive' | 'blocked';
  avatar_color: string | null;
  tags: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactFile {
  id: string;
  contact_id: string;
  organization_id: string;
  name: string;
  url: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export interface ContactStats {
  total: number;
  active: number;
  inactive: number;
  new_this_month: number;
  companies: number;
  by_source: { source: string; count: number }[];
}

export interface Stage {
  id: string;
  pipeline_id: string;
  name: string;
  position: number;
  color: string;
}

export interface Pipeline {
  id: string;
  name: string;
  created_at?: string;
  updated_at?: string;
  stages: Stage[];
}

export interface Opportunity {
  id: string;
  pipeline_id: string;
  stage_id: string;
  contact_id: string | null;
  title: string;
  value: string; // NUMERIC llega como string desde pg
  status: 'open' | 'won' | 'lost';
  position: number;
  created_at: string;
  source: string | null;
  business_name: string | null;
  tags: string[];
  owner_id: string | null;
  owner_name: string | null;
  notes_count: number;
  followers: { id: string; name: string }[];
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
}

export interface Note {
  id: string;
  opportunity_id: string;
  body: string;
  author_name: string | null;
  created_at: string;
}

export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'cancelled';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  assignees: { id: string; name: string }[];
  opportunity_id: string | null;
  opportunity_title: string | null;
  due_at: string | null;
  status: TaskStatus;
  task_type: string | null;
  priority: 'high' | 'medium' | 'low';
  reminder: string | null;
  completed_at: string | null;
  created_at: string;
}

export type FilterOp =
  | 'contains' | 'not_contains' | 'is' | 'is_not' | 'is_empty' | 'is_not_empty'
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'before' | 'after';

export interface FilterCondition {
  field: string;
  op: FilterOp;
  value?: string | number;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read_at: string | null;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
}

export interface CalendarAvailability {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

export interface Calendar {
  id: string;
  organization_id: string;
  user_id: string;
  owner_name: string;
  owner_email?: string;
  name: string;
  color: string;
  slug: string;
  timezone: string;
  description: string | null;
  is_active: boolean;
  booking_enabled: boolean;
  duration_minutes: number;
  buffer_minutes: number;
  min_notice_hours: number;
  max_advance_days: number;
  custom_message: string | null;
  logo_url: string | null;
  availability: CalendarAvailability[];
  created_at: string;
}

export interface Conversation {
  id: string;
  organization_id: string;
  contact_id: string | null;
  wa_chat_id: string;
  display_name: string;
  phone: string | null;
  avatar_url: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  status: 'open' | 'closed' | 'archived';
  starred: boolean;
  created_at: string;
  updated_at: string;
  contact_full_name?: string | null;
}

export interface ConvMessage {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  msg_type: string;
  body: string | null;
  media_url: string | null;
  media_mime: string | null;
  media_filename: string | null;
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'received';
  sender_name: string | null;
  created_at: string;
}

export interface WASettings {
  id: string;
  evo_url: string;
  instance_name: string;
  session_status: 'disconnected' | 'connecting' | 'qr' | 'connected';
  webhook_secret: string;
  has_api_key: boolean;
  created_at: string;
  updated_at: string;
}

export interface Appointment {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  timezone: string;
  is_all_day: boolean;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  provider: 'manual' | 'google' | 'zoom';
  meeting_url: string | null;
  location: string | null;
  contact_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  opportunity_id: string | null;
  opportunity_title: string | null;
  user_id: string;
  user_name: string | null;
  recurrence_type: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  recurrence_days: number[] | null;
  recurrence_end_at: string | null;
  recurrence_count: number | null;
  parent_id: string | null;
  calendar_id: string | null;
}
