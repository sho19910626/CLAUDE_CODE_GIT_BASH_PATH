// 依存なしの ZIP 書き出し(無圧縮 / stored)。
//
// 納品物は PNG と MP4 が大半で、どちらも既に圧縮済みのため
// deflate をかけても数%しか縮まない。無圧縮なら実装が数十行で済み、
// 追加の依存も要らないので stored 方式にしている。
// ファイル名にUTF-8(日本語)を使うため、汎用フラグのbit 11を立てる。

export interface ZipEntry {
  /** ZIP内のパス。"feed/01_会社紹介/01.png" のように / で階層を作れる */
  name: string;
  data: Uint8Array;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** ZIPを組み立てて Blob で返す */
export function createZip(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    // ローカルファイルヘッダ
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // シグネチャ
    lv.setUint16(4, 20, true); // 展開に必要なバージョン
    lv.setUint16(6, 0x0800, true); // 汎用フラグ: bit11 = ファイル名がUTF-8
    lv.setUint16(8, 0, true); // 圧縮方式: 0 = stored
    lv.setUint16(10, 0, true); // 更新時刻
    lv.setUint16(12, 0, true); // 更新日付
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true); // 圧縮後サイズ
    lv.setUint32(22, size, true); // 圧縮前サイズ
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // 拡張フィールド長
    local.set(nameBytes, 30);

    parts.push(local, entry.data);

    // セントラルディレクトリのエントリ
    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // 作成バージョン
    cv.setUint16(6, 20, true); // 展開に必要なバージョン
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true); // ファイルコメント長
    cv.setUint16(34, 0, true); // ディスク番号
    cv.setUint16(36, 0, true); // 内部属性
    cv.setUint32(38, 0, true); // 外部属性
    cv.setUint32(42, offset, true); // ローカルヘッダの位置
    cd.set(nameBytes, 46);
    central.push(cd);

    offset += local.length + size;
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0);

  // セントラルディレクトリ終端レコード
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true); // コメント長

  return new Blob([...parts, ...central, end] as BlobPart[], {
    type: "application/zip",
  });
}

export type ImageFormat = "png" | "jpeg";

/**
 * Canvas を画像のバイト列にする。
 * png は文字の輪郭が最も綺麗だがファイルが大きい。写真背景を使うと
 * 納品ZIPが100MB級になりメール添付できないため、jpeg も選べるようにしている。
 */
export function canvasToBytes(
  canvas: HTMLCanvasElement,
  format: ImageFormat = "png"
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("画像の書き出しに失敗しました"));
          return;
        }
        blob
          .arrayBuffer()
          .then((b) => resolve(new Uint8Array(b)))
          .catch(reject);
      },
      format === "jpeg" ? "image/jpeg" : "image/png",
      format === "jpeg" ? 0.92 : undefined
    );
  });
}

/**
 * Blob をファイルとして保存させる。
 * アンカーをDOMに挿入し、revoke を遅らせないと、大きなBlobでは
 * ファイル名が失われて "download" という拡張子なしのファイルになる。
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 60_000);
}

/** 文字列を UTF-8 のバイト列にする(BOM付き: Excelやメモ帳で文字化けさせないため) */
export function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode("﻿" + text);
}

/** ZIP内のパスに使えない文字を落とす(日本語はそのまま使える) */
export function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "").trim() || "untitled";
}

/**
 * ダウンロード時のファイル名をASCIIに正規化する。
 * ブラウザによっては download 属性に非ASCIIが含まれると名前ごと破棄され、
 * 拡張子のない "download" というファイルになってしまう(Windowsでは開けない)。
 * 日本語の企業名は使えないため、ASCIIのユーザーネームと日付で識別する。
 */
export function asciiFilename(base: string, ext: string): string {
  const cleaned = base
    .normalize("NFKD")
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "");
  const stamp = new Date().toISOString().slice(0, 10);
  const name = cleaned || "instagram-recruit";
  return `${name}_${stamp}.${ext}`;
}
