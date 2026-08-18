import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 一つ上のフォルダにも別のプロジェクト(package-lock.json)があるため、
  // このフォルダがルートだと明示して Next.js を迷わせない。
  outputFileTracingRoot: projectRoot,
};

export default nextConfig;
