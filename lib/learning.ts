import { createServerClient } from "@/lib/supabase";

export type GoodExample = {
  answers: Record<string, unknown>;
  actions: string[];
  result: {
    persona_type: string;
    overall_score: number;
    category_scores: Record<string, number>;
    coach_comment: string[];
    missions: string[];
    template: { title: string; content: string };
  };
};

/**
 * is_good_example = true の最新5件を取得（answers, actions, result）
 */
export async function getGoodExamples(): Promise<GoodExample[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("evaluations")
    .select("answers, actions, result")
    .eq("is_good_example", true)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("[learning] getGoodExamples error:", error);
    return [];
  }

  if (!data || !Array.isArray(data)) return [];

  return data.filter((row) => {
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
  }) as GoodExample[];
}
