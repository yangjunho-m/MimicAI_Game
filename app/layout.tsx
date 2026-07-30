import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MIMIC.AI — 사람이 AI를 흉내 내는 드로잉 게임",
  description: "같은 제시어를 그리고, 누가 AI인지 속이고 맞혀 보세요.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "MIMIC.AI — 사람인 걸 들키지 마.",
    description: "사람이 AI를 흉내 내는 2~4인 드로잉 블러핑 게임",
    type: "website",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "MIMIC.AI 게임 대표 이미지" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "MIMIC.AI — 사람인 걸 들키지 마.",
    description: "사람이 AI를 흉내 내는 2~4인 드로잉 블러핑 게임",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
