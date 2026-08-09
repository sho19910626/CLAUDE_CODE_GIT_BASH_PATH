import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // このファイルがある場所をワークスペースの基準にする。
  // 親フォルダにも package-lock.json があると Next.js が基準を推測できず
  // 「We detected multiple lockfiles」の警告が出るため、明示しておく。
  outputFileTracingRoot: projectRoot,
};

export default nextConfig;
