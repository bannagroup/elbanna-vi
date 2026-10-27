/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// تطبيق التراخيص بيتصل بمشروع Supabase مستقل عن تطبيق البنا (القيم في .env.licenses وقت البناء)
const env = ((import.meta as any).env || {}) as Record<string, string | undefined>;
export const LICENSES_URL: string = (env.VITE_LICENSES_SUPABASE_URL || '').trim();
export const LICENSES_KEY: string = (env.VITE_LICENSES_SUPABASE_KEY || '').trim();
export const isConfigured: boolean = !!LICENSES_URL && !!LICENSES_KEY;

export const BUCKET = 'docs';

let client: SupabaseClient | null = null;
export const getClient = (): SupabaseClient | null => {
  if (!isConfigured) return null;
  if (!client) {
    client = createClient(LICENSES_URL, LICENSES_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'elbanna_licenses_auth' },
    });
  }
  return client;
};

// اسم المستخدم (عربي أو إنجليزي) ← إيميل داخلي ثابت، عشان الدخول يبقى باسم مستخدم بدل إيميل
export const usernameToEmail = async (username: string): Promise<string> => {
  const norm = username.trim().toLowerCase();
  const data = new TextEncoder().encode('elbanna-licenses:' + norm);
  const buf = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `u${hex.slice(0, 40)}@licenses.elbanna.app`;
};
