// テロップに使う日本語フォントの解決。
//
// drawtext は fontconfig ではなくフォントファイルを直接指定する方が確実なため、
// OS ごとの標準的な日本語ゴシックを探しに行く。見つからない環境では
// .env の TELOP_FONT_PATH で明示できる。

import { existsSync } from "node:fs";
import path from "node:path";

export interface TelopFonts {
  /** 見出し・大テロップ用(太字) */
  bold: string;
  /** 字幕・補足用 */
  regular: string;
}

/** 太字候補 → 通常候補 の順に探す。先に見つかったものを使う */
const BOLD_CANDIDATES = [
  // Windows
  "C:/Windows/Fonts/YuGothB.ttc",
  "C:/Windows/Fonts/meiryob.ttc",
  "C:/Windows/Fonts/NotoSansJP-Bold.otf",
  // macOS
  "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc",
  "/System/Library/Fonts/ヒラギノ角ゴシック W7.ttc",
  "/Library/Fonts/ヒラギノ角ゴシック W6.ttc",
  // Linux
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
  "/usr/share/fonts/opentype/noto/NotoSansCJKjp-Bold.otf",
  "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
];

const REGULAR_CANDIDATES = [
  // Windows
  "C:/Windows/Fonts/YuGothM.ttc",
  "C:/Windows/Fonts/YuGothR.ttc",
  "C:/Windows/Fonts/meiryo.ttc",
  "C:/Windows/Fonts/msgothic.ttc",
  // macOS
  "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc",
  "/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc",
  "/Library/Fonts/Arial Unicode.ttf",
  // Linux
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/opentype/noto/NotoSansCJKjp-Regular.otf",
  "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf",
  "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf",
];

/** public/fonts に置かれた持ち込みフォント(ブランドフォントの差し替え用) */
function bundled(name: string): string {
  return path.join(process.cwd(), "public", "fonts", name);
}

function firstExisting(paths: (string | undefined)[]): string | null {
  for (const p of paths) {
    if (p && existsSync(p)) return p;
  }
  return null;
}

let cache: TelopFonts | null = null;

/**
 * 使用するフォントを決める。見つからない場合は理由の分かる例外を投げる。
 * 環境変数 > public/fonts の持ち込み > OS標準 の順。
 */
export function resolveTelopFonts(): TelopFonts {
  if (cache) return cache;

  const bold = firstExisting([
    process.env.TELOP_FONT_BOLD_PATH,
    process.env.TELOP_FONT_PATH,
    bundled("telop-bold.otf"),
    bundled("telop-bold.ttf"),
    ...BOLD_CANDIDATES,
    ...REGULAR_CANDIDATES,
  ]);

  const regular = firstExisting([
    process.env.TELOP_FONT_PATH,
    bundled("telop.otf"),
    bundled("telop.ttf"),
    ...REGULAR_CANDIDATES,
    ...BOLD_CANDIDATES,
  ]);

  if (!bold || !regular) {
    throw new Error(
      "テロップに使う日本語フォントが見つかりませんでした。" +
        "public/fonts/telop.ttf に日本語フォントを置くか、.env の TELOP_FONT_PATH に " +
        "フォントファイルのパスを設定してください。"
    );
  }

  cache = { bold, regular };
  return cache;
}
