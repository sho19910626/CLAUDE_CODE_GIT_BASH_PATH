// API ルートの共通部分。
//
// middleware でログインは確かめているが、各 API でも毎回確かめる。
// middleware の除外設定を 1 行いじっただけで API が開いてしまうため、
// 二重にしておく(CLAUDE.md の決まり)。

import { NextResponse } from "next/server";
import { currentAdminSession, currentSession, type Session } from "./auth";
import { StorageNotConfiguredError } from "./db";

export type { Session };

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** 例外の中身をそのまま外に出さない。接続先の URL が混ざることがあるため */
export function failFrom(e: unknown) {
  if (e instanceof StorageNotConfiguredError) {
    return fail(e.message, 503);
  }
  const message = e instanceof Error ? e.message : String(e);
  return fail(
    message.replace(/[a-z+]+:\/\/[^\s"']+/gi, "(接続先は伏せています)").slice(0, 300),
    500
  );
}

/** ログイン必須の入口。会社(テナント)も一緒に返す */
export async function withSession<T>(
  handler: (session: Session) => Promise<T>
): Promise<Response> {
  let session: Session | null;
  try {
    session = await currentSession();
  } catch (e) {
    return failFrom(e);
  }
  if (!session) return fail("ログインが必要です。", 401);
  try {
    const result = await handler(session);
    return NextResponse.json(result ?? { ok: true });
  } catch (e) {
    return failFrom(e);
  }
}

/** 管理者だけの入口 */
export async function withAdmin<T>(
  handler: (session: Session) => Promise<T>
): Promise<Response> {
  let session: Session | null;
  try {
    session = await currentAdminSession();
  } catch (e) {
    return failFrom(e);
  }
  if (!session) return fail("管理者だけが使えます。", 403);
  try {
    const result = await handler(session);
    return NextResponse.json(result ?? { ok: true });
  } catch (e) {
    return failFrom(e);
  }
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/** 画面から来た文字列を、そのまま数値として使えるようにする */
export function toNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  if (typeof v === "string") {
    const n = Number(v.replace(/[,\s円]/g, ""));
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

export function toText(v: unknown, max = 2000): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
