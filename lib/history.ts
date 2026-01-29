import { createServerClient } from "@/lib/supabase";

export type ChallengeItem = { text: string; difficulty: string };

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
    challenges?: ChallengeItem[];
    template?: { title?: string; content?: string };
  };
  created_at: string;
  feedback_score: number | null;
};

export type LastResult = { challenges: ChallengeItem[] } | null;

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

const DIFFICULTIES: ChallengeItem["difficulty"][] = ["easy", "medium", "challenge"];

/**
 * 最新1件の判定の result から challenges を取得。前回のチャレンジ達成ボーナス表示用。
 */
export async function getLatestResult(anonymousUserId: string): Promise<LastResult> {
  if (!anonymousUserId.trim()) return null;

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("evaluations")
    .select("result")
    .eq("anonymous_user_id", anonymousUserId.trim())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.result || typeof data.result !== "object") return null;

  const result = data.result as EvaluationHistoryRow["result"];
  const challenges = result.challenges;
  if (Array.isArray(challenges) && challenges.length >= 3) {
    const items: ChallengeItem[] = challenges.slice(0, 3).map((c, i) => ({
      text: typeof c?.text === "string" ? c.text : "",
      difficulty: typeof c?.difficulty === "string" ? c.difficulty : DIFFICULTIES[i] ?? "easy",
    }));
    if (items.every((x) => x.text)) return { challenges: items };
  }
  const missions = result.missions;
  if (Array.isArray(missions) && missions.length >= 3) {
    return {
      challenges: [
        { text: missions[0] ?? "", difficulty: "easy" },
        { text: missions[1] ?? "", difficulty: "medium" },
        { text: missions[2] ?? "", difficulty: "challenge" },
      ],
    };
  }
  return null;
}

const FEEDBACK_COMMENT_MAX_LENGTH = 200;

/**
 * そのユーザーの最新のフィードバックコメント（nullでない・空でない）を最大3件取得
 */
export async function getLatestFeedback(anonymousUserId: string): Promise<string[]> {
  if (!anonymousUserId.trim()) return [];

  const supabase = createServerClient();
  const { data: evals, error: evalsError } = await supabase
    .from("evaluations")
    .select("id")
    .eq("anonymous_user_id", anonymousUserId.trim())
    .order("created_at", { ascending: false })
    .limit(20);

  if (evalsError || !evals?.length) return [];

  const ids = evals.map((r) => r.id);
  const { data: feedbackRows, error: fbError } = await supabase
    .from("feedback")
    .select("comment, created_at")
    .in("evaluation_id", ids)
    .order("created_at", { ascending: false })
    .limit(10);

  if (fbError || !feedbackRows?.length) return [];

  const comments: string[] = [];
  for (const row of feedbackRows) {
    const c = row?.comment;
    if (typeof c === "string" && c.trim().length > 0) {
      comments.push(c.trim().slice(0, FEEDBACK_COMMENT_MAX_LENGTH));
      if (comments.length >= 3) break;
    }
  }
  return comments;
}
