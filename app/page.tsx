"use client";

import { useEffect, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";

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
  overall_score: number; // 1-5
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
  is_first_time?: boolean;
  visit_count?: number;
  growth_comment?: string | null;
  changes_from_last?: { improved: string[]; needs_work: string[] } | null;
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

function clampScore(n: number) {
  if (!Number.isFinite(n)) return 1;
  return Math.min(5, Math.max(1, Math.round(n)));
}

function Stars({ score }: { score: number }) {
  const s = clampScore(score);
  const filled = "★".repeat(s);
  const empty = "☆".repeat(5 - s);
  return (
    <span className="font-semibold tracking-wide text-slate-900" aria-label={`総合スコア ${s} / 5`}>
      {filled}
      <span className="text-slate-300">{empty}</span>
    </span>
  );
}

function AxisBar({ label, score }: { label: string; score: number }) {
  const s = clampScore(score);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-slate-600">
        <span>{label}</span>
        <span className="tabular-nums">{s}/5</span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-blue-500" style={{ width: `${(s / 5) * 100}%` }} />
      </div>
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
  const [missionDone, setMissionDone] = useState<[boolean, boolean, boolean]>([false, false, false]);
  const [feedback, setFeedback] = useState<number>(0);
  const [feedbackComment, setFeedbackComment] = useState<string>("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackSending, setFeedbackSending] = useState(false);
  const FEEDBACK_COMMENT_MAX = 200;

  const [formLoadedFromHistory, setFormLoadedFromHistory] = useState(false);
  const [hasHistory, setHasHistory] = useState(false);
  const [isFormExpanded, setIsFormExpanded] = useState(false);

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
      .then((data: { answers?: Record<string, unknown> }) => {
        const a = data?.answers;
        setHasHistory(typeof a === "object" && a !== null);
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
    setMissionDone([false, false, false]);

    if (!anonymousUserId) {
      setError("初期化中です。数秒後にもう一度お試しください。");
      return;
    }
    if (actions.length < 1 || actions.length > 10) {
      setError("1つ以上入力してね");
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
        actions,
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
    <div className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            「何をすればいいか分からない」を解決
          </h1>
          <p className="text-base text-slate-700 sm:text-lg">
            AIが男磨きコーチとなって、彼女づくり・婚活・恋愛をサポート
          </p>
          <p className="text-xs text-slate-500 sm:text-sm">
            匿名・無料・1分で診断 ｜ 続けるほど成長が見える
          </p>
        </header>

        <div className="mt-8 space-y-6">
          {(hasHistory && isFormExpanded) || !hasHistory ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-slate-900">診断フォーム（7問）</h2>
                {hasHistory && (
                  <button
                    type="button"
                    onClick={() => setIsFormExpanded(false)}
                    className="shrink-0 text-sm font-medium text-slate-500 hover:text-slate-700 hover:underline"
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
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">選択してください</option>
                  <option value="ほぼなし">ほぼなし</option>
                  <option value="少し">少し</option>
                  <option value="交際経験あり">交際経験あり</option>
                </select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700">3. 出会い方（複数選択）</label>
                  <span className="text-xs text-slate-500">{meetMethods.length}件選択</span>
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
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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
                          "flex items-center gap-2 rounded-xl border px-3 py-3 text-sm",
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
                          className="h-4 w-4 accent-blue-500"
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
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">選択してください</option>
                  <option value="都市部">都市部</option>
                  <option value="地方">地方</option>
                </select>
              </div>
            </div>
          </section>
          ) : null}

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">男磨きの行動記録</h2>
            <p className="mt-1 text-sm text-slate-600">悩み解決や目標達成のために今日頑張ったことは？（改行で複数入力できるよ）</p>
            <textarea
              value={actionsText}
              onChange={(e) => setActionsText(e.target.value)}
              placeholder={"例：マッチングアプリでメッセージを送った、筋トレした、新しい服を買った"}
              rows={7}
              className="mt-3 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm leading-6 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            <p className="mt-2 text-xs text-slate-500">具体的に書くほど、的確なアドバイスができるよ！</p>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
              <span>入力数: {actions.length}個</span>
              <span className="tabular-nums">匿名ID: {anonymousUserId ? anonymousUserId.slice(0, 8) : "..."}</span>
            </div>

            {error && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={onSubmit}
              disabled={isLoading || actions.length < 1}
              className={[
                "mt-4 w-full rounded-2xl bg-blue-500 px-4 py-4 text-base font-semibold text-white shadow-sm transition",
                "hover:bg-blue-600 active:bg-blue-700",
                "disabled:cursor-not-allowed disabled:opacity-60",
              ].join(" ")}
            >
              {isLoading ? "診断中..." : "診断する"}
            </button>

            {hasHistory && !isFormExpanded && (
              <button
                type="button"
                onClick={() => setIsFormExpanded(true)}
                className="mt-3 w-full text-center text-xs text-slate-500 hover:text-slate-700 hover:underline sm:text-sm"
              >
                条件を変更する ▼
              </button>
            )}
          </section>

          {result && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="text-base font-semibold text-slate-900">結果</h2>
                  {(result.visit_count ?? 0) >= 2 && (
                    <p className="text-sm font-medium text-blue-600">{result.visit_count}回目の判定です！</p>
                  )}
                  <p className="text-sm text-slate-600">ペルソナタイプ: <span className="font-medium text-slate-900">{result.persona_type}</span></p>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">総合スコア</div>
                  <div className="mt-1 text-lg">
                    <Stars score={result.overall_score} />
                  </div>
                </div>
              </div>

              {result.growth_comment && (
                <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 p-4">
                  <div className="text-sm font-semibold text-green-900">前回からの成長</div>
                  <p className="mt-2 text-sm text-green-800">{result.growth_comment}</p>
                  {result.changes_from_last && (result.changes_from_last.improved.length > 0 || result.changes_from_last.needs_work.length > 0) && (
                    <div className="mt-3 space-y-2">
                      {result.changes_from_last.improved.length > 0 && (
                        <div>
                          <span className="text-xs font-medium text-green-700">改善した点</span>
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
                <AxisBar label="外見磨き（服装・髪型・清潔感）" score={result.category_scores.appearance} />
                <AxisBar label="出会い行動（機会を増やす努力）" score={result.category_scores.meetingActions} />
                <AxisBar label="コミュ力（話す・聞く・質問する）" score={result.category_scores.communication} />
                <AxisBar label="デート力（誘う・計画・実行）" score={result.category_scores.datePower} />
                <AxisBar label="モテマインド（自信・前向きさ）" score={result.category_scores.moteMindset} />
                <AxisBar label="生活習慣（睡眠・食事・趣味）" score={result.category_scores.lifestyle} />
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
                <div className="text-sm font-semibold text-slate-900">7日ミッション（3つ）</div>
                <div className="mt-2 space-y-2">
                  {result.missions.map((m, i) => (
                    <label key={i} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3">
                      <input
                        type="checkbox"
                        checked={missionDone[i]}
                        onChange={(e) => {
                          setMissionDone((prev) => {
                            const next: [boolean, boolean, boolean] = [prev[0], prev[1], prev[2]];
                            next[i as 0 | 1 | 2] = e.target.checked;
                            return next;
                          });
                        }}
                        className="mt-1 h-4 w-4 accent-blue-500"
                      />
                      <span className="text-sm text-slate-800">{m}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">テンプレ：{result.template.title}</div>
                    <p className="mt-1 text-xs text-slate-500">コピーボタンで貼り付け用テキストをコピーできます。</p>
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
                        "h-10 w-10 rounded-xl border text-lg transition",
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
                    💬 一言で、あなた専用のコーチに育つ＆同じ悩みの仲間も救えます（任意）
                  </label>
                  <textarea
                    value={feedbackComment}
                    onChange={(e) => setFeedbackComment(e.target.value.slice(0, FEEDBACK_COMMENT_MAX))}
                    placeholder="例：デートの誘い方をもっと詳しく教えてほしい"
                    rows={3}
                    disabled={feedbackSending || feedbackSent}
                    className="mt-1 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm leading-6 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
                  />
                  <p className="text-right text-xs text-slate-500">
                    {feedbackComment.length}/{FEEDBACK_COMMENT_MAX}文字
                  </p>
                </div>
                {!feedbackSent && (
                  <button
                    type="button"
                    onClick={submitFeedback}
                    disabled={feedbackSending || feedback < 1}
                    className={[
                      "mt-4 w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 transition",
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

          <footer className="pb-8 text-center text-xs text-slate-400">
            <p>※ 医療・法律などの専門助言ではありません。つらい時は信頼できる人や専門家にも相談してね。</p>
          </footer>
        </div>
      </div>
    </div>
  );
}
