import type { Metadata } from "next";
import localFont from "next/font/local";
import { FooterDisclaimer } from "./components/FooterDisclaimer";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  manifest: "/manifest.json",
  title: "男磨きAI - 恋愛経験ゼロから彼女ゲットまで応援",
  description:
    "AIが一緒に成長する恋のコーチ。匿名・無料・1分で診断。10カテゴリ100点満点であなたの男磨き度を判定し、具体的なアドバイスをお届けします。",
  metadataBase: new URL("https://otoko-migaki.vercel.app"),
  openGraph: {
    title: "男磨きAI - 恋愛経験ゼロから彼女ゲットまで応援",
    description: "AIが一緒に成長する恋のコーチ。匿名・無料・1分で診断。",
    url: "https://otoko-migaki.vercel.app",
    siteName: "男磨きAI",
    images: [
      {
        url: "/ogp.png",
        width: 1200,
        height: 630,
        alt: "男磨きAI",
      },
    ],
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "男磨きAI - 恋愛経験ゼロから彼女ゲットまで応援",
    description: "AIが一緒に成長する恋のコーチ。匿名・無料・1分で診断。",
    images: ["/ogp.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var s=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var t=s||(d?'dark':'light');if(t==='dark')document.documentElement.classList.add('dark');else document.documentElement.classList.remove('dark');})();`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100`}
      >
        <div className="flex min-h-screen flex-col">
          <main className="flex-1">{children}</main>
          <FooterDisclaimer />
        </div>
      </body>
    </html>
  );
}
