import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // このファイルがある場所をワークスペースの基準にする。
  // 上位や下位に別の package-lock.json があると Next.js がルートを取り違えて
  // 「We detected multiple lockfiles」の警告を出すため、明示しておく。
  outputFileTracingRoot: projectRoot,

  // 全ページ共通の防御ヘッダー。
  // 中身がクライアント企業名と営業リストなので、他サイトの枠内に
  // 埋め込まれて操作を誘導される(クリックジャッキング)のを防ぐ。
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // 他サイトの iframe に入れさせない
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          // 拡張子と中身が食い違うファイルを勝手に解釈させない
          { key: "X-Content-Type-Options", value: "nosniff" },
          // 外部サイトへ飛ぶとき、URLのパスやクエリを渡さない
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // 使っていない端末機能は最初から閉じておく
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
