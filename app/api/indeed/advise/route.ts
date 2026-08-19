import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { ADVICE_SCHEMA } from "@/lib/indeed/advice-schema";
import { BENCHMARK_LEVEL_LABEL } from "@/lib/indeed/benchmark";
import { employmentLabel, industryDef } from "@/lib/indeed/seed";
import type { AdviceRequest, AdviceResult } from "@/lib/indeed/types";
import { currentUser } from "@/lib/indeed/server/auth";

export const maxDuration = 300;

// 役割分担をはっきりさせている:
//   - 数値の集計・ベンチマーク比較・ボトルネック特定・優先順位づけ → すべてサーバー側の計算(lib/indeed)
//   - その診断結果を前提にした原稿の言葉づくり → ここ (AI)
// AI に数値の判断をさせないので、同じデータからは毎回同じ診断が出る。
// AI が診断を作り直したり、渡していない数字を書いたりしないよう、プロンプトで強く縛っている。
const SYSTEM_PROMPT = `あなたは求人媒体(Indeed)の運用代行で成果を出してきた、求人広告のコピーライター兼運用コンサルタントです。
すでに完了している「数値診断の結果」を受け取り、それに基づいて改善原稿と報告文を作ります。

━━━━━━━━━━━━━━━━━━━━━━━━
最重要の制約
━━━━━━━━━━━━━━━━━━━━━━━━
- 数値の判断はすでに終わっています。あなたの仕事は診断のやり直しではなく、診断を前提にした「打ち手の言語化」です
- 渡された数値以外の数字を絶対に書かない。表示数・クリック率・応募率・給与・相場は、入力にある値だけを使う
- 入力にない条件(手当、休日数、残業時間、福利厚生、社員数など)を創作しない。情報がない項目は書かずに省く
- 事実が足りずに書けない箇所は、報告文の中で「ヒアリングが必要な項目」として挙げる

━━━━━━━━━━━━━━━━━━━━━━━━
キャッチコピー(全角70文字以内)の作成ルール
━━━━━━━━━━━━━━━━━━━━━━━━
- 全角70文字以内。ただし必ず60文字以上使い切る(枠を余らせない)
- ローマ字・数字は半角、「～」は全角
- 「20〜50代活躍中」を必ずどこかに入れる
- 使ってよい記号は「／」(条件区切り)「！」(軽やかさ)「（）」(注目ポイント)のみ
- 職種名 + 主要な魅力(給与・条件・環境)を必ず含める
- 禁止: 性別を限定・示唆する表現、年齢を限定する表現(「○歳まで」「若手」など)、「○○歓迎」(→「○○活躍中」に変換する)
- 「主婦」は「しゅふ」または「主婦（夫）」と書く
- 「アットホーム」「風通しがいい」「働きやすい職場」などの常套句は使わない。同じ文字数を条件の記載に使う

━━━━━━━━━━━━━━━━━━━━━━━━
仕事内容(350文字前後)の作成ルール
━━━━━━━━━━━━━━━━━━━━━━━━
書式は厳守してください:

◆◆お仕事内容◆◆

[職種名を簡潔に1行で]

◆◆具体的な内容◆◆

・[作業手順1]

・[作業手順2]

・[作業手順3]

◆◆ポイント◆◆
・[ポイント1]
・[ポイント2]

- 1行は全角24文字以内で改行する。改行は文節の切れ目のみ。行頭に「の」「を」「が」などの助詞や句読点を置かない
- 箇条書きの2行目は全角スペース1つで字下げする
- 数字・アルファベットは半角、「～」は全角
- 「具体的な内容」には作業手順・やり方だけを書く(条件・福利厚生は書かない)
- 「ポイント」には勤務条件・福利厚生・環境を、求職者が気にする順に8個以内
- 全体350文字以内

━━━━━━━━━━━━━━━━━━━━━━━━
お客様向け報告文の書き方
━━━━━━━━━━━━━━━━━━━━━━━━
- 採用担当者が社内で説明できる文章にする。専門用語(CTR、CVR)は初出で日本語の説明を添える
- 「現状の数値 → 3段階のどこが詰まっているか → その原因の仮説 → 次にやること」の順
- 原因は必ず診断結果の根拠(evidence)に紐づけて書く。印象論で書かない
- 給与の引き上げなど費用のかかる提案は、応募単価や採用コストとの比較で説明する
- 断定を避けるべき箇所(データが足りない項目)は、そのまま「現時点では判断できない」と書く`;

