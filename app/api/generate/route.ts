import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { fetchSiteInfo } from "@/lib/scrape";
import { PLAN_SCHEMA } from "@/lib/plan-schema";
import type { ContentPlan, GenerateRequest } from "@/lib/types";

export const maxDuration = 300;

const SYSTEM_PROMPT = `あなたは大手企業のSNS運用を数多く手がけてきた、トップクラスのSNSディレクター兼アートディレクターです。
企業の情報をもとに、Instagram運用代行のプロが作るクオリティのコンテンツプランを設計します。

設計方針:
- ターゲット顧客に刺さる訴求軸を見極め、フィード・ストーリー・リールそれぞれの特性に合わせてコピーを書き分ける
- 画像に載せるコピーは短く強く。冗長な説明はキャプションに回す
- 配色はブランドイメージと業種に合わせ、洗練された組み合わせを選ぶ。背景色と文字色のコントラスト比は必ず4.5:1以上を確保する
- キャプションは「冒頭1行で興味を引く→価値・具体的な情報→行動喚起(CTA)」の構成。改行と絵文字を適度に使い読みやすくする
- ハッシュタグは検索ボリュームの大きいビッグワード・ミドルワード・ニッチなスモールワードをバランスよく混ぜる
- リールは冒頭1〜2秒で離脱を防ぐフックから始め、テンポよく価値を提示し、最後に明確なCTAで締める
- 文字数制限は厳守する(はみ出すとデザインが崩れるため)

コピーライティングの品質基準(最重要):
- 一流の広告コピーライターの水準で書く。ありきたりな宣伝文句は禁止
- 具体的な数字・固有名詞・事実を必ず入れる(例:「創業32年」「リピート率92%」「24時間以内に返信」)。入力情報に数字がなければ、業種特有の具体的なベネフィットで代替する
- 「魅力」「こだわり」「想い」「豊富な」「安心・安全」などの抽象語・常套句を使わない。読み手が絵を思い浮かべられる言葉を選ぶ
- 企業目線の自慢ではなく、読み手の悩み・欲求から書き始める(「〜でお困りではありませんか」ではなく、悩みの情景を切り取る)
- 表紙(cover)のヘッドラインは、スクロール中の指が止まるフック: 意外性のある数字、核心を突く疑問、断定的な言い切りのいずれかを使う
- content スライドは1枚につき1メッセージ。headline で結論、body でその根拠や具体例を書く
- 体言止めや短文でリズムを作る。ひらがな・カタカナ・漢字のバランスで読みやすくする`;

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "サーバーに ANTHROPIC_API_KEY が設定されていません。.env ファイルを確認してください。" },
      { status: 500 }
    );
  }

  let body: GenerateRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストの形式が不正です" }, { status: 400 });
  }

  const { url = "", brandDescription = "", message = "" } = body;
  if (!brandDescription.trim() && !url.trim()) {
    return NextResponse.json(
      { error: "企業HPのURLまたは企業イメージのいずれかを入力してください" },
      { status: 400 }
    );
  }

  const site = url.trim() ? await fetchSiteInfo(url.trim()) : null;

  const userPrompt = [
    "以下の企業のInstagramコンテンツプランを作成してください。",
    "",
    site?.ok
      ? [
          "## 企業HPの情報",
          `URL: ${site.url}`,
          `タイトル: ${site.title}`,
          site.description && `説明: ${site.description}`,
          "本文抜粋:",
          site.bodyText,
        ]
          .filter(Boolean)
          .join("\n")
      : site
        ? `## 企業HP\nURL: ${site.url}(取得できませんでした: ${site.error}。以下の情報のみで判断してください)`
        : "",
    "",
    brandDescription.trim() && `## 企業イメージ・ブランドについて(発注者の入力)\n${brandDescription.trim()}`,
    "",
    message.trim() && `## 画像・動画に必ず盛り込みたい文言・訴求内容(発注者の入力)\n${message.trim()}`,
    "",
    "発注者の入力した文言は、意図を保ったままフィード画像・ストーリー・リールの各コピーに反映してください。",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      output_config: {
        format: {
          type: "json_schema",
          schema: PLAN_SCHEMA as unknown as Record<string, unknown>,
        },
      },
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "この内容ではコンテンツを生成できませんでした。入力内容を見直してください。" },
        { status: 422 }
      );
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "生成結果が空でした。再試行してください。" }, { status: 502 });
    }

    const plan: ContentPlan = JSON.parse(textBlock.text);

    // カルーセル構成の保険(構造化出力で保証されない枚数の検証)
    if (!Array.isArray(plan.feed?.slides) || plan.feed.slides.length < 2) {
      return NextResponse.json(
        { error: "生成結果が不完全でした。もう一度お試しください。" },
        { status: 502 }
      );
    }
    plan.feed.slides = plan.feed.slides.slice(0, 5);

    return NextResponse.json({ plan, siteFetched: site?.ok ?? false });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "APIキーが無効です。ANTHROPIC_API_KEY を確認してください。" }, { status: 500 });
    }
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "APIのレート制限に達しました。しばらく待って再試行してください。" }, { status: 429 });
    }
    if (e instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `AI生成でエラーが発生しました (${e.status})` }, { status: 502 });
    }
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `予期しないエラー: ${message}` }, { status: 500 });
  }
}
