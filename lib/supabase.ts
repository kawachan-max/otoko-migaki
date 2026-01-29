import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY ?? "";

/**
 * ブラウザ（クライアント）用 Supabase クライアント（anon key）
 */
export function createBrowserClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定です。");
  }
  return createClient(supabaseUrl, supabaseAnonKey);
}

/**
 * サーバー（API Routes 等）用 Supabase クライアント（service role key）
 */
export function createServerClient() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY が未設定です。");
  }
  return createClient(supabaseUrl, supabaseServiceKey);
}
