import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createServerClient } from "@/lib/supabase";
import { getGoodExamples } from "@/lib/learning";
import { getUserHistory, getLatestFeedback } from "@/lib/history";

type ChallengeDifficulty = "easy" | "medium" | "challenge";

type ChallengeItem = { text: string; difficulty: ChallengeDifficulty };

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
  /** 前回のチャレンジ達成状況（従来形式）。達成分だけボーナス加点 */
  challenge_bonus?: [boolean, boolean, boolean];
  /** 前回のチャレンジ達成状況。簡単+1、中級+2、挑戦+3、最大+6点 */
  challenge_easy_done?: boolean;
  challenge_medium_done?: boolean;
  challenge_hard_done?: boolean;
};

type EvaluateResponse = {
  evaluation_id: string;
  persona_type: string;
  overall_score: number; // 0-100（10カテゴリ合計）+ チャレンジボーナス
  category_scores: {
    cleanliness: number;
    fashion: number;
    fitness: number;
    meetingActions: number;
    dateActions: number;
    lifestyle: number;
    speakingSkill: number;
    listeningSkill: number;
    positiveThinking: number;
    consistency: number;
  };
  coach_comment: [string, string, string, string];
  challenges: [ChallengeItem, ChallengeItem, ChallengeItem];
  template: { title: string; content: string };
  is_first_time: boolean;
  visit_count: number;
  growth_comment: string | null;
  changes_from_last: { improved: string[]; needs_work: string[] } | null;
  /** 今回加算したチャレンジボーナス点（0〜6） */
  challengeBonus: number;
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

function clampCategoryScore(n: unknown) {
  const num = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(num)) return 1;
  return Math.min(10, Math.max(1, Math.round(num)));
}

function clampOverallScore(n: unknown) {
  const num = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(num)) return 0;
  return Math.min(100, Math.max(0, Math.round(num)));
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

const DIFFICULTIES: ChallengeDifficulty[] = ["easy", "medium", "challenge"];

function parseDifficulty(v: unknown): ChallengeDifficulty {
  const s = getString(v);
  if (s === "easy" || s === "medium" || s === "challenge") return s;
  return "easy";
}

function normalizeChallenges(raw: unknown, missionsFallback: string[]): EvaluateResponse["challenges"] {
  const arr = getArray(raw);
  if (arr && arr.length >= 3) {
    return [
      {
        text: getString((arr[0] as Record<string, unknown>)?.text) ?? getString(arr[0]) ?? missionsFallback[0],
        difficulty: parseDifficulty((arr[0] as Record<string, unknown>)?.difficulty) ?? DIFFICULTIES[0],
      },
      {
        text: getString((arr[1] as Record<string, unknown>)?.text) ?? getString(arr[1]) ?? missionsFallback[1],
        difficulty: parseDifficulty((arr[1] as Record<string, unknown>)?.difficulty) ?? DIFFICULTIES[1],
      },
      {
        text: getString((arr[2] as Record<string, unknown>)?.text) ?? getString(arr[2]) ?? missionsFallback[2],
        difficulty: parseDifficulty((arr[2] as Record<string, unknown>)?.difficulty) ?? DIFFICULTIES[2],
      },
    ];
  }
  return [
    { text: missionsFallback[0], difficulty: "easy" },
    { text: missionsFallback[1], difficulty: "medium" },
    { text: missionsFallback[2], difficulty: "challenge" },
  ];
}

