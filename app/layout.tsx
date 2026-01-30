import type { Metadata } from "next";
import localFont from "next/font/local";
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
    <html lang="ja">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
