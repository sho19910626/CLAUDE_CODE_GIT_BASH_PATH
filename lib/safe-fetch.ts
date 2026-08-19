// 外部URLを取りに行くときの安全確認。
//
// 「企業HPのURL」欄は利用者が自由に書けるので、そのまま fetch すると
// サーバーから見える場所なら何でも取ってこられてしまう(SSRF)。
// 事務所のPCで立ち上げて社内で共有する使い方があるため、
// http://192.168.x.x/... や http://localhost:8080/... を入れられると
// 社内の別の機器の画面がそのまま返ってしまう。
//
// 対策は 3 つ:
//   1. http / https 以外は断る(file: や gopher: を塞ぐ)
//   2. 名前解決した結果が内部向けのアドレスなら断る
//   3. リダイレクトを自動で追わず、1 段ごとに 1 と 2 をやり直す
//      (外部サイトが 302 で社内アドレスに送ってくる手口を防ぐ)

import { lookup } from "node:dns/promises";

const MAX_REDIRECTS = 3;

/** 内部向け(外に出さない)アドレスかどうか */
function isInternalAddress(ip: string): boolean {
  // IPv6
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return true; // 未指定・ループバック
    if (v.startsWith("fe80")) return true; // リンクローカル
    if (v.startsWith("fc") || v.startsWith("fd")) return true; // ユニークローカル
    // ::ffff:192.168.0.1 のような IPv4 射影
    const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isInternalAddress(mapped[1]);
    return false;
  }

  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true; // 読めないものは通さない
  }
  const [a, b] = p;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8 私用
  if (a === 127) return true; // ループバック
  if (a === 169 && b === 254) return true; // リンクローカル / クラウドのメタデータ
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 私用
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 私用
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 0) return true; // 192.0.0.0/24, 192.0.2.0/24
  if (a >= 224) return true; // マルチキャスト・予約
  return false;
}

const BLOCKED_HOSTNAMES = /(^|\.)(localhost|local|internal|localdomain)$/i;

export class UnsafeUrlError extends Error {}

/** 取得してよいURLか確かめる。だめなら UnsafeUrlError を投げる */
async function assertSafe(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("http または https のURLだけ取得できます");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.test(host)) {
    throw new UnsafeUrlError("社内・手元のアドレスは取得できません");
  }

  // 名前解決した先がすべて外部向けであること。
  // ドメイン名が内部アドレスを指す場合(DNSリバインディング的な指定)もここで落ちる。
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new UnsafeUrlError("アドレスを解決できませんでした");
  }
  if (addresses.length === 0 || addresses.some((a) => isInternalAddress(a.address))) {
    throw new UnsafeUrlError("社内・手元のアドレスは取得できません");
  }
}

/**
 * 安全確認をしながら取得する。
 * リダイレクトは自動で追わず、1 段ごとに確認し直す。
 */
export async function safeFetch(
  input: URL,
  init: RequestInit & { signal?: AbortSignal }
): Promise<Response> {
  let url = input;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertSafe(url);
    const res = await fetch(url.toString(), { ...init, redirect: "manual" });

    const isRedirect = res.status >= 300 && res.status < 400;
    if (!isRedirect) return res;

    const location = res.headers.get("location");
    if (!location) return res;
    url = new URL(location, url); // 相対でも絶対でも解決できる
  }

  throw new UnsafeUrlError("転送が多すぎます");
}
