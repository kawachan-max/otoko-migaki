import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

type FeedbackRequest = {
  evaluation_id: string;
  helpful_score: number; // 1-5
  mismatch_areas?: string[];
  comment?: string;
};

function clampScore(n: number) {
  if (!Number.isFinite(n)) return 1;
  return Math.min(5, Math.max(1, Math.round(n)));
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as FeedbackRequest | null;
    if (!body) {
      return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
    }

    const evaluationId = typeof body.evaluation_id === "string" ? body.evaluation_id.trim() : "";
    if (!evaluationId) {
      return NextResponse.json({ error: "evaluation_id は必須です。" }, { status: 400 });
    }

    const helpfulScore = clampScore(body.helpful_score);
    const mismatchAreas = Array.isArray(body.mismatch_areas)
      ? body.mismatch_areas.filter((x) => typeof x === "string")
      : [];
    const COMMENT_MAX_LENGTH = 200;
    let comment: string | null = typeof body.comment === "string" ? body.comment.trim() : null;
    if (comment !== null && comment.length === 0) comment = null;
    if (comment !== null && comment.length > COMMENT_MAX_LENGTH) {
      comment = comment.slice(0, COMMENT_MAX_LENGTH);
    }

    const supabase = createServerClient();

    const { error: insertError } = await supabase.from("feedback").insert({
      evaluation_id: evaluationId,
      helpful_score: helpfulScore,
      mismatch_areas: mismatchAreas,
      comment: comment ?? undefined,
    });

    if (insertError) {
      console.error("feedback insert error:", insertError);
      return NextResponse.json(
        { error: "フィードバックの保存に失敗しました。" },
        { status: 500 }
      );
    }

    const evaluationUpdate: {
      feedback_score: number;
      feedback_at?: string;
      is_good_example?: boolean;
      is_bad_example?: boolean;
    } = {
      feedback_score: helpfulScore,
      feedback_at: new Date().toISOString(),
    };
    if (helpfulScore >= 4 && comment !== null && comment.length > 0) {
      evaluationUpdate.is_good_example = true;
    }
    if (helpfulScore <= 2) {
      evaluationUpdate.is_bad_example = true;
    }

    const { error: updateError } = await supabase
      .from("evaluations")
      .update(evaluationUpdate)
      .eq("id", evaluationId);

    if (updateError) {
      console.error("evaluations update error:", updateError);
      // フィードバックは保存済みなので 200 のまま返す
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
