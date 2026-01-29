import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createServerClient } from "@/lib/supabase";
import { getGoodExamples } from "@/lib/learning";
import { getUserHistory } from "@/lib/history";

type EvaluateRequest = {
  anonymous_user_id: string;
  form: {
    age: string;
    experience: string;
    meet_methods: string[];
    goal: string;
    problems: string[];
    time_budget: string;
    region: string;
  };
  actions: string[];
};

type EvaluateResponse = {
  evaluation_id: string;
  persona_type: string;
  overall_score: number;
  category_scores: {
    appearance: number;
    meetingActions: number;
    communication: number;
    datePower: number;
    moteMindset: number;
    lifestyle: number;
  };
  coach_comment: [string, string, string];
  missions: [string, string, string];
  template: { title: string; content: string };
  is_first_time: boolean;
  visit_count: number;
  growth_comment: string | null;
  changes_from_last: { improved: string[]; needs_work: string[] } | null;
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

function normalizeChangesFromLast(v: unknown): { improved: string[]; needs_work: string[] } | null {
  if (!isRecord(v)) return null;
  const improved = getArray(v.improved) ?? [];
  const needs_work = getArray(v.needs_work) ?? [];
  const improvedStr = improved.filter((x) => typeof x === "string").map(String);
  const needsWorkStr = needs_work.filter((x) => typeof x === "string").map(String);
  if (improvedStr.length === 0 && needsWorkStr.length === 0) return null;
  return { improved: improvedStr, needs_work: needsWorkStr };
}

function normalizeResponse(
  raw: unknown,
  opts: { visit_count: number; is_first_time: boolean }
): EvaluateResponse {
  const root = isRecord(raw) ? raw : {};
  const category = isRecord(root.category_scores) ? root.category_scores : {};
  const coach = getArray(root.coach_comment) ?? [];
  const missions = getArray(root.missions) ?? [];
  const template = isRecord(root.template) ? root.template : {};

  const res: EvaluateResponse = {
    evaluation_id: "", // 呼び出し元で上書き
    persona_type: getString(root.persona_type) ?? "改善スタート型",
    overall_score: clampScore(root.overall_score),
    category_scores: {
      appearance: clampScore(category.appearance ?? category.looks),
      meetingActions: clampScore(category.meetingActions ?? category.opportunities),
      communication: clampScore(category.communication),
      datePower: clampScore(category.datePower ?? category.date_planning),
      moteMindset: clampScore(category.moteMindset ?? category.mindset),
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
    is_first_time: opts.is_first_time,
    visit_count: opts.visit_count,
    growth_comment: opts.is_first_time ? null : getString(root.growth_comment) ?? null,
    changes_from_last: opts.is_first_time ? null : normalizeChangesFromLast(root.changes_from_last),
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
    if (actions.length < 1 || actions.length > 10) {
      return NextResponse.json({ error: "actions は1〜10個（改行区切り）で送ってください。" }, { status: 400 });
    }

    const history = await getUserHistory(body.anonymous_user_id);
    const visitCount = history.length + 1;
    const isFirstTime = history.length === 0;
    const latest = history[0];

    const client = new OpenAI({ apiKey });

    const goodExamples = await getGoodExamples();
    let systemPrompt = [
      "あなたは男磨き判定の優しい恋愛コーチです。否定しない、説教しない。改善点は1つに絞り、今日できる行動に落とす。",
      "",
      "【評価の基本方針】",
      "・評価は厳しめにする（簡単に高得点を取れないようにする）。",
      "・ユーザーが選択した「目標」に直接つながる行動のみを高く評価する。",
      "・目標に関係ない行動は、他のカテゴリでは評価するが、総合評価（overall_score）や目標達成につながるカテゴリの評価には甘くしない。",
      "",
      "【目標別の評価重点】",
      "・彼女が欲しい → 出会いの機会を増やす具体的行動（アプリで実際にマッチング、イベント参加、紹介依頼）を重視。「喫茶店に行く」など出会いに直接つながらない行動は出会い行動として高く評価しない。",
      "・デート経験を増やしたい → 実際にデートに誘った回数、デートの計画・実行を重視。マッチングだけでは高く評価しない。実際に会う行動を重視。",
      "・結婚を視野に入れている → 真剣な出会いの場（結婚相談所、婚活パーティー、真剣なアプリ）を重視。カジュアルな出会いより、結婚につながる行動を高く評価。",
      "・困りごとに「見た目の印象が良くない」「自分に自信が持てない」→ 自己改善行動（筋トレ、スキンケア、勉強、スキルアップ）を重視。外見磨き・モテマインドの評価を厳しめに反映。",
      "・上記以外・バランス型 → 外見磨き・コミュ力・出会い行動のバランスを評価。",
      "",
      "【ペルソナタイプの選び方】",
      "ユーザーの回答（出会い方・困りごと・行動入力の内容と数）を分析し、以下の5つから必ず1つだけ選んでください。",
      "1. アプリ改善型：出会い方で「アプリ」のみを選択し、アプリでの活動が中心の人",
      "2. リアル出会い型：出会い方で「紹介」「職場学校」「趣味」「イベント」のいずれかを選択し、リアルでの出会いが中心の人（アプリを選んでいない、または補助的）",
      "3. ハイブリッド型：出会い方でアプリとリアル系を両方・複数選択している人",
      "4. 自分磨き優先型：困りごとで「見た目の印象が良くない」「自分に自信が持てない」を選択し、行動入力に自己改善系（筋トレ・美容・勉強など）が多い人",
      "5. 行動量不足型：行動入力が少ない、または出会いの機会を増やす行動が少ない人",
      "判定ロジック：出会い方の選択内容・困りごとの内容・行動入力の内容と数を総合して、最も当てはまる1つを選ぶこと。",
      "",
      "【一言コーチング（coach_comment）のルール】",
      "必ず3つの「異なる」文章を返すこと。内容が被らないこと。",
      "1. 承認文：ユーザーの具体的な努力を1つだけ取り上げて褒める（行動入力から具体的に1つ指名すること）",
      "2. 改善点：最も効果的な改善ポイントを1つだけ提案する（説教しない・1点に絞る）",
      "3. 次の一手：今日すぐできる具体的なアクションを1つだけ示す",
      "重要：3つの文章は絶対に重複させないこと。それぞれ異なる内容にすること。",
      "",
      "【困りごと別の対応方針】",
      "ユーザーが選択した「困りごと」に基づいて、ミッションとコーチングの重点を決めること。",
      "",
      "【見た目の印象が良くない】7日ミッションに外見磨きに関する具体的な行動を必ず1つ以上含める。コーチングで服装・髪型・清潔感の改善ポイントを指摘。評価で外見磨きカテゴリの改善点を詳しく説明。",
      "【会話が続かない・苦手】7日ミッションに会話・コミュニケーションの練習を必ず1つ以上含める。コーチングで質問力・聞く力・話題の広げ方をアドバイス。評価でコミュ力カテゴリの改善点を詳しく説明。",
      "【出会いの機会がない】7日ミッションに出会いの場を増やす具体的行動を必ず1つ以上含める。コーチングで目標に合った出会いの場（アプリ、イベント、紹介など）を提案。評価で出会い行動カテゴリの改善点を詳しく説明。",
      "【デートに誘えない】7日ミッションにデートに誘う練習や準備を必ず1つ以上含める。コーチングで誘い方のコツ、断られにくいタイミング、プランの立て方を提案。評価でデート力カテゴリの改善点を詳しく説明。",
      "【自分に自信が持てない】7日ミッションに自己肯定感を上げる小さな成功体験を必ず1つ以上含める。コーチングで自信をつける考え方、小さな成功を積み重ねる方法を提案。評価でモテマインドカテゴリの改善点を詳しく説明。",
      "【生活リズムが乱れている】7日ミッションに生活習慣を整える行動を必ず1つ以上含める。コーチングで睡眠・食事・運動のバランス改善を提案。評価で生活習慣カテゴリの改善点を詳しく説明。",
      "【何から始めればいいか分からない】7日ミッションに最も効果的で簡単な最初の一歩を3つ提案。コーチングで全体の中で最も改善効果が高いポイントを1つ指摘。評価で総合的に見て最も改善すべきカテゴリを明確に伝える。",
      "",
      "【複数選択された場合】選択された困りごと全てに対応するミッションを含める。最も深刻そうな困りごとをコーチングの重点にする。ミッションは困りごとの数に関わらず3つに絞る（優先度の高いものから）。",
      "",
      "【各カテゴリの評価基準（1-5点）】",
      "category_scores は以下の基準で1-5の整数を付けること。",
      "",
      "【外見磨き appearance】服装・髪型・清潔感",
      "5: 定期的に美容院、筋トレ週3以上、スキンケア、服装にこだわり",
      "4: 美容院は月1、筋トレ週1-2、清潔感あり",
      "3: たまに服を買う、髪は整えている",
      "2: 最低限の清潔感のみ",
      "1: 特に何もしていない",
      "",
      "【出会い行動 meetingActions】厳しめの基準（目標に直接つながる行動を重視）",
      "5: 週に複数回、出会いにつながる具体的行動（実際のマッチング、デート、イベント参加）",
      "4: 週1回以上、出会いにつながる行動",
      "3: 月に2-3回程度の行動",
      "2: 月1回程度、または行動が目標に直接つながっていない",
      "1: ほぼ行動していない、または目標と無関係な行動のみ",
      "",
      "【コミュ力 communication】厳しめの基準",
      "5: 自分から話しかけ、会話をリードし、相手の連絡先を聞ける",
      "4: 自分から話しかけられる、会話が続く",
      "3: 話しかけられれば普通に会話できる",
      "2: 会話が苦手、続かない",
      "1: ほとんど話せない、避けている",
      "",
      "【デート力 datePower】厳しめの基準",
      "5: 月に複数回デートしている、自分からプランを立てて誘える",
      "4: 月1回以上デート、誘うことができる",
      "3: 数ヶ月に1回程度、誘われれば行ける",
      "2: 半年以上デートしていない",
      "1: デートに誘えない、経験がほぼない",
      "",
      "【モテマインド moteMindset】自信・前向きさ",
      "5: 自信あり、ポジティブ、継続力あり",
      "4: 前向き、失敗しても立ち直れる",
      "3: 普通、たまにネガティブ",
      "2: 自信がない、すぐ諦める",
      "1: 非常にネガティブ、行動できない",
      "",
      "【生活習慣 lifestyle】睡眠・食事・趣味",
      "5: 睡眠・食事・運動バランス良好、趣味充実",
      "4: 生活リズム安定、趣味あり",
      "3: 普通の生活",
      "2: 不規則、趣味なし",
      "1: 乱れた生活",
      "",
      "【評価理由】",
      "なぜこの点数なのか、ユーザーが理解できるように、coach_commentや各カテゴリのスコアの根拠を意識して判定すること。",
    ].join("\n");

    if (goodExamples.length > 0) {
      const examplesText = goodExamples
        .map((ex, i) => {
          const input = `入力: 回答=${JSON.stringify(ex.answers)} 行動=${JSON.stringify(ex.actions)}`;
          const output = `出力（参考）: ${JSON.stringify(ex.result)}`;
          return `【例${i + 1}】\n${input}\n${output}`;
        })
        .join("\n\n");
      systemPrompt += `\n\n以下は過去に高評価を得た回答例です。参考にしてください：\n\n${examplesText}`;
    }

    const historyLines: string[] = [];
    historyLines.push(`このユーザーは${visitCount}回目の判定です。`);
    if (latest) {
      historyLines.push(`前回のペルソナタイプ: ${latest.result?.persona_type ?? "不明"}`);
      if (latest.result?.category_scores) {
        historyLines.push(`前回のカテゴリスコア: ${JSON.stringify(latest.result.category_scores)}`);
      }
      historyLines.push(`前回の行動（${latest.actions?.length ?? 0}個）: ${(latest.actions ?? []).join(" / ")}`);
      historyLines.push(`今回の行動（${actions.length}個）: ${actions.join(" / ")}`);
      historyLines.push("前回と今回の行動を比較し、増えた・新しく始めた良い点を improved、まだ課題の点を needs_work に含めてください。");
    }

    const userPrompt = [
      "次の入力をもとに、指定のJSONのみを返してください。",
      "",
      "【成長追跡の前提】",
      ...historyLines,
      "",
      "【入力】",
      `年齢: ${body.form?.age ?? ""}`,
      `恋愛経験: ${body.form?.experience ?? ""}`,
      `出会い方: ${(body.form?.meet_methods ?? []).join(" / ")}`,
      `目的: ${body.form?.goal ?? ""}`,
      `ユーザーの困りごと: ${JSON.stringify(body.form?.problems ?? [])}`,
      `使える時間: ${body.form?.time_budget ?? ""}`,
      `地域: ${body.form?.region ?? ""}`,
      "",
      "今やっていること（1〜10個）:",
      ...actions.map((a, i) => `${i + 1}. ${a}`),
      "",
      "【出力JSON仕様】",
      "persona_type は上記5タイプのいずれか1つ（アプリ改善型 / リアル出会い型 / ハイブリッド型 / 自分磨き優先型 / 行動量不足型）を、入力に基づいて選ぶこと。",
      '{',
      '  "persona_type": "選んだタイプをそのまま文字列で",',
      '  "overall_score": 3,',
      '  "category_scores": { "appearance": 3, "meetingActions": 2, "communication": 3, "datePower": 1, "moteMindset": 4, "lifestyle": 4 },',
      '  "coach_comment": ["承認文（努力を1つ具体指名）", "改善点（1つだけ）", "次の一手（今日できる1アクション）"],',
      '  "missions": ["ミッション1", "ミッション2", "ミッション3"],',
      '  "template": { "title": "テンプレ名", "content": "コピペ用テキスト" },',
      `  "is_first_time": ${isFirstTime},`,
      `  "visit_count": ${visitCount},`,
      isFirstTime
        ? '  "growth_comment": null,'
        : '  "growth_comment": "前回からの成長を1〜2文で褒めるコメント",',
      isFirstTime
        ? '  "changes_from_last": null'
        : '  "changes_from_last": { "improved": ["良くなった点"], "needs_work": ["まだ課題の点"] }',
      "}",
      "",
      "制約:",
      "- persona_type は入力分析に基づき5タイプから1つだけ選ぶ。固定で「アプリ改善型」にしないこと。",
      "- overall_score と各category_scoresは1〜5の整数",
      "- coach_commentは必ず3文で、それぞれ異なる内容（承認・改善点・次の一手）。重複禁止。",
      "- missionsは7日以内に実行できる具体的行動（各1文）",
      "- template.contentは日本語で、そのまま貼れるテキスト。箇条書きOK",
      "- is_first_time と visit_count は上記の値のまま返すこと。",
      "- 2回目以降の場合、growth_comment と changes_from_last を必ず記入すること。",
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
    const normalized = normalizeResponse(parsed, { visit_count: visitCount, is_first_time: isFirstTime });
    normalized.evaluation_id = ""; // 下で row.id を代入するまで未設定

    let supabase;
    try {
      supabase = createServerClient();
    } catch (clientErr) {
      console.error("[evaluate] Supabase client error:", clientErr);
      return NextResponse.json(
        { error: "Supabase の初期化に失敗しました。環境変数を確認してください。" },
        { status: 500 }
      );
    }

    const insertPayload = {
      anonymous_user_id: String(body.anonymous_user_id ?? ""),
      answers: JSON.parse(JSON.stringify(body.form ?? {})),
      actions: body.actions ?? [],
      result: JSON.parse(JSON.stringify(normalized)),
    };

    const { data: row, error: insertError } = await supabase
      .from("evaluations")
      .insert(insertPayload)
      .select("id")
      .single();

    if (insertError || !row?.id) {
      console.error("[evaluate] Supabase insert error:", {
        message: insertError?.message,
        code: insertError?.code,
        details: insertError?.details,
        hint: insertError?.hint,
        full: insertError,
      });
      console.error("[evaluate] Insert payload keys:", Object.keys(insertPayload));
      return NextResponse.json(
        {
          error: "判定結果の保存に失敗しました。",
          debug: process.env.NODE_ENV === "development" ? insertError?.message : undefined,
        },
        { status: 500 }
      );
    }

    const { error: logError } = await supabase.from("learning_logs").insert({
      log_type: "evaluate",
      details: {
        evaluation_id: row.id,
        good_examples_count: goodExamples.length,
      },
    });
    if (logError) {
      console.error("[evaluate] learning_logs insert error:", logError);
    }

    normalized.evaluation_id = row.id;
    return NextResponse.json({
      ...normalized,
    });
  } catch (e) {
    console.error("[evaluate] Unexpected error:", e);
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