function normalizeResponse(
  raw: unknown,
  opts: { visit_count: number; is_first_time: boolean }
): EvaluateResponse {
  const root = isRecord(raw) ? raw : {};
  const category = isRecord(root.category_scores) ? root.category_scores : {};
  const coach = getArray(root.coach_comment) ?? [];
  const missionsFallback = [
    getString((getArray(root.missions) ?? [])[0]) ?? "プロフィール写真を1枚だけ改善（自然光・笑顔・清潔感）。",
    getString((getArray(root.missions) ?? [])[1]) ?? "会話の『質問→共感→小話』を1セット練習してメモ。",
    getString((getArray(root.missions) ?? [])[2]) ?? "出会いの場を1つ増やす（アプリ/趣味/紹介のどれか）。",
  ];
  const template = isRecord(root.template) ? root.template : {};

  const categoryScores: EvaluateResponse["category_scores"] = {
    cleanliness: clampCategoryScore(category.cleanliness),
    fashion: clampCategoryScore(category.fashion),
    fitness: clampCategoryScore(category.fitness),
    meetingActions: clampCategoryScore(category.meetingActions),
    dateActions: clampCategoryScore(category.dateActions),
    lifestyle: clampCategoryScore(category.lifestyle),
    speakingSkill: clampCategoryScore(category.speakingSkill),
    listeningSkill: clampCategoryScore(category.listeningSkill),
    positiveThinking: clampCategoryScore(category.positiveThinking),
    consistency: clampCategoryScore(category.consistency),
  };

  const sum = Object.values(categoryScores).reduce((a, b) => a + b, 0);
  const challenges = normalizeChallenges(root.challenges, missionsFallback);
  const res: EvaluateResponse = {
    evaluation_id: "",
    persona_type: getString(root.persona_type) ?? "改善スタート型",
    overall_score: clampOverallScore(sum),
    category_scores: categoryScores,
    coach_comment: [
      getString(coach[0]) ?? "今の努力を言語化できている時点で、もう前に進めています。",
      getString(coach[1]) ?? "〇〇についてどう感じた？一度、自分に問いかけてみて。",
      getString(coach[2]) ?? "改善点は1つに絞って、成果が出やすい順に積み上げましょう。",
      getString(coach[3]) ?? "一歩ずつで大丈夫。続けることが一番の強みだよ。",
    ],
    challenges,
    template: {
      title: getString(template.title) ?? "今週の改善プラン（コピペ用）",
      content:
        getString(template.content) ??
        "【今週の1点改善】\n- （ここに改善点を1つ書く）\n\n【今週のチャレンジ】\n- 簡単:\n- 中級:\n- 挑戦:\n\n【振り返り】\n- できたこと:\n- 次に変える1つ:\n",
    },
    is_first_time: opts.is_first_time,
    visit_count: opts.visit_count,
    growth_comment: opts.is_first_time ? null : getString(root.growth_comment) ?? null,
    changes_from_last: opts.is_first_time ? null : normalizeChangesFromLast(root.changes_from_last),
    challengeBonus: 0, // 下でボーナス計算後に上書き
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
    const latestFeedbackComments = await getLatestFeedback(body.anonymous_user_id);

    const client = new OpenAI({ apiKey });

    const goodExamples = await getGoodExamples();
    let systemPrompt = [
      "あなたは男磨き判定の優しい恋愛コーチです。否定しない、説教しない。改善点は1つに絞り、今日できる行動に落とす。",
      "",
      "【評価の基本方針】",
      "・評価は厳しめにする（簡単に高得点を取れないようにする）",
      "・ユーザーが選択した「目標」に直接つながる行動のみを高く評価する",
      "・目標に関係ない行動は、他のカテゴリでは評価するが、総合評価や目標達成につながるカテゴリの評価は甘くしない",
      "",
      "【10カテゴリの評価基準（各10点満点、合計100点）】",
      "",
      "【1. 清潔感 cleanliness】髪型・肌・爪・服装・体臭",
      "10: 毎日完璧にケア、美容院定期、スキンケア・歯・体臭すべて万全",
      "9: ほぼ毎日ケア、清潔感抜群、周囲から褒められるレベル",
      "8: 毎日基本ケア、身だしなみに常に気を使っている",
      "7: ほぼ毎日ケア、たまに手を抜く日がある程度",
      "6: 週4-5回ケア、基本的な清潔感はある",
      "5: 週3回程度ケア、最低限の清潔感",
      "4: 週1-2回ケア、清潔感にムラがある",
      "3: たまに気にする程度、指摘されたら直す",
      "2: ほとんど意識していない",
      "1: 全く何もしていない",
      "",
      "【2. ファッション fashion】TPOに合った服装・コーディネート",
      "10: 自分に似合う服を理解、TPO完璧、定期的にアップデート",
      "9: コーディネートに自信あり、周囲から褒められる",
      "8: 自分なりのスタイルがある、服装に気を使っている",
      "7: 基本的なコーデはできる、たまに新しい服を買う",
      "6: 清潔感のある服装、最低限のTPOは守る",
      "5: 無難な服装、特にこだわりはない",
      "4: あまり気にしていない、同じ服が多い",
      "3: 服装に無頓着、たまに指摘される",
      "2: TPOを守れていないことがある",
      "1: 全く気にしていない、何年も同じ服",
      "",
      "【3. 体づくり fitness】筋トレ・運動・体型維持",
      "10: 週5以上運動、理想の体型を維持、食事管理も完璧",
      "9: 週4-5回運動、体型維持に成功している",
      "8: 週3-4回運動、筋トレや有酸素を習慣化",
      "7: 週2-3回運動、継続的に取り組んでいる",
      "6: 週1-2回運動、意識して体を動かしている",
      "5: 月数回運動、たまに意識する程度",
      "4: ほとんど運動しない、歩く程度",
      "3: 運動習慣なし、たまに思い立って動く",
      "2: 全く運動しない、体型が気になり始めている",
      "1: 運動ゼロ、健康にも影響が出ている",
      "",
      "【4. 出会い行動 meetingActions】アプリ・イベント・紹介など機会を増やす",
      "10: 週に複数回出会いの場に参加、積極的にアプローチ",
      "9: 週1回以上出会いの行動、複数の手段を活用",
      "8: 週1回程度行動、マッチングアプリやイベントに参加",
      "7: 月2-3回行動、出会いの機会を意識的に作っている",
      "6: 月1-2回行動、たまにアプリやイベントを利用",
      "5: 月1回程度、最低限の行動はしている",
      "4: 数ヶ月に1回程度、気が向いたら行動",
      "3: ほとんど行動していない、受け身",
      "2: 半年以上行動なし、出会いを諦めかけている",
      "1: 全く行動していない、出会いの意思なし",
      "",
      "【5. デート行動 dateActions】誘う・計画・エスコート・実行",
      "10: 自分からプランを立てて誘える、エスコート完璧",
      "9: 積極的に誘える、デートプランも自分で考える",
      "8: 月1回以上デート、計画も自分でできる",
      "7: 月1回程度デート、誘うことに抵抗がなくなってきた",
      "6: 数ヶ月に1回デート、誘われれば行ける",
      "5: 半年に1回程度、デートの経験が少ない",
      "4: 1年以上デートしていない、誘い方がわからない",
      "3: デートの誘い方がわからない、緊張する",
      "2: デートに誘えない、断られるのが怖い",
      "1: デート経験なし、どうすればいいかわからない",
      "",
      "【6. 生活習慣 lifestyle】睡眠・食事・部屋の整理・規則正しい生活",
      "10: 睡眠・食事・運動バランス完璧、部屋も常に整理整頓",
      "9: 生活リズム安定、健康的な習慣が身についている",
      "8: 基本的に規則正しい、たまに乱れる程度",
      "7: 意識して生活習慣を整えている、改善中",
      "6: 最低限の生活習慣、大きな乱れはない",
      "5: 普通の生活、特に意識していない",
      "4: 生活リズムが乱れがち、夜更かし多い",
      "3: 不規則な生活、食事も偏りがち",
      "2: かなり乱れている、部屋も散らかっている",
      "1: 生活習慣が崩壊、健康にも影響",
      "",
      "【7. 話す力 speakingSkill】自分から話しかける・会話をリードする",
      "10: 誰とでも自然に会話できる、場を盛り上げられる",
      "9: 自分から話しかけられる、会話をリードできる",
      "8: 初対面でも会話できる、話題を振れる",
      "7: 自分から話しかけることが増えた、会話が続く",
      "6: 話しかけられれば会話できる、自分からも時々",
      "5: 普通に会話できる、自分からは少ない",
      "4: 会話は苦手ではないが、自分からは難しい",
      "3: 会話が苦手、続かないことが多い",
      "2: 話しかけるのが怖い、沈黙が多い",
      "1: ほとんど話せない、会話を避けている",
      "",
      "【8. 聞く力・共感力 listeningSkill】相手の話を聞く・共感・質問する",
      "10: 相手の話を引き出せる、共感力抜群、質問上手",
      "9: 相手の話をしっかり聞ける、適切な質問ができる",
      "8: 聞き上手、相手が話しやすい雰囲気を作れる",
      "7: 相手の話に興味を持って聞ける、共感できる",
      "6: 基本的に聞ける、たまに自分の話が多くなる",
      "5: 普通に聞ける、共感は意識している",
      "4: 聞いているが、リアクションが薄い",
      "3: 自分の話が多くなりがち、聞くのが苦手",
      "2: 相手の話に興味を持てない、上の空になる",
      "1: 全く聞けない、自分の話ばかり",
      "",
      "【9. ポジティブ思考 positiveThinking】前向きさ・自信・落ち込みすぎない",
      "10: 常にポジティブ、失敗も成長の機会と捉えられる",
      "9: 基本的に前向き、自信を持って行動できる",
      "8: ポジティブ思考を意識、落ち込んでも回復が早い",
      "7: 前向きに考えようとしている、自信がついてきた",
      "6: 普通、たまにネガティブになるが持ち直せる",
      "5: 普通、ネガティブとポジティブ半々",
      "4: ややネガティブ、自信がない時が多い",
      "3: ネガティブ思考が多い、すぐ諦めがち",
      "2: 自信がない、落ち込みやすい、回復に時間がかかる",
      "1: 非常にネガティブ、自己否定が強い",
      "",
      "【10. 継続力 consistency】毎日コツコツ・習慣化・諦めない",
      "10: 目標に向けて毎日継続、習慣化が完璧",
      "9: ほぼ毎日継続、たまに休んでも再開できる",
      "8: 週5-6日継続、習慣として定着してきた",
      "7: 週4-5日継続、意識して続けている",
      "6: 週3-4日継続、ムラはあるが頑張っている",
      "5: 週2-3日継続、最低限は続けている",
      "4: 週1日程度、続けようとはしている",
      "3: たまに思い出した時だけ、すぐ途切れる",
      "2: ほとんど続かない、3日坊主",
      "1: 何も続かない、すぐ諦める",
      "",
      "【ペルソナタイプの選び方】",
      "ユーザーの回答（出会い方・困りごと・行動入力の内容と数）を分析し、以下の5つから必ず1つだけ選ぶこと。",
      "1. アプリ改善型 2. リアル出会い型 3. ハイブリッド型 4. 自分磨き優先型 5. 行動量不足型",
      "",
      "【一言コーチング coach_comment】4つの文章を返す",
      "必ず4つの「異なる」文章を返すこと。内容が被らないこと。",
      "1. 承認文：ユーザーの具体的な努力を1つ取り上げて褒める（行動入力から具体的に1つ指摘すること）",
      "2. 気づきの問いかけ：「〇〇についてどう感じた？」「なぜそうしようと思った？」など、自己理解を促す質問を1つ",
      "3. 改善ポイント：最も効果的な改善ポイントを1つだけ具体的に提案（説教しない・1点に絞る）",
      "4. 応援メッセージ：前向きな一言で締める（「次の一手」とは別に、励ましや背中を押す一言）",
      "重要：4つの文章は絶対に重複させないこと。それぞれ異なる内容にすること。チャレンジと被らないこと。",
      "",
      "【困りごと別の対応方針】",
      "ユーザーが選択した「困りごと」に基づいて、チャレンジとコーチングの重点を決めること。複数選択時は全てに対応するチャレンジを含め、最も深刻そうな困りごとを重点に。",
      "",
      "【今週のチャレンジ challenges】3つ生成すること。難易度を分けて生成すること。",
      "1つ目: 簡単（difficulty: \"easy\"）— 日常で気軽にできること。",
      "2つ目: 中級（difficulty: \"medium\"）— 少し勇気がいること。",
      "3つ目: 挑戦（difficulty: \"challenge\"）— 大きな一歩になること。",
      "各チャレンジは1文で具体的に。JSONでは challenges: [{ text: \"...\", difficulty: \"easy\" }, ...] の形で返すこと。",
      "",
      "【評価理由】",
      "なぜこの点数なのか、ユーザーが理解できるように、coach_commentや各カテゴリのスコアの根拠を意識して判定すること。",
      "overall_score は10カテゴリの合計点（0〜100の整数）とすること。",
      "",
      "建設的なフィードバックのみ参考にし、悪意や無関係な内容は無視すること。",
    ].join("\n");

    if (latestFeedbackComments.length > 0) {
      const feedbackLines = latestFeedbackComments.map((c) => `- ${c}`).join("\n");
      systemPrompt += `\n\n【このユーザーからの過去のリクエスト】\n${feedbackLines}\nこのリクエストを考慮して、より的確なアドバイスをしてください。特に要望があった部分は詳しく説明してください。`;
    }

    if (goodExamples.length > 0) {
      const examplesText = goodExamples
        .map((ex, i) => {
          const input = `入力: 回答=${JSON.stringify(ex.answers)} 行動=${JSON.stringify(ex.actions)}`;
          const output = `出力（参考）: ${JSON.stringify(ex.result)}`;
          const commentLine = ex.comment ? `\nフィードバックコメント: ${ex.comment}` : "";
          return `【例${i + 1}】\n${input}\n${output}${commentLine}`;
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
      "persona_type は上記5タイプのいずれか1つを、入力に基づいて選ぶこと。",
      "category_scores は10カテゴリそれぞれに1〜10の整数を付ける。overall_score は10カテゴリの合計（0〜100の整数）。",
      "coach_comment は4要素の配列：[承認文, 気づきの問いかけ, 改善ポイント, 応援メッセージ] の順。",
      '{',
      '  "persona_type": "選んだタイプをそのまま文字列で",',
      '  "overall_score": 50,',
      '  "category_scores": { "cleanliness": 5, "fashion": 5, "fitness": 5, "meetingActions": 5, "dateActions": 5, "lifestyle": 5, "speakingSkill": 5, "listeningSkill": 5, "positiveThinking": 5, "consistency": 5 },',
      '  "coach_comment": ["承認文（努力を1つ具体指名）", "気づきの問いかけ（1つ）", "改善ポイント（1つだけ具体的に）", "応援メッセージ（前向きな一言で締める）"],',
      '  "challenges": [',
      '    { "text": "簡単なチャレンジ（日常で気軽にできること・1文）", "difficulty": "easy" },',
      '    { "text": "中級のチャレンジ（少し勇気がいること・1文）", "difficulty": "medium" },',
      '    { "text": "挑戦のチャレンジ（大きな一歩になること・1文）", "difficulty": "challenge" }',
      '  ],',
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
      "- 各category_scoresは1〜10の整数。overall_scoreは10カテゴリの合計で0〜100の整数。",
      "- coach_commentは必ず4文で、順に「承認文・気づきの問いかけ・改善ポイント・応援メッセージ」。重複禁止。",
      "- challengesは3つ。1つ目easy、2つ目medium、3つ目challenge。各1文で具体的に。",
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

    // 今回のスコアにチャレンジ達成ボーナスを加点（簡単+1、中級+2、挑戦+3、最大+6点、100点上限）
    const easyDone = body.challenge_easy_done === true || (Array.isArray(body.challenge_bonus) && body.challenge_bonus[0] === true);
    const mediumDone = body.challenge_medium_done === true || (Array.isArray(body.challenge_bonus) && body.challenge_bonus[1] === true);
    const hardDone = body.challenge_hard_done === true || (Array.isArray(body.challenge_bonus) && body.challenge_bonus[2] === true);
    let bonusPoints = 0;
    if (easyDone) bonusPoints += 1;
    if (mediumDone) bonusPoints += 2;
    if (hardDone) bonusPoints += 3;
    normalized.challengeBonus = bonusPoints;
    normalized.overall_score = Math.min(100, normalized.overall_score + bonusPoints);

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

    const challenges = normalized.challenges;
    const insertPayload = {
      anonymous_user_id: String(body.anonymous_user_id ?? ""),
      answers: JSON.parse(JSON.stringify(body.form ?? {})),
      actions: body.actions ?? [],
      result: JSON.parse(JSON.stringify(normalized)),
      challenge_easy: challenges[0]?.text ?? null,
      challenge_medium: challenges[1]?.text ?? null,
      challenge_hard: challenges[2]?.text ?? null,
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

    // 前回の診断行にチャレンジ達成フラグを記録（今回のリクエストの _done は前回分）
    const prevRow = history[0];
    if (prevRow?.id && (body.challenge_easy_done !== undefined || body.challenge_medium_done !== undefined || body.challenge_hard_done !== undefined || (Array.isArray(body.challenge_bonus) && body.challenge_bonus.length >= 3))) {
      const prevDone = {
        challenge_easy_done: body.challenge_easy_done === true || (Array.isArray(body.challenge_bonus) && body.challenge_bonus[0] === true),
        challenge_medium_done: body.challenge_medium_done === true || (Array.isArray(body.challenge_bonus) && body.challenge_bonus[1] === true),
        challenge_hard_done: body.challenge_hard_done === true || (Array.isArray(body.challenge_bonus) && body.challenge_bonus[2] === true),
      };
      const { error: updateErr } = await supabase
        .from("evaluations")
        .update(prevDone)
        .eq("id", prevRow.id);
      if (updateErr) {
        console.error("[evaluate] Previous row challenge_done update error:", updateErr);
      }
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

