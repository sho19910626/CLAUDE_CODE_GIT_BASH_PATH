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
};

export default nextConfig;
