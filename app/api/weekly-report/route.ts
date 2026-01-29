import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

type HistoryItem = {
  attempt: number;
  score: number;
  date: string;
};

type WeeklyReportResponse = {
  history: HistoryItem[];
  totalAttempts: number;
  thisWeek: {
    count: number;
    averageScore: number;
  };
  lastWeek: {
    count: number;
    averageScore: number;
  };
  scoreDiff: number;
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const anonymousUserId = searchParams.get("anonymous_user_id");

    if (!anonymousUserId || !anonymousUserId.trim()) {
      return NextResponse.json({ error: "anonymous_user_id は必須です。" }, { status: 400 });
    }

    const supabase = createServerClient();

    // 診断履歴（evaluations テーブル）を取得（古い順）。X軸=診断回数、Y軸=スコア(0-100)
    const { data: historyData, error: historyError } = await supabase
      .from("evaluations")
      .select("result, created_at")
      .eq("anonymous_user_id", anonymousUserId.trim())
      .order("created_at", { ascending: true });

    const history: HistoryItem[] = [];
    if (!historyError && Array.isArray(historyData)) {
      historyData.forEach((row, index) => {
        if (typeof row === "object" && row !== null && "result" in row) {
          const result = (row as { result?: unknown; created_at?: string }).result;
          const created_at = (row as { result?: unknown; created_at?: string }).created_at;
          if (typeof result === "object" && result !== null && "overall_score" in result) {
            const score = (result as { overall_score?: unknown }).overall_score;
            if (typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 100) {
              const dateStr =
                typeof created_at === "string" && created_at
                  ? new Date(created_at).toISOString().slice(0, 10)
                  : new Date().toISOString().slice(0, 10);
              history.push({
                attempt: index + 1,
                score: Math.round(score),
                date: dateStr,
              });
            }
          }
        }
      });
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const sevenDaysAgo = new Date(todayStart);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const fourteenDaysAgo = new Date(todayStart);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    // 今週（今日から7日前まで = 過去7日間）
    const { data: thisWeekData, error: thisWeekError } = await supabase
      .from("evaluations")
      .select("result")
      .eq("anonymous_user_id", anonymousUserId.trim())
      .gte("created_at", sevenDaysAgo.toISOString())
      .lte("created_at", todayEnd.toISOString());

    // 先週（8日前から14日前まで = その前の7日間）
    const { data: lastWeekData, error: lastWeekError } = await supabase
      .from("evaluations")
      .select("result")
      .eq("anonymous_user_id", anonymousUserId.trim())
      .gte("created_at", fourteenDaysAgo.toISOString())
      .lt("created_at", sevenDaysAgo.toISOString());

    if (thisWeekError || lastWeekError) {
      console.error("[weekly-report] Supabase error:", { thisWeekError, lastWeekError });
      return NextResponse.json({ error: "データの取得に失敗しました。" }, { status: 500 });
    }

    const calculateAverageScore = (data: unknown[]): number => {
      if (!Array.isArray(data) || data.length === 0) return 0;

      const scores: number[] = [];
      for (const row of data) {
        if (typeof row === "object" && row !== null && "result" in row) {
          const result = (row as { result?: unknown }).result;
          if (typeof result === "object" && result !== null && "overall_score" in result) {
            const score = (result as { overall_score?: unknown }).overall_score;
            if (typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 100) {
              scores.push(score);
            }
          }
        }
      }

      if (scores.length === 0) return 0;
      const sum = scores.reduce((a, b) => a + b, 0);
      const average = sum / scores.length;
      return Math.round(average);
    };

    const thisWeekCount = Array.isArray(thisWeekData) ? thisWeekData.length : 0;
    const thisWeekAverage = calculateAverageScore(thisWeekData ?? []);

    const lastWeekCount = Array.isArray(lastWeekData) ? lastWeekData.length : 0;
    const lastWeekAverage = calculateAverageScore(lastWeekData ?? []);

    const scoreDiff = thisWeekAverage - lastWeekAverage;

    const response: WeeklyReportResponse = {
      history,
      totalAttempts: history.length,
      thisWeek: {
        count: thisWeekCount,
        averageScore: thisWeekAverage,
      },
      lastWeek: {
        count: lastWeekCount,
        averageScore: lastWeekAverage,
      },
      scoreDiff,
    };

    return NextResponse.json(response);
  } catch (e) {
    console.error("[weekly-report] Unexpected error:", e);
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
