export interface Env {
  DB: D1Database;
  APP_SECRET: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string; // JWK JSON
  VAPID_SUBJECT?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM_NUMBER?: string;
  PUBLIC_URL?: string;
  /** Test hook: replaces global fetch for outbound calls (push services, Twilio). */
  OUTBOUND?: typeof fetch;
  /** Test hook: fixed clock. */
  NOW?: () => number;
}

export type Status = 'not_started' | 'in_progress' | 'done';
export const STATUSES: Status[] = ['not_started', 'in_progress', 'done'];
export const STATUS_WORD: Record<Status, string> = {
  not_started: 'not started',
  in_progress: 'in progress',
  done: 'done',
};
export type Via = 'app' | 'claude' | 'push' | 'text' | 'auto';

export interface Person {
  id: number;
  name: string;
  role: 'owner' | 'member';
  icon?: string | null;
  epoch: number;
  phone: string | null;
  notify_push: number;
  notify_sms: number;
  sms_stopped: number;
  last_digest_on: string | null;
  created_at: number;
  removed_at: number | null;
}

export interface Task {
  id: number;
  title: string;
  owner_id: number;
  status: Status;
  due_on: string | null;
  created_by: number;
  updated_by: number;
  created_at: number;
  updated_at: number;
  status_changed_at: number;
  deleted_at: number | null;
  deleted_by: number | null;
}

/** An error whose message is safe and useful to show to a person or a model. */
export class AppError extends Error {
  constructor(message: string, public status = 400, public code = 'bad_request') {
    super(message);
  }
}
