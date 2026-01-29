import { createServerClient } from "@/lib/supabase";

export type EvaluationHistoryRow = {
  id: string;
  answers: Record<string, unknown>;
  actions: string[];
  result: {
    persona_type?: string;
    overall_score?: number;
    category_scores?: Record<string, number>;
    coach_comment?: string[];
    missions?: string[];
    template?: { title?: string; content?: string };
  };
  created_at: string;
  feedback_score: number | null;
};

/**
 * 同じ anonymous_user_id の過去の判定を最新5件取得
 */
export async function getUserHistory(anonymousUserId: string): Promise<EvaluationHistoryRow[]> {
  if (!anonymousUserId.trim()) return [];

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("evaluations")
    .select("id, answers, actions, result, created_at, feedback_score")
    .eq("anonymous_user_id", anonymousUserId.trim())
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("[history] getUserHistory error:", error);
    return [];
  }

  if (!data || !Array.isArray(data)) return [];

  return data as EvaluationHistoryRow[];
}

export type LatestAnswers = Record<string, unknown> | null;

/**
 * 最新1件の判定の answers を取得。なければ null
 */
export async function getLatestAnswers(anonymousUserId: string): Promise<LatestAnswers> {
  if (!anonymousUserId.trim()) return null;

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("evaluations")
    .select("answers")
    .eq("anonymous_user_id", anonymousUserId.trim())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[history] getLatestAnswers error:", error);
    return null;
  }

  const answers = data?.answers;
  if (typeof answers !== "object" || answers === null) return null;
  return answers as Record<string, unknown>;
}
