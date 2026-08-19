import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 上位や下位に別のプロジェクト(package-lock.json)があると、Next.js が
  // ルートを取り違えて警告を出す。このフォルダを明示して迷わせない。
  outputFileTracingRoot: projectRoot,
};

export default nextConfig;
