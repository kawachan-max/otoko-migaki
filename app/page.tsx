"use client";

import { useEffect, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

type Age = "18-22" | "23-29" | "30-39" | "40+";
type Experience = "ほぼなし" | "少し" | "交際経験あり";
type MeetMethod = "アプリ" | "紹介" | "職場学校" | "趣味" | "イベント";
type Goal = "彼女が欲しい" | "デート経験増やしたい" | "結婚視野";
type TimeBudget = "〜1h" | "1-3h" | "3-7h" | "毎日少し";
type Region = "都市部" | "地方";

type EvaluateRequest = {
  anonymous_user_id: string;
  form: {
    age: Age;
    experience: Experience;
    meet_methods: MeetMethod[];
    goal: Goal;
    problems: string[];
    time_budget: TimeBudget;
    region: Region;
  };
  actions: string[];
};

type EvaluateResponse = {
  evaluation_id?: string;
  persona_type: string;
  overall_score: number; // 0-100（10カテゴリ合計）
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
  challenges: { text: string; difficulty: "easy" | "medium" | "challenge" }[];
  template: { title: string; content: string };
  is_first_time?: boolean;
  visit_count?: number;
  growth_comment?: string | null;
  changes_from_last?: { improved: string[]; needs_work: string[] } | null;
  /** 今回加算したチャレンジボーナス点（0〜6） */
  challengeBonus?: number;
};

const meetMethodOptions: MeetMethod[] = ["アプリ", "紹介", "職場学校", "趣味", "イベント"];

const problemOptions: string[] = [
  "見た目の印象が良くない",
  "会話が続かない・苦手",
  "出会いの機会がない",
  "デートに誘えない",
  "自分に自信が持てない",
  "生活リズムが乱れている",
  "何から始めればいいか分からない",
];

function clampCategoryScore(n: number) {
  if (!Number.isFinite(n)) return 1;
  return Math.min(10, Math.max(1, Math.round(n)));
}

function clampOverallScore(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function AxisBar({ label, score }: { label: string; score: number }) {
  const s = clampCategoryScore(score);
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex items-center justify-between gap-2 text-sm text-slate-600">
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 tabular-nums">{s}/10</span>
      </div>
      <div className="h-2.5 w-full min-w-0 rounded-full bg-slate-100">
        <div className="h-2.5 rounded-full bg-blue-500" style={{ width: `${(s / 10) * 100}%` }} />
      </div>
    </div>
  );
}

const CATEGORY_DISPLAY: { key: keyof EvaluateResponse["category_scores"]; label: string }[] = [
  { key: "cleanliness", label: "清潔感（髪型・肌・爪・服装）" },
  { key: "fashion", label: "ファッション（服装・コーデ）" },
  { key: "fitness", label: "体づくり（筋トレ・運動）" },
  { key: "meetingActions", label: "出会い行動（機会を増やす）" },
  { key: "dateActions", label: "デート行動（誘う・計画）" },
  { key: "lifestyle", label: "生活習慣（睡眠・食事・整理）" },
  { key: "speakingSkill", label: "話す力（会話をリードする）" },
  { key: "listeningSkill", label: "聞く力（共感・質問する）" },
  { key: "positiveThinking", label: "ポジティブ思考（前向きさ）" },
  { key: "consistency", label: "継続力（習慣化・諦めない）" },
];

type HistoryItem = { attempt: number; score: number; date: string };

function getXAxisTicksForAll(total: number): number[] {
  if (total <= 0) return [];
  const last = total;
  let ticks: number[];
  if (total <= 20) ticks = [1, 5, 10, 15, 20].filter((t) => t <= total);
  else if (total <= 50) ticks = [1, 10, 25, 50].filter((t) => t <= total);
  else if (total <= 100) ticks = [1, 25, 50, 75, 100].filter((t) => t <= total);
  else if (total <= 200) ticks = [1, 50, 100, 150, 200].filter((t) => t <= total);
  else if (total <= 500) ticks = [1, 100, 200, 300, 400, 500].filter((t) => t <= total);
  else if (total <= 1000) ticks = [1, 200, 400, 600, 800, 1000].filter((t) => t <= total);
  else {
    const step = total <= 2000 ? 500 : Math.ceil(total / 5 / 500) * 500;
    ticks = [1];
    for (let v = step; v < total; v += step) ticks.push(v);
  }
  if (last > 0 && !ticks.includes(last)) ticks = [...ticks, last].sort((a, b) => a - b);
  return ticks;
}

type GrowthChartTab = "last10" | "all";

function GrowthRecordChart({ history }: { history: HistoryItem[] }) {
  const [tab, setTab] = useState<GrowthChartTab>("last10");
  const totalAttempts = history.length;
  if (!totalAttempts) return null;

  const last10 = history.slice(-10);
  const dataLast10 = last10;
  const dataAll = history;
  const data = tab === "last10" ? dataLast10 : dataAll;
  const ticksAll = getXAxisTicksForAll(totalAttempts);
  const last10Min = dataLast10.length > 0 ? dataLast10[0].attempt : 1;
  const last10Max = dataLast10.length > 0 ? dataLast10[dataLast10.length - 1].attempt : 1;

  return (
    <div className="min-w-0 overflow-hidden rounded-xl bg-white p-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("last10")}
          className={[
            "min-h-[48px] min-w-0 flex-1 rounded-xl px-4 py-2 text-sm font-medium transition",
            tab === "last10"
              ? "bg-blue-500 text-white"
              : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
          ].join(" ")}
        >
          直近10回
        </button>
        <button
          type="button"
          onClick={() => setTab("all")}
          className={[
            "min-h-[48px] min-w-0 flex-1 rounded-xl px-4 py-2 text-sm font-medium transition",
            tab === "all"
              ? "bg-blue-500 text-white"
              : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
          ].join(" ")}
        >
          全期間
        </button>
      </div>
      <div className="mt-3 h-[200px] min-h-[200px] w-full min-w-0 overflow-hidden">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            {tab === "last10" ? (
              <XAxis
                dataKey="attempt"
                type="number"
                domain={[last10Min, last10Max]}
                tick={{ fontSize: 10, fill: "#64748b" }}
                allowDecimals={false}
              />
            ) : (
              <XAxis
                dataKey="attempt"
                type="number"
                domain={[1, totalAttempts]}
                tick={{ fontSize: 10, fill: "#64748b" }}
                ticks={ticksAll}
                allowDecimals={false}
              />
            )}
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#64748b" }} width={28} />
            <Tooltip
              contentStyle={{ backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px" }}
              formatter={(value: number) => [`${value}点`, "スコア"]}
              labelFormatter={(_: string, payload: { payload?: HistoryItem }[]) =>
                payload[0]?.payload ? `${payload[0].payload.date}（第${payload[0].payload.attempt}回）` : ""
              }
            />
            <Line
              type="monotone"
              dataKey="score"
              stroke="#3B82F6"
              strokeWidth={2}
              dot={{ r: 4, fill: "#3B82F6", stroke: "#fff", strokeWidth: 1.5 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-3 text-center text-sm text-slate-600">これまでの診断回数: {totalAttempts}回</p>
    </div>
  );
}

function normalizeLines(input: string) {
  return input
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function Home() {
  const [anonymousUserId, setAnonymousUserId] = useState<string>("");

  // form states（初回は未選択。履歴があれば pre-fill で上書き）
  const [age, setAge] = useState<Age | "">("");
  const [experience, setExperience] = useState<Experience | "">("");
  const [meetMethods, setMeetMethods] = useState<MeetMethod[]>([]);
  const [goal, setGoal] = useState<Goal | "">("");
  const [problems, setProblems] = useState<string[]>([]);
  const [timeBudget, setTimeBudget] = useState<TimeBudget | "">("");
  const [region, setRegion] = useState<Region | "">("");

  const [actionsText, setActionsText] = useState<string>("");
  const actions = useMemo(() => normalizeLines(actionsText), [actionsText]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EvaluateResponse | null>(null);

  // result UI states
  const [challengeBonus, setChallengeBonus] = useState<[boolean, boolean, boolean]>([false, false, false]);
  const [lastResult, setLastResult] = useState<{ challenges: { text: string; difficulty: string }[] } | null>(null);

  /** 診断に送る行動記録（自由記述 + チェックしたチャレンジを【チャレンジ達成】として追加、最大10件） */
  const actionsToSend = useMemo(() => {
    const base = actions;
    if (lastResult?.challenges?.length === 3) {
      const fromChallenges = lastResult.challenges
        .filter((_, i) => challengeBonus[i])
        .map((c) => `【チャレンジ達成】${c.text}`);
      return [...base, ...fromChallenges].slice(0, 10);
    }
    return base;
  }, [actions, lastResult, challengeBonus]);

  /** 診断ボタン有効：初回は行動記録必須、2回目以降は行動記録またはチャレンジチェック1つ以上（actionsToSend に反映） */
  const canSubmitByActions = actionsToSend.length >= 1;
  const [feedback, setFeedback] = useState<number>(0);
  const [feedbackComment, setFeedbackComment] = useState<string>("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackSending, setFeedbackSending] = useState(false);
  const FEEDBACK_COMMENT_MAX = 200;

  const [formLoadedFromHistory, setFormLoadedFromHistory] = useState(false);
  const [hasHistory, setHasHistory] = useState(false);
  const [isFormExpanded, setIsFormExpanded] = useState(false);

  // 週次レポート
  const [weeklyReport, setWeeklyReport] = useState<{
    history: { attempt: number; score: number; date: string }[];
    totalAttempts: number;
    thisWeek: { count: number; averageScore: number };
    lastWeek: { count: number; averageScore: number };
    scoreDiff: number;
  } | null>(null);
  const [weeklyReportLoading, setWeeklyReportLoading] = useState(false);

  useEffect(() => {
    const key = "anonymous_user_id";
    const existing = window.localStorage.getItem(key);
    if (existing) {
      setAnonymousUserId(existing);
      return;
    }
    const id = uuidv4();
    window.localStorage.setItem(key, id);
    setAnonymousUserId(id);
  }, []);

  useEffect(() => {
    if (!anonymousUserId || formLoadedFromHistory) return;
    const params = new URLSearchParams({ anonymous_user_id: anonymousUserId });
    fetch(`/api/user-history?${params}`)
      .then((res) => res.json())
      .then((data: { answers?: Record<string, unknown>; lastResult?: { challenges: { text: string; difficulty: string }[] } | null }) => {
        const a = data?.answers;
        setHasHistory(typeof a === "object" && a !== null);
        if (data?.lastResult?.challenges?.length === 3) {
          setLastResult({ challenges: data.lastResult.challenges });
        }
        if (typeof a === "object" && a !== null) {
          const ageVal = a.age;
          if (typeof ageVal === "string" && ["18-22", "23-29", "30-39", "40+"].includes(ageVal)) {
            setAge(ageVal as Age);
          }
          const expVal = a.experience;
          if (typeof expVal === "string" && ["ほぼなし", "少し", "交際経験あり"].includes(expVal)) {
            setExperience(expVal as Experience);
          }
          const goalVal = a.goal;
          if (typeof goalVal === "string" && ["彼女が欲しい", "デート経験増やしたい", "結婚視野"].includes(goalVal)) {
            setGoal(goalVal as Goal);
          }
          const timeVal = a.time_budget;
          if (typeof timeVal === "string" && ["〜1h", "1-3h", "3-7h", "毎日少し"].includes(timeVal)) {
            setTimeBudget(timeVal as TimeBudget);
          }
          const regionVal = a.region;
          if (typeof regionVal === "string" && ["都市部", "地方"].includes(regionVal)) {
            setRegion(regionVal as Region);
          }
          const meetVal = a.meet_methods;
          if (Array.isArray(meetVal)) {
            const arr = meetVal.filter((x): x is MeetMethod => typeof x === "string" && meetMethodOptions.includes(x as MeetMethod));
            if (arr.length > 0) setMeetMethods(arr);
          }
          const problemsVal = a.problems;
          if (Array.isArray(problemsVal)) {
            const arr = problemsVal.filter((x) => typeof x === "string" && problemOptions.includes(x));
            if (arr.length > 0) setProblems(arr);
          }
        }
        setFormLoadedFromHistory(true);
      })
      .catch(() => setFormLoadedFromHistory(true));
  }, [anonymousUserId, formLoadedFromHistory]);

  async function onSubmit() {
    setError(null);
    setResult(null);
    setCopyState("idle");
    setFeedback(0);
    setFeedbackComment("");
    setFeedbackSent(false);

    if (!anonymousUserId) {
      setError("初期化中です。数秒後にもう一度お試しください。");
      return;
    }
    if (actionsToSend.length < 1 || actionsToSend.length > 10) {
      setError("行動記録かチャレンジのチェックを1つ以上入れてね（最大10件）");
      return;
    }
    if (meetMethods.length === 0) {
      setError("出会い方を1つ以上選んでください。");
      return;
    }
    if (!age || !experience || !goal || !timeBudget || !region) {
      setError("年齢・恋愛経験・目的・使える時間・地域を選択してください。");
      return;
    }

    setIsLoading(true);
    try {
      const payload: EvaluateRequest = {
        anonymous_user_id: anonymousUserId,
        form: {
          age,
          experience,
          meet_methods: meetMethods,
          goal,
          problems,
          time_budget: timeBudget,
          region,
        },
        actions: actionsToSend,
        ...(lastResult?.challenges?.length === 3
          ? {
              challenge_bonus: challengeBonus,
              challenge_easy_done: challengeBonus[0],
              challenge_medium_done: challengeBonus[1],
              challenge_hard_done: challengeBonus[2],
            }
          : {}),
      };

      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          typeof data === "object" && data !== null && "error" in data && typeof (data as { error?: unknown }).error === "string"
            ? (data as { error: string }).error
            : "診断に失敗しました。時間をおいてもう一度お試しください。";
        throw new Error(msg);
      }

      setResult(data as EvaluateResponse);

      // 週次レポートを取得
      if (anonymousUserId) {
        setWeeklyReportLoading(true);
        try {
          const params = new URLSearchParams({ anonymous_user_id: anonymousUserId });
          const reportRes = await fetch(`/api/weekly-report?${params}`);
          if (reportRes.ok) {
            const reportData = (await reportRes.json()) as {
              history: { attempt: number; score: number; date: string }[];
              totalAttempts: number;
              thisWeek: { count: number; averageScore: number };
              lastWeek: { count: number; averageScore: number };
              scoreDiff: number;
            };
            setWeeklyReport(reportData);
          }
        } catch (e) {
          console.error("[page] Weekly report fetch error:", e);
        } finally {
          setWeeklyReportLoading(false);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラーが発生しました。");
    } finally {
      setIsLoading(false);
    }
  }

  async function submitFeedback() {
    if (!result?.evaluation_id || feedbackSent) return;
    const score = feedback;
    if (score < 1 || score > 5) return;
    setFeedbackSending(true);
    try {
      const commentToSend =
        typeof feedbackComment === "string" && feedbackComment.trim().length > 0
          ? feedbackComment.trim().slice(0, FEEDBACK_COMMENT_MAX)
          : undefined;
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evaluation_id: result.evaluation_id,
          helpful_score: score,
          mismatch_areas: [],
          comment: commentToSend,
        }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          typeof data === "object" && data !== null && "error" in data && typeof (data as { error?: unknown }).error === "string"
            ? (data as { error: string }).error
            : "送信に失敗しました。";
        throw new Error(msg);
      }
      setFeedbackSent(true);
      setFeedbackComment("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "送信に失敗しました。");
    } finally {
      setFeedbackSending(false);
    }
  }

  async function copyTemplate() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.template.content);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1200);
    } catch {
      setCopyState("failed");
      window.setTimeout(() => setCopyState("idle"), 1200);
    }
  }

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-white">
      <div className="mx-auto w-full min-w-0 max-w-2xl px-4 py-8 sm:py-10">
        <header className="space-y-2">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl md:text-3xl">
            男磨きAI
          </h1>
          <p className="text-sm text-slate-700 sm:text-base md:text-lg">
            恋愛経験ゼロから彼女ゲットまで応援！AIが一緒に成長する恋のコーチ
          </p>
          <p className="text-sm text-slate-500 sm:text-sm">
            匿名・無料・1分で診断 & 続けるほど成長が見えます
          </p>
        </header>

        <div className="mt-6 space-y-5 sm:mt-8 sm:space-y-6">
          {(hasHistory && isFormExpanded) || !hasHistory ? (
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900 sm:text-base">診断フォーム（7問）</h2>
                {hasHistory && (
                  <button
                    type="button"
                    onClick={() => setIsFormExpanded(false)}
                    className="min-h-[48px] shrink-0 px-2 text-sm font-medium text-slate-500 hover:text-slate-700 hover:underline"
                  >
                    条件を閉じる ▲
                  </button>
                )}
              </div>

            <div className="mt-4 grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">1. 年齢</label>
                <select
                  value={age}
                  onChange={(e) => setAge(e.target.value as Age | "")}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">選択してください</option>
                  <option value="18-22">18-22</option>
                  <option value="23-29">23-29</option>
                  <option value="30-39">30-39</option>
                  <option value="40+">40+</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">2. 恋愛経験</label>
                <select
                  value={experience}
                  onChange={(e) => setExperience(e.target.value as Experience | "")}
                  className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">選択してください</option>
                  <option value="ほぼなし">ほぼなし</option>
                  <option value="少し">少し</option>
                  <option value="交際経験あり">交際経験あり</option>
                </select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700">3. 出会い方（複数選択可）</label>
                  <span className="text-sm text-slate-500">{meetMethods.length}件選択</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {meetMethodOptions.map((m) => {
                    const checked = meetMethods.includes(m);
                    return (
                      <label
                        key={m}
                        className={[
                          "flex items-center gap-2 rounded-xl border px-3 py-3 text-sm",
                          checked ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white",
                        ].join(" ")}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? Array.from(new Set([...meetMethods, m]))
                              : meetMethods.filter((x) => x !== m);
                            setMeetMethods(next);
                          }}
                          className="h-4 w-4 accent-blue-500"
                        />
                        <span className="text-slate-800">{m}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">4. 目的</label>
                <select
                  value={goal}
                  onChange={(e) => setGoal(e.target.value as Goal | "")}
                  className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">選択してください</option>
                  <option value="彼女が欲しい">彼女が欲しい</option>
                  <option value="デート経験増やしたい">デート経験増やしたい</option>
                  <option value="結婚視野">結婚視野</option>
                </select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700">5. 困りごと（複数選択可）</label>
                  <span className="text-xs text-slate-500">{problems.length}件選択</span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {problemOptions.map((p) => {
                    const checked = problems.includes(p);
                    return (
                      <label
                        key={p}
                        className={[
                          "flex min-h-[48px] items-center gap-2 rounded-xl border px-3 py-3 text-sm",
                          checked ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white",
                        ].join(" ")}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setProblems((prev) =>
                              e.target.checked ? [...prev, p] : prev.filter((x) => x !== p)
                            );
                          }}
                          className="h-5 w-5 shrink-0 accent-blue-500"
                        />
                        <span className="text-slate-800">{p}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">6. 使える時間</label>
                <select
                  value={timeBudget}
                  onChange={(e) => setTimeBudget(e.target.value as TimeBudget | "")}
                  className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">選択してください</option>
                  <option value="〜1h">〜1h</option>
                  <option value="1-3h">1-3h</option>
                  <option value="3-7h">3-7h</option>
                  <option value="毎日少し">毎日少し</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">7. 地域</label>
                <select
                  value={region}
                  onChange={(e) => setRegion(e.target.value as Region | "")}
                  className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">選択してください</option>
                  <option value="都市部">都市部</option>
                  <option value="地方">地方</option>
                </select>
              </div>
            </div>
          </section>
          ) : null}

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-sm font-semibold text-slate-900 sm:text-base">男磨きの行動記録</h2>
            <p className="mt-1 text-sm text-slate-600">悩み解決や目標達成のために今日頑張ったことは？（改行で複数入力できるよ）</p>
            <textarea
              value={actionsText}
              onChange={(e) => setActionsText(e.target.value)}
              placeholder={"例：マッチングアプリでメッセージを送った、筋トレした、新しい服を買った"}
              rows={7}
              className="mt-3 min-h-[44px] w-full min-w-0 resize-none rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm leading-6 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            <p className="mt-2 text-sm text-slate-500">具体的に書くほど、的確なアドバイスができるよ！</p>
            <div className="mt-2 flex items-center justify-between text-sm text-slate-500">
              <span>入力数: {actionsToSend.length}個</span>
              <span className="tabular-nums">匿名ID: {anonymousUserId ? anonymousUserId.slice(0, 8) : "..."}</span>
            </div>

            {lastResult?.challenges?.length === 3 && (
              <>
                <hr className="my-5 border-slate-200" />
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900">🎁 前回のチャレンジ達成ボーナス</h3>
                  <p className="text-sm text-slate-600">
                    前回出したチャレンジのうち、できたものにチェックを入れてください。達成分だけ今回のスコアにボーナス加点されます。
                  </p>
                  <div className="space-y-2">
                    {lastResult.challenges.map((c, i) => {
                      const diff = c.difficulty ?? (i === 0 ? "easy" : i === 1 ? "medium" : "challenge");
                      const icon = diff === "easy" ? "🟢" : diff === "medium" ? "🟡" : "🔴";
                      const label = diff === "easy" ? "【簡単】" : diff === "medium" ? "【中級】" : "【挑戦】";
                      const bonus = diff === "easy" ? "+1点" : diff === "medium" ? "+2点" : "+3点";
                      return (
                        <label key={i} className="flex min-h-[48px] items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                          <input
                            type="checkbox"
                            checked={challengeBonus[i]}
                            onChange={(e) => {
                              setChallengeBonus((prev) => {
                                const next: [boolean, boolean, boolean] = [prev[0], prev[1], prev[2]];
                                next[i as 0 | 1 | 2] = e.target.checked;
                                return next;
                              });
                            }}
                            className="mt-1 h-5 w-5 shrink-0 accent-blue-500"
                          />
                          <span className="text-sm text-slate-800">
                            {icon} {label} {c.text} → {bonus}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {error && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={onSubmit}
              disabled={isLoading || !canSubmitByActions}
              className={[
                "mt-4 flex min-h-[48px] w-full min-w-0 items-center justify-center rounded-2xl bg-blue-500 px-4 py-4 text-base font-semibold text-white shadow-sm transition",
                "hover:bg-blue-600 active:bg-blue-700",
                "disabled:cursor-not-allowed disabled:opacity-60",
              ].join(" ")}
            >
              {isLoading ? "診断中..." : "診断する"}
            </button>

            {!canSubmitByActions && !isLoading && (
              <p className="mt-2 text-center text-sm text-slate-500">
                行動記録を入力するか、チャレンジにチェックを入れてください
              </p>
            )}

            {hasHistory && !isFormExpanded && (
              <button
                type="button"
                onClick={() => setIsFormExpanded(true)}
                className="mt-3 flex min-h-[48px] w-full items-center justify-center text-center text-sm text-slate-500 hover:text-slate-700 hover:underline"
              >
                条件を変更する ▼
              </button>
            )}
          </section>

          {result && (
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <h2 className="text-sm font-semibold text-slate-900 sm:text-base">結果</h2>
                  {(result.visit_count ?? 0) >= 2 && (
                    <p className="text-sm font-medium text-blue-600">{result.visit_count}回目の判定です！</p>
                  )}
                  <p className="text-sm text-slate-600">ペルソナタイプ: <span className="font-medium text-slate-900">{result.persona_type}</span></p>
                </div>
                <div className="shrink-0 text-left sm:text-right">
                  <div className="text-sm text-slate-500">合計点</div>
                  <div className="mt-1 text-xl font-bold tabular-nums text-slate-900 sm:text-2xl">
                    {clampOverallScore(result.overall_score)}<span className="text-base font-semibold text-slate-500 sm:text-lg">/100点</span>
                  </div>
                  {(result.challengeBonus ?? 0) > 0 && (
                    <p className="mt-1 text-sm font-medium text-amber-600">
                      🎁 チャレンジボーナス: +{result.challengeBonus}点
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => {
                    const shareText = `男磨きAIで診断したよ！スコアは${clampOverallScore(result.overall_score)}点 / 100点 🎉\n\nhttps://otoko-migaki.vercel.app`;
                    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
                    window.open(tweetUrl, "_blank");
                  }}
                  className="inline-flex min-h-[48px] items-center gap-2 rounded-lg bg-[#000000] px-6 py-3 text-sm font-medium text-white transition hover:bg-[#1a1a1a]"
                  aria-label="結果をXでシェア"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
                    />
                  </svg>
                  結果をXでシェア
                </button>
              </div>

              {result.growth_comment && (
                <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 p-4">
                  <div className="text-sm font-semibold text-green-900">前回からの成長</div>
                  <p className="mt-2 text-sm text-green-800">{result.growth_comment}</p>
                  {result.changes_from_last && (result.changes_from_last.improved.length > 0 || result.changes_from_last.needs_work.length > 0) && (
                    <div className="mt-3 space-y-2">
                      {result.changes_from_last.improved.length > 0 && (
                        <div>
                          <span className="text-sm font-medium text-green-700">改善した点</span>
                          <ul className="mt-1 list-disc pl-5 text-sm text-green-800">
                            {result.changes_from_last.improved.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {result.changes_from_last.needs_work.length > 0 && (
                        <div>
                          <span className="text-xs font-medium text-blue-700">まだ課題の点</span>
                          <ul className="mt-1 list-disc pl-5 text-sm text-blue-800">
                            {result.changes_from_last.needs_work.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-5 grid grid-cols-1 gap-3">
                {CATEGORY_DISPLAY.map(({ key, label }, i) => (
                  <AxisBar key={key} label={`${i + 1}. ${label}`} score={result.category_scores[key]} />
                ))}
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">一言コーチング</div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {result.coach_comment.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>

              <div className="mt-5">
                <div className="text-sm font-semibold text-slate-900">💡 今週のチャレンジ（できそうなものだけでOK）</div>
                <div className="mt-2 space-y-2">
                  {(result.challenges ?? []).map((c, i) => {
                    const difficulty = c.difficulty ?? (i === 0 ? "easy" : i === 1 ? "medium" : "challenge");
                    const icon = difficulty === "easy" ? "🟢" : difficulty === "medium" ? "🟡" : "🔴";
                    const label = difficulty === "easy" ? "【簡単】" : difficulty === "medium" ? "【中級】" : "【挑戦】";
                    const bonus = difficulty === "easy" ? "+1点" : difficulty === "medium" ? "+2点" : "+3点";
                    return (
                      <div key={i} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                        <span className="text-sm text-slate-800">
                          {icon} {label} {c.text} → {bonus}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 text-sm text-slate-600">
                  挑戦した分だけ次回ボーナス加点されます！
                </p>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">テンプレ：{result.template.title}</div>
                    <p className="mt-1 text-sm text-slate-500">コピーボタンで貼り付け用テキストをコピーできます。</p>
                  </div>
                  <button
                    type="button"
                    onClick={copyTemplate}
                    className="shrink-0 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
                  >
                    {copyState === "copied" ? "コピーした" : copyState === "failed" ? "失敗" : "コピー"}
                  </button>
                </div>
                <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-800">
                  {result.template.content}
                </pre>
              </div>

              {(weeklyReportLoading || weeklyReport) && (
                <div className="mt-6 min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm sm:p-5">
                  <h3 className="text-center text-sm font-semibold text-slate-900">📈 あなたの成長記録</h3>
                  {weeklyReportLoading ? (
                    <div className="mt-4 text-center text-sm text-slate-600">集計中...</div>
                  ) : weeklyReport && weeklyReport.totalAttempts > 0 ? (
                    <div className="mt-4">
                      <GrowthRecordChart history={weeklyReport.history} />
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl bg-white px-4 py-6 text-center text-sm text-slate-600">
                      まだ診断データがありません
                    </div>
                  )}
                </div>
              )}

              <div className="mt-6 border-t border-slate-100 pt-5">
                <h3 className="text-sm font-semibold text-slate-900">フィードバック</h3>
                <p className="mt-1 text-sm text-slate-600">あなたの声で、次のアドバイスがもっと的確に！</p>
                <p className="mt-2 text-sm font-medium text-slate-700">この診断、役に立った？</p>
                <div className="mt-2 flex gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setFeedback(n)}
                      disabled={feedbackSending || feedbackSent}
                      className={[
                        "flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl border text-lg transition",
                        feedback >= n ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-400",
                        "hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed",
                      ].join(" ")}
                      aria-label={`フィードバック ${n} / 5`}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <div className="mt-4 space-y-1">
                  <label className="text-sm text-slate-700">
                    感想を書いて送信すると、あなた専用へと精度が上がります。（任意）
                  </label>
                  <textarea
                    value={feedbackComment}
                    onChange={(e) => setFeedbackComment(e.target.value.slice(0, FEEDBACK_COMMENT_MAX))}
                    placeholder="例：デートの誘い方をもっと詳しく教えてほしい"
                    rows={3}
                    disabled={feedbackSending || feedbackSent}
                    className="mt-1 min-h-[44px] w-full min-w-0 resize-none rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm leading-6 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
                  />
                  <p className="text-right text-sm text-slate-500">
                    {feedbackComment.length}/{FEEDBACK_COMMENT_MAX}文字
                  </p>
                </div>
                {!feedbackSent && (
                  <button
                    type="button"
                    onClick={submitFeedback}
                    disabled={feedbackSending || feedback < 1}
                    className={[
                      "mt-4 flex min-h-[48px] w-full min-w-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 transition",
                      "hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60",
                    ].join(" ")}
                  >
                    {feedbackSending ? "送信中..." : "送信する"}
                  </button>
                )}
                {feedbackSent && (
                  <p className="mt-4 text-sm font-medium text-blue-600">
                    ありがとう！あなたと仲間のために、次から反映されるよ！
                  </p>
                )}
              </div>
            </section>
          )}

          <footer className="pb-8 pt-4 text-center text-sm text-slate-400">
            <p>※ 医療・法律などの専門助言ではありません。つらい時は信頼できる人や専門家にも相談してね。</p>
          </footer>
        </div>
      </div>
    </div>
  );
}
