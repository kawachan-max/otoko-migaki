"use client";

import { useState } from "react";

export function FooterDisclaimer() {
  const [open, setOpen] = useState(false);

  return (
    <footer className="w-full border-t border-slate-200 bg-white px-4 py-6 dark:border-gray-700 dark:bg-gray-900">
      <div className="mx-auto max-w-2xl">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex w-full cursor-pointer items-center justify-center gap-1.5 text-xs text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-400"
        >
          <span>免責事項・利用規約</span>
          <span className="shrink-0" aria-hidden>
            {open ? "▲" : "▼"}
          </span>
        </button>

        <div
          className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="overflow-hidden">
            <div className="mt-2 text-xs text-gray-400 dark:text-gray-500">
              <h4 className="mb-1.5 font-bold">【免責事項・利用規約】</h4>

              <p className="mb-1 font-semibold">■ サービスについて</p>
              <ul className="mb-3 list-inside list-disc space-y-0.5 pl-1">
                <li>本サービスはエンターテインメント目的で提供しており、医療・法律・金融等の専門的助言ではありません。</li>
                <li>AI診断結果は参考情報であり、正確性・完全性を保証するものではありません。</li>
                <li>サービス内容は予告なく変更・終了する場合があります。</li>
              </ul>

              <p className="mb-1 font-semibold">■ 利用について</p>
              <ul className="mb-3 list-inside list-disc space-y-0.5 pl-1">
                <li>ご利用は自己責任でお願いします。本サービスの利用により生じた損害について、運営者は一切の責任を負いません。</li>
                <li>診断結果の効果は個人の努力や状況により異なります。</li>
                <li>18歳未満の方は保護者の同意を得てご利用ください。</li>
              </ul>

              <p className="mb-1 font-semibold">■ データについて</p>
              <ul className="mb-3 list-inside list-disc space-y-0.5 pl-1">
                <li>ブラウザのキャッシュ・データをクリアすると履歴は消去されます。</li>
                <li>個人を特定する情報は収集しておりません。</li>
              </ul>

              <p className="mb-1 font-semibold">■ 広告について</p>
              <p className="mb-3 pl-1">
                本サービスに表示される広告は、第三者の広告配信サービスにより提供されており、運営者が推奨する商品・サービスとは限りません。
              </p>

              <p className="mb-1 font-semibold">■ 恋愛・人間関係について</p>
              <ul className="mb-3 list-inside list-disc space-y-0.5 pl-1">
                <li>本サービスのアドバイスに従った結果生じた人間関係のトラブルについて、運営者は責任を負いません。</li>
                <li>相手の同意なく接触・連絡を続ける行為（ストーカー行為等）は法律で禁止されています。</li>
              </ul>

              <p className="mb-1 font-semibold">■ 著作権・知的財産について</p>
              <ul className="mb-3 list-inside list-disc space-y-0.5 pl-1">
                <li>本サービスのコンテンツ（テキスト・デザイン・ロゴ等）の無断転載・複製を禁止します。</li>
                <li>診断結果のスクリーンショット共有は個人利用の範囲でお願いします。</li>
              </ul>

              <p className="mb-1 font-semibold">■ 禁止事項</p>
              <ul className="mb-3 list-inside list-disc space-y-0.5 pl-1">
                <li>虚偽情報の入力や不正アクセス等の行為を禁止します。</li>
                <li>本サービスを商用目的で利用することを禁止します。</li>
              </ul>

              <p className="mb-1 font-semibold">■ 外部リンクについて</p>
              <p className="mb-3 pl-1">
                本サービスから外部サイトへのリンクがある場合、そのサイトの内容・安全性について運営者は責任を負いません。
              </p>

              <p className="mb-1 font-semibold">■ 準拠法・管轄</p>
              <ul className="mb-3 list-inside list-disc space-y-0.5 pl-1">
                <li>本規約は日本法に準拠します。</li>
                <li>紛争が生じた場合は、東京地方裁判所を第一審の専属的合意管轄裁判所とします。</li>
              </ul>

              <p className="mb-1 font-semibold">■ その他</p>
              <p className="pl-1">
                精神的につらい時は、信頼できる人や専門家（医師・カウンセラー等）にご相談ください。
              </p>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          <a
            href="https://x.com/aihappystudy?s=21&t=9T3S0nw2rcAWkxlAzWHrZA"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            powered by punk
          </a>
        </p>
      </div>
    </footer>
  );
}
