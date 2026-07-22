export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
  preferences?: Record<string, unknown>;
}

export interface Contact {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  tags: string[];
  notes: string | null;
  created_at: string;
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

export type FilterOp =
  | 'contains' | 'not_contains' | 'is' | 'is_not' | 'is_empty' | 'is_not_empty'
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'before' | 'after';

export interface FilterCondition {
  field: string;
  op: FilterOp;
  value?: string | number;
}
