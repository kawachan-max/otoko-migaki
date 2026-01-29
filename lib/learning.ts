import { createServerClient } from "@/lib/supabase";

export type GoodExample = {
  answers: Record<string, unknown>;
  actions: string[];
  result: {
    persona_type: string;
    overall_score: number;
    category_scores: Record<string, number>;
    coach_comment: string[];
    missions?: string[];
    challenges?: { text: string; difficulty: string }[];
    template: { title: string; content: string };
  };
  comment?: string;
};

/**
 * is_good_example = true の最新5件を取得（answers, actions, result, feedback の comment）
 */
export async function getGoodExamples(): Promise<GoodExample[]> {
  const supabase = createServerClient();
  const { data: evalData, error } = await supabase
    .from("evaluations")
    .select("id, answers, actions, result")
    .eq("is_good_example", true)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("[learning] getGoodExamples error:", error);
    return [];
  }

  if (!evalData || !Array.isArray(evalData)) return [];

  const ids = evalData.map((r) => r.id).filter(Boolean);
  const feedbackMap: Record<string, string> = {};
  if (ids.length > 0) {
    const { data: fbData } = await supabase
      .from("feedback")
      .select("evaluation_id, comment")
      .in("evaluation_id", ids);
    if (fbData && Array.isArray(fbData)) {
      for (const row of fbData) {
        const c = row?.comment;
        if (typeof c === "string" && c.trim().length > 0) {
          feedbackMap[String(row.evaluation_id)] = c.trim().slice(0, 200);
        }
      }
    }
  }

  return evalData
    .filter((row) => {
      const answers = row?.answers;
      const actions = row?.actions;
      const result = row?.result;
      return (
        typeof answers === "object" &&
        answers !== null &&
        Array.isArray(actions) &&
        typeof result === "object" &&
        result !== null
      );
    })
    .map((row) => ({
      answers: row.answers as Record<string, unknown>,
      actions: row.actions as string[],
      result: row.result as GoodExample["result"],
      comment: feedbackMap[row.id] ?? undefined,
    }));
}
