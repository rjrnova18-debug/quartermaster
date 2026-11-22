/**
 * The only file that talks to Supabase. Screens never import supabase-js; they go
 * through the session (sign-in) and, from F3b, through the local database.
 *
 * Only the publishable key is in the app. What a signed-in person may read or change is
 * decided by the database (row-level security), not by this code.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { Role } from '../inspection/model';
import type { Changes, Outcome, SenderRemote } from './sender';
import { secureStorage } from './secure-storage';

// Expo copies EXPO_PUBLIC_ values into the app when it is built. Written with a dot on
// purpose: process.env['…'] would not be replaced.
const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** False in a copy built without .env: then only the demo works. */
export function isServerConfigured(): boolean {
  return Boolean(URL && PUBLISHABLE_KEY);
}

let client: SupabaseClient | null = null;

/** The Supabase client, created the first time it is needed. */
export function supabase(): SupabaseClient {
  if (client) {
    return client;
  }
  if (!URL || !PUBLISHABLE_KEY) {
    throw new Error('Supabase is not configured (see .env.example)');
  }
  const created = createClient(URL, PUBLISHABLE_KEY, {
    auth: { storage: secureStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  // Supabase's advice for phones: refresh the session only while the app is on screen.
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      created.auth.startAutoRefresh();
    } else {
      created.auth.stopAutoRefresh();
    }
  });
  client = created;
  return created;
}

// ---------------------------------------------------------------- sign in

export interface Profile {
  id: string;
  fullName: string;
  role: Role;
}

export type SignInProblem =
  | 'emailMissing'
  | 'emailInvalid'
  | 'passwordMissing'
  | 'wrongCredentials'
  | 'tooManyTries'
  | 'offline'
  | 'noProfile'
  | 'unknown';

/** The form is checked before anything is sent. Null when it may be sent. */
export function checkSignInForm(email: string, password: string): SignInProblem | null {
  const trimmed = email.trim();
  if (trimmed === '') return 'emailMissing';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'emailInvalid';
  if (password === '') return 'passwordMissing';
  return null;
}

/**
 * What went wrong, from a Supabase auth error. The message never says whether the
 * email exists: "email or password is wrong" covers both.
 */
export function problemFromAuthError(error: { name?: string; status?: number; code?: string }): SignInProblem {
  if (error.code === 'invalid_credentials') return 'wrongCredentials';
  if (error.code === 'over_request_rate_limit' || error.status === 429) return 'tooManyTries';
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) return 'offline';
  return 'unknown';
}

/** Signs in and reads the person's profile. The role comes from the database, never from the phone. */
export async function signIn(email: string, password: string): Promise<{ profile: Profile } | { problem: SignInProblem }> {
  const { data, error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
  if (error) {
    return { problem: problemFromAuthError(error) };
  }
  const profile = await fetchProfile(data.user.id);
  if (!profile) {
    await signOut();
    return { problem: 'noProfile' };
  }
  return { profile };
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase().from('profiles').select('id, full_name, role').eq('id', userId).maybeSingle();
  if (error || !data) {
    return null;
  }
  return { id: data.id, fullName: data.full_name, role: data.role };
}

/** Ends the session on this phone; other phones of the same person stay signed in. */
export async function signOut(): Promise<void> {
  await supabase().auth.signOut({ scope: 'local' });
}

/** Calls `onSignedOut` when Supabase ends the session by itself (for example, it was revoked). */
export function watchSignOut(onSignedOut: () => void): () => void {
  const { data } = supabase().auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      onSignedOut();
    }
  });
  return () => data.subscription.unsubscribe();
}

// ---------------------------------------------------------------- the sender's server (F3f)

const BUCKET = 'inspection-files';

/**
 * Sorts a failure: refusals the server will repeat (rules, permissions, duplicates) are
 * conflicts that wait for a person (S8); anything else, like no signal, is retried (S7).
 */
export function outcomeOf(error: { message?: string; code?: string } | null, updatedAt?: string): Outcome {
  if (!error) return { ok: true, updatedAt };
  const reason = error.message || 'unknown error';
  const refused =
    /^(not_allowed|duplicate_trip_ref|invalid:)/.test(reason) ||
    /row-level security/i.test(reason) ||
    ['42501', '23505', '23514'].includes(error.code ?? '');
  return { ok: false, conflict: refused, reason };
}

/** A short-lived link to download one stored file (the buckets are private). */
export async function signedUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase().storage.from(BUCKET).createSignedUrl(path, 60);
  return error ? null : data.signedUrl;
}

export const senderRemote: SenderRemote = {
  async saveInspection(payload) {
    const { data, error } = await supabase().rpc('save_inspection', { payload });
    return outcomeOf(error, data?.updated_at);
  },
  async deleteInspection(id) {
    return outcomeOf((await supabase().rpc('delete_inspection', { p_id: id })).error);
  },
  async removeInspectionFiles(id) {
    const { data, error } = await supabase().storage.from(BUCKET).list(id);
    if (error) return outcomeOf(error);
    if (!data || data.length === 0) return { ok: true };
    return outcomeOf((await supabase().storage.from(BUCKET).remove(data.map((f) => `${id}/${f.name}`))).error);
  },
  async removeFiles(paths) {
    return outcomeOf((await supabase().storage.from(BUCKET).remove(paths)).error);
  },
  async uploadFile(path, localUri, contentType) {
    const { File } = await import('expo-file-system'); // loaded here: only the phone has files
    const bytes = await new File(localUri).bytes();
    return outcomeOf((await supabase().storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true })).error);
  },
  async saveAttachment(row) {
    return outcomeOf((await supabase().rpc('save_attachment', { attachment: row })).error);
  },
  async deleteAttachment(id) {
    return outcomeOf((await supabase().rpc('delete_attachment', { p_id: id })).error);
  },
  async saveDirectory(kind, row, isNew) {
    const { id, ...fields } = row; // the id is never updated
    const query = isNew ? supabase().from(kind).insert(row) : supabase().from(kind).update(fields).eq('id', id as string);
    const { data, error } = await query.select('updated_at').single();
    return outcomeOf(error, data?.updated_at);
  },
  async changesSince(since) {
    const { data, error } = await supabase().rpc('changes_since', since ? { p_since: since } : {});
    if (error) throw new Error(error.message);
    return data as Changes;
  },
};
