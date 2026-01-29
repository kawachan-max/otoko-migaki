import { NextResponse } from "next/server";
import { getLatestAnswers } from "@/lib/history";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const anonymousUserId = searchParams.get("anonymous_user_id");
    if (!anonymousUserId || typeof anonymousUserId !== "string") {
      return NextResponse.json({ error: "anonymous_user_id が必要です。" }, { status: 400 });
    }

    const answers = await getLatestAnswers(anonymousUserId.trim());
    return NextResponse.json({ answers });
  } catch (e) {
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