function buildPrompt(req: AdviceRequest): string {
  const { job, diagnosis, recommendations } = req;
  const m = diagnosis.metrics;
  const ind = industryDef(job.industry);
  const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

  const lines: string[] = [];

  lines.push("## 求人の基本情報");
  lines.push(`- 求人名: ${job.name}`);
  lines.push(`- 企業: ${job.company}`);
  lines.push(`- 業種: ${ind.label}(推奨トーン: ${ind.tone})`);
  lines.push(`- 職種: ${job.jobCategory}`);
  lines.push(`- 雇用形態: ${employmentLabel(job.employmentType)}`);
  lines.push(`- 勤務地: ${job.prefecture}${job.city ? ` ${job.city}` : ""}`);
  if (job.wage?.min) {
    const unit = { hourly: "時給", daily: "日給", monthly: "月給", annual: "年収" }[job.wage.type];
    lines.push(
      `- 給与: ${unit} ${job.wage.min.toLocaleString()}円${job.wage.max ? `〜${job.wage.max.toLocaleString()}円` : "(上限の記載なし)"}`
    );
  }
  lines.push(`- 掲載形態: ${job.sponsored ? "スポンサー(有料)" : "無料掲載"}`);
  lines.push(
    `- この業種の求職者が特に気にすること: ${ind.hotButtons.join(" / ")}`
  );

  lines.push("");
  lines.push("## 実績(この数値以外の数字を書かないこと)");
  lines.push(`- 集計期間: ${m.days}日間`);
  lines.push(`- 表示数: ${m.impressions.toLocaleString()}回(1日あたり ${m.impressionsPerDay.toFixed(0)}回)`);
  lines.push(`- クリック数: ${m.clicks.toLocaleString()}回 / クリック率 ${pct(m.ctr)}`);
  lines.push(`- 応募数: ${m.applies.toLocaleString()}件 / 応募率 ${pct(m.applyRate)}`);
  if (m.cpa) lines.push(`- 応募単価: ${Math.round(m.cpa).toLocaleString()}円`);

  lines.push("");
  lines.push("## 数値診断の結果(この判定を覆さないこと)");
  lines.push(
    `比較基準: ${diagnosis.benchmark.label}(${BENCHMARK_LEVEL_LABEL[diagnosis.benchmark.level]}${diagnosis.benchmark.level === "seed" ? "" : ` / 実績${diagnosis.benchmark.jobCount}件から算出`})`
  );
  const verdictLabel = {
    good: "良好",
    average: "標準",
    weak: "要改善",
    insufficient: "データ不足で判定保留",
  };
  for (const s of diagnosis.stages) {
    lines.push(`- 【${s.label}】${verdictLabel[s.verdict]}: ${s.reason}`);
  }
  lines.push(`- 総合: ${diagnosis.summary}`);
  if (!diagnosis.dataSufficiency.ctrOk || !diagnosis.dataSufficiency.applyOk) {
    lines.push(`- データの制約: ${diagnosis.dataSufficiency.message}`);
  }

  lines.push("");
  lines.push("## 打つべき施策(優先度順・計算で決定済み)");
  if (recommendations.length === 0) {
    lines.push("(明確な課題は検出されていません。現状維持のうえ露出量を増やす判断のフェーズです)");
  } else {
    recommendations.slice(0, 6).forEach((r, i) => {
      lines.push(
        `${i + 1}. ${r.title}\n   根拠: ${r.evidence}\n   効果見込み: 月間応募 +${r.expectedGain.toFixed(1)}件${r.learning.sampleSize > 0 ? `(自社の過去${r.learning.sampleSize}件の実施実績から算出)` : "(実施実績なし・初期値)"}`
      );
    });
  }

  lines.push("");
  lines.push("## 現在の原稿");
  lines.push(`### 求人タイトル\n${job.copy?.title || "(未登録)"}`);
  lines.push(`### キャッチコピー\n${job.copy?.catch || "(未登録)"}`);
  lines.push(`### 仕事内容\n${job.copy?.description || "(未登録)"}`);

  lines.push("");
  lines.push(
    "上記をもとに、報告文・求人タイトル案3つ・キャッチコピー案3つ・仕事内容のリライト案・原稿以外の打ち手を作成してください。" +
      "原稿が未登録の項目は、上の基本情報の範囲だけで書き、足りない情報は創作せず報告文で「ヒアリングが必要」と伝えてください。"
  );

  return lines.join("\n");
}

export async function POST(request: NextRequest) {
  // middleware でもログインを見ているが、ここでも確かめる。
  // 除外設定を 1 行いじっただけで課金に直結するAPIが開くのを避けるため。
  if (!(await currentUser())) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  let body: AdviceRequest;
  try {
    body = (await request.json()) as AdviceRequest;
  } catch {
    return NextResponse.json({ error: "リクエストの形式が不正です。" }, { status: 400 });
  }

  if (!body?.job?.id || !body?.diagnosis) {
    return NextResponse.json(
      { error: "求人情報と診断結果が必要です。" },
      { status: 400 }
    );
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY が設定されていません。.env.local に設定してください。" },
      { status: 500 }
    );
  }

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildPrompt(body) }],
      output_config: {
        format: {
          type: "json_schema",
          schema: ADVICE_SCHEMA as unknown as Record<string, unknown>,
        },
      },
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "この内容では提案を生成できませんでした。入力内容を見直してください。" },
        { status: 422 }
      );
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "提案の生成結果が空でした。再試行してください。" },
        { status: 502 }
      );
    }

    const advice: AdviceResult = JSON.parse(textBlock.text);
    return NextResponse.json({ advice });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { error: "APIキーが無効です。ANTHROPIC_API_KEY を確認してください。" },
        { status: 500 }
      );
    }
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "APIのレート制限に達しました。しばらく待って再試行してください。" },
        { status: 429 }
      );
    }
    if (e instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `AI提案の生成でエラーが発生しました (${e.status})` },
        { status: 502 }
      );
    }
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `予期しないエラー: ${message}` }, { status: 500 });
  }
}
