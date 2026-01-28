import { NextResponse } from "next/server";
import OpenAI from "openai";

type EvaluateRequest = {
  anonymous_user_id: string;
  form: {
    age: string;
    experience: string;
    meet_methods: string[];
    goal: string;
    problem: string;
    time_budget: string;
    region: string;
  };
  actions: string[];
};

type EvaluateResponse = {
  persona_type: string;
  overall_score: number;
  category_scores: {
    looks: number;
    opportunities: number;
    communication: number;
    date_planning: number;
    mindset: number;
    lifestyle: number;
  };
  coach_comment: [string, string, string];
  missions: [string, string, string];
  template: { title: string; content: string };
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function getString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function getArray(v: unknown): unknown[] | null {
  return Array.isArray(v) ? v : null;
}

function clampScore(n: unknown) {
  const num = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(num)) return 1;
  return Math.min(5, Math.max(1, Math.round(num)));
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // sometimes models wrap JSON in code fences
    const cleaned = text
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "");
    return JSON.parse(cleaned);
  }
}

function normalizeResponse(raw: unknown): EvaluateResponse {
  const root = isRecord(raw) ? raw : {};
  const category = isRecord(root.category_scores) ? root.category_scores : {};
  const coach = getArray(root.coach_comment) ?? [];
  const missions = getArray(root.missions) ?? [];
  const template = isRecord(root.template) ? root.template : {};

  const res: EvaluateResponse = {
    persona_type: getString(root.persona_type) ?? "改善スタート型",
    overall_score: clampScore(root.overall_score),
    category_scores: {
      looks: clampScore(category.looks),
      opportunities: clampScore(category.opportunities),
      communication: clampScore(category.communication),
      date_planning: clampScore(category.date_planning),
      mindset: clampScore(category.mindset),
      lifestyle: clampScore(category.lifestyle),
    },
    coach_comment: [
      getString(coach[0]) ?? "今の努力を言語化できている時点で、もう前に進めています。",
      getString(coach[1]) ?? "改善点は1つに絞って、成果が出やすい順に積み上げましょう。",
      getString(coach[2]) ?? "今日から7日だけ、1日1つの小さな行動に落として続けてみてください。",
    ],
    missions: [
      getString(missions[0]) ?? "プロフィール写真を1枚だけ改善（自然光・笑顔・清潔感）。",
      getString(missions[1]) ?? "会話の『質問→共感→小話』を1セット練習してメモ。",
      getString(missions[2]) ?? "出会いの場を1つ増やす（アプリ/趣味/紹介のどれか）。",
    ],
    template: {
      title: getString(template.title) ?? "7日改善プラン（コピペ用）",
      content:
        getString(template.content) ??
        "【今週の1点改善】\n- （ここに改善点を1つ書く）\n\n【7日ミッション】\n- Day1:\n- Day2:\n- Day3:\n- Day4:\n- Day5:\n- Day6:\n- Day7:\n\n【振り返り】\n- できたこと:\n- 次に変える1つ:\n",
    },
  };

  return res;
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY が未設定です（.env.local を確認してください）。" }, { status: 500 });
    }

    const body = (await req.json().catch(() => null)) as EvaluateRequest | null;
    if (!body) {
      return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
    }

    const actions = Array.isArray(body.actions) ? body.actions.filter((x) => typeof x === "string" && x.trim()) : [];
    if (actions.length < 3 || actions.length > 10) {
      return NextResponse.json({ error: "actions は3〜10個（改行区切り）で送ってください。" }, { status: 400 });
    }

    const client = new OpenAI({ apiKey });

    const systemPrompt =
      "あなたは男磨き判定の優しい恋愛コーチです。否定しない、説教しない。改善点は1つに絞り、今日できる行動に落とす。";

    const userPrompt = [
      "次の入力をもとに、指定のJSONのみを返してください。",
      "",
      "【入力】",
      `年齢: ${body.form?.age ?? ""}`,
      `恋愛経験: ${body.form?.experience ?? ""}`,
      `出会い方: ${(body.form?.meet_methods ?? []).join(" / ")}`,
      `目的: ${body.form?.goal ?? ""}`,
      `困りごと: ${body.form?.problem ?? ""}`,
      `使える時間: ${body.form?.time_budget ?? ""}`,
      `地域: ${body.form?.region ?? ""}`,
      "",
      "今やっていること（3〜10個）:",
      ...actions.map((a, i) => `${i + 1}. ${a}`),
      "",
      "【出力JSON仕様】",
      '{',
      '  "persona_type": "アプリ改善型",',
      '  "overall_score": 3,',
      '  "category_scores": { "looks": 3, "opportunities": 2, "communication": 3, "date_planning": 1, "mindset": 4, "lifestyle": 4 },',
      '  "coach_comment": ["承認文", "修正文", "次の一手"],',
      '  "missions": ["ミッション1", "ミッション2", "ミッション3"],',
      '  "template": { "title": "テンプレ名", "content": "コピペ用テキスト" }',
      "}",
      "",
      "制約:",
      "- overall_score と各category_scoresは1〜5の整数",
      "- coach_commentは必ず3文（承認→修正→次の一手）",
      "- 改善点（修正文で触れる論点）は1つに絞る",
      "- missionsは7日以内に実行できる具体的行動（各1文）",
      "- template.contentは日本語で、そのまま貼れるテキスト。箇条書きOK",
    ].join("\n");

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const text = completion.choices?.[0]?.message?.content ?? "";
    if (!text) {
      return NextResponse.json({ error: "判定結果の生成に失敗しました。" }, { status: 502 });
    }

    const parsed = safeJsonParse(text);
    const normalized = normalizeResponse(parsed);
    return NextResponse.json(normalized);
  } catch (e) {
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

