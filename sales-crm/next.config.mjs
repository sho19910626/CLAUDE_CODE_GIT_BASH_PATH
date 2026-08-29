import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // 開発中に出る Next.js の丸いバッジは、既定だと左下に置かれ、
  // サイドバー下の「◯◯ さん / ログアウト」に重なって読めなくなる。右下へ寄せる。
  devIndicators: { position: "bottom-right" },
  // 上位に別のプロジェクト(package-lock.json)があると Next.js がルートを
  // 取り違えて警告を出す。このフォルダを明示して迷わせない。
  outputFileTracingRoot: projectRoot,

  // 全ページ共通の防御ヘッダー。
  // 他サイトの枠内に埋め込まれて操作を誘導される(クリックジャッキング)のを防ぐ。
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
