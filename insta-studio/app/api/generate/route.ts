import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { fetchSiteInfo } from "@/lib/scrape";
import { PLAN_SCHEMA } from "@/lib/plan-schema";
import type {
  ContentPlan,
  GenerateRequest,
  RecruitInfo,
  RecruitTheme,
} from "@/lib/types";

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
- リールは実写映像が主役で、テキストはテロップとして最小限に重なる。hook と cta のコピーは画面中央に大きく出るため特に短く強く、point のコピーは映像の説明ではなく映像だけでは伝わらない事実(数字・約束・条件)を書く
- ストーリーは動画としても書き出され、headline → subheadline → cta の3カットで1本になる。3つが単独でも読める完結した流れになるよう書く
- 文字数制限は厳守する(はみ出すとデザインが崩れるため)

コピーライティングの品質基準(最重要):
- 一流の広告コピーライターの水準で書く。ありきたりな宣伝文句は禁止
- 具体的な数字・固有名詞・事実を必ず入れる(例:「創業32年」「リピート率92%」「24時間以内に返信」)。入力情報に数字がなければ、業種特有の具体的なベネフィットで代替する
- 「魅力」「こだわり」「想い」「豊富な」「安心・安全」などの抽象語・常套句を使わない。読み手が絵を思い浮かべられる言葉を選ぶ
- 企業目線の自慢ではなく、読み手の悩み・欲求から書き始める(「〜でお困りではありませんか」ではなく、悩みの情景を切り取る)
- 表紙(cover)のヘッドラインは、スクロール中の指が止まるフック: 意外性のある数字、核心を突く疑問、断定的な言い切りのいずれかを使う
- content スライドは1枚につき1メッセージ。headline で結論、body でその根拠や具体例を書く
- 体言止めや短文でリズムを作る。ひらがな・カタカナ・漢字のバランスで読みやすくする

改行設計(テレビのテロップ品質で):
- 画像・動画に載せる複数行コピーは、必ず\\nで改行位置を明示する
- 改行は意味のまとまり(文節)の切れ目のみ。単語の途中や、助詞の直前で切らない
- 行頭に「の」「を」「が」などの助詞や句読点が来る改行は禁止
- 各行の文字数はできるだけ均等に揃える(例: 「朝採れ野菜を\\nその日のうちに」○ / 「朝採れ野菜をその\\n日のうちに」×)
- 1〜2文字だけの行を作らない
- 読点「、」が入る場合は読点の直後で改行し、意味のまとまりを1行にする(例: 「厳選した素材を、\\n毎朝丁寧に」)。読点を行頭に置いたり読点をまたいで不自然に改行しない`;

/** purpose="recruit" のときに追加する、企業公式採用アカウント向けの設計指針 */
const RECRUIT_PROMPT = `

━━━━━━━━━━━━━━━━━━━━━━━━
これは【企業の公式採用アカウント】の投稿です。大手企業の採用アカウントを運用する採用広報のプロとして設計してください。
━━━━━━━━━━━━━━━━━━━━━━━━

採用アカウントの目的:
- 応募数を増やすことだけでなく、入社後のミスマッチを防ぐことも同じくらい重要
- 求職者が「ここで働く自分」を具体的に想像できる状態をつくる
- 認知(まだ企業を知らない層)→ 興味 → 応募 の導線を1投稿の中で完結させる

最重要原則:
- 主役は「人」。会社の実績や設備の自慢ではなく、そこで働いている個人の顔・言葉・1日を描く。コピーの8割は人と職場の話にする
- 求職者が本当に知りたいのは次の6つ。これらに正面から答える:
  1) 実際の仕事内容(何をどこまで任されるのか)
  2) 1日・1週間の過ごし方
  3) 一緒に働く人と職場の雰囲気
  4) 給与・休日・残業・転勤の実態
  5) 入社後のキャリアと成長
  6) 選考の進み方と、いつ何をすればいいか
- 求職者の不安に先回りして答える(「未経験でも大丈夫?」「残業は?」「文系でも?」「転勤は?」)。都合の悪い情報を隠すとミスマッチになるため、事実は正直に、そのうえで解釈を添える
- 盛らない。「アットホームな職場」「風通しがいい」「若手が活躍」は求職者に最も警戒される常套句なので使用禁止。代わりに、その状態を証明する具体的な事実と数字を書く(×「風通しがいい」→ ○「入社2年目が新規事業の企画を通しました」)
- 数字は必ず入れる。入力にある数字は優先的に使い、なければ業種の実態に沿った表現に留めて捏造しない

法令・コンプライアンス(必ず守る):
- 年齢・性別・国籍を限定する表現は書かない(「若手歓迎」「20代活躍中」「女性が活躍」も年齢・性別の限定を示唆するため不可)。「入社1〜3年目が中心」のように事実の記述に置き換える
- 「必ず」「絶対に」「誰でも稼げる」など断定的な誇大表現を使わない
- 給与・待遇は入力にある情報の範囲でのみ書き、推測で数字を作らない

投稿の型ごとのカルーセル構成(指定されたテーマの構成に必ず従う):
- 社員インタビュー: 表紙=その人の印象的な一言を「」付きで引用+職種と入社年 / 中面=入社理由→今の仕事→壁とその越え方→これからの目標 / CTA
- 社員の1日: 表紙=「〇〇職の1日、全部見せます」 / 中面=1枚1時刻(例 8:50 出社 / 10:00 チーム朝会 / 13:00 客先訪問 / 18:30 退勤)で、時刻を eyebrow、その時間の行動を headline、リアルな一言を body に書く。6〜8枚構成にする / CTA
- 数字で見る: 表紙=「数字で見る〇〇」 / 中面=1枚1数字。headline に数字を大きく置き(例「平均年齢\\n32.4歳」)、body でその数字の意味を解釈する / CTA
- 福利厚生・制度: 制度名だけで終わらせず、必ず「実際に使った社員の声」とセットで書く / CTA
- オフィス・職場紹介: 設備の説明ではなく、そこで人がどう過ごしているかを描く / CTA
- 選考フロー: 1枚1ステップ。各ステップの所要期間・見られるポイント・準備すべきことを書く。6〜8枚構成 / CTA
- 就活生Q&A: 1枚1問1答。実際に多い不安(未経験、残業、転勤、選考基準)を扱う / CTA
- 職種紹介: 抽象的な職種名ではなく、具体的な業務・使うツール・関わる相手を書く / CTA
- 新入社員・内定者の声: 入社前の不安と、入社後の実際を対比させる / CTA
- 社風・カルチャー: 制度や理念ではなく、日常のエピソードで文化を示す / CTA
- 代表・先輩からのメッセージ: 会社の理想論ではなく、求職者への具体的な約束を書く / CTA
- 募集要項: 職種・雇用形態・勤務地・給与・休日・応募方法を、読み飛ばされない粒度で整理する / CTA

CTAスライドとキャプション:
- CTAは必ず具体的な次の行動を1つだけ示す(例「プロフィールのリンクからエントリー」「DMで質問だけでもOK」)。入力に応募導線があればそれを使う
- キャプションは、冒頭1行で求職者の関心を掴む → 本文で投稿内容を補足 → 募集職種・勤務地・雇用形態の要点 → 応募方法、の順で書く
- ハッシュタグは「採用系(#採用 #求人 #中途採用 #新卒採用 #企業公式)」「対象年次(#26卒 #27卒 など、入力から判断できる場合のみ)」「業種・職種」「勤務地の地名(#東京転職 など)」を混ぜる。地名タグは求職者の検索行動に直結するため必ず入れる

ビジュアル(bgPrompt / imagePrompt / videoPrompt):
- 採用アカウントでは、商品写真ではなく「働く人と職場」を描く。オフィス、打ち合わせ、現場作業、休憩、社内の廊下や窓際など、実在する日本企業の日常に見えるシーンにする
- 日本のオフィス・日本人の働く様子として描写する(欧米的なオープンオフィスの決まり切った構図にしない)
- 顔の大写しは避け、手元・後ろ姿・引きの構図、または人がいない職場の風景にする(実在しない人物の顔が主役になるのを避けるため)
- 明るく清潔で、演出過剰でない自然光のトーンに揃える`;

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

  const {
    url = "",
    brandDescription = "",
    message = "",
    images = [],
    purpose = "brand",
    recruit,
  } = body;
  if (!brandDescription.trim() && !url.trim()) {
    return NextResponse.json(
      { error: "企業HPのURLまたは企業イメージのいずれかを入力してください" },
      { status: 400 }
    );
  }

  const isRecruit = purpose === "recruit";

  const site = url.trim() ? await fetchSiteInfo(url.trim()) : null;

  const userPrompt = [
    isRecruit
      ? "以下の企業の【公式採用アカウント】向けInstagramコンテンツプランを作成してください。"
      : "以下の企業のInstagramコンテンツプランを作成してください。",
    "",
    isRecruit && recruit ? recruitBlock(recruit) : "",
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
    images.length > 0 &&
      (isRecruit
        ? "## 添付写真について\n添付されているのは、この企業の実際のオフィス・社員・現場の写真です。写真から職場の雰囲気・空間・トーンを読み取り、配色(colorPalette)・コピー・imagePrompt に反映してください。imagePrompt は添付写真と並べても違和感のない、同じ空気感の職場シーンを描写すること。"
        : "## 添付写真について\n添付されているのは、この企業の実際の商品・店舗・サービスの写真です。写真の被写体・色調・質感・世界観を分析し、配色(colorPalette)・コピー・imagePrompt に反映してください。imagePrompt は写真と並べても違和感のない、同じトーンの背景を描写すること。"),
    "",
    "発注者の入力した文言は、意図を保ったままフィード画像・ストーリー・リールの各コピーに反映してください。",
  ]
    .filter(Boolean)
    .join("\n");

  // アップロード写真 (dataURL) を vision 用の画像ブロックに変換
  const imageBlocks = images
    .slice(0, 3)
    .map((dataUrl) => {
      const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/.exec(dataUrl);
      if (!m) return null;
      return {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: m[1] as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
          data: m[2],
        },
      };
    })
    .filter((b): b is NonNullable<typeof b> => b !== null);

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: isRecruit ? SYSTEM_PROMPT + RECRUIT_PROMPT : SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [...imageBlocks, { type: "text" as const, text: userPrompt }],
        },
      ],
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
    plan.feed.slides = plan.feed.slides.slice(0, 8);

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

/** 投稿の型ごとの、AIに渡す企画指示 */
const RECRUIT_THEME_BRIEF: Record<RecruitTheme, string> = {
  "employee-interview":
    "社員インタビュー。1人の社員に焦点を当て、その人の言葉で語らせる。入社理由・今の仕事・壁の越え方・これからを追う",
  "day-in-life":
    "社員の1日に密着。出社から退勤(あるいは業務終了)まで時系列で追う。1枚1時刻、6〜8枚構成にする",
  numbers:
    "数字で見る会社紹介。1枚1数字で、平均年齢・有給取得率・離職率・平均残業時間・育休復帰率などを提示し、その意味を解釈する",
  benefits:
    "福利厚生・制度紹介。制度名だけでなく、実際に使った社員の体験談を必ずセットで書く",
  "office-tour":
    "オフィス・職場紹介。設備の羅列ではなく、その場所で人がどう働き、どう過ごしているかを描く",
  "selection-flow":
    "選考フロー紹介。1枚1ステップで、各段階の所要期間・見られるポイント・準備すべきことを書く。6〜8枚構成にする",
  qa: "求職者からのQ&A。1枚1問1答で、未経験・残業・転勤・選考基準など実際に多い不安に正面から答える",
  "job-description":
    "職種・仕事内容の紹介。具体的な業務、使うツール、関わる相手、1案件の流れまで踏み込む",
  "newgrad-voice":
    "新入社員・内定者の声。入社前に抱いていた不安と、入社後に分かった実際を対比させる",
  culture:
    "社風・カルチャー紹介。理念や制度の説明ではなく、日常のエピソードで文化を示す",
  message:
    "代表または先輩社員からのメッセージ。理想論ではなく、求職者への具体的な約束を書く",
  requirements:
    "募集要項の紹介。職種・雇用形態・勤務地・給与・休日・応募方法を、読み飛ばされない粒度で整理する",
};

/** 採用アカウント向けの入力情報を、AIに渡すテキストブロックにまとめる */
function recruitBlock(r: RecruitInfo): string {
  const lines = [
    "## この投稿の企画テーマ",
    RECRUIT_THEME_BRIEF[r.theme] ?? RECRUIT_THEME_BRIEF["employee-interview"],
    "",
    "## 採用情報(発注者の入力)",
  ];
  const fields: [string, string | undefined][] = [
    ["対象", r.targets],
    ["募集職種", r.positions],
    ["勤務地", r.workplace],
    ["会社の数字", r.numbers],
    ["福利厚生・制度", r.benefits],
    ["求める人物像", r.idealCandidate],
    ["選考フロー", r.selectionFlow],
    ["応募導線", r.applyRoute],
    ["社員の声・エピソード", r.episode],
  ];
  let any = false;
  for (const [label, value] of fields) {
    if (value?.trim()) {
      lines.push(`- ${label}: ${value.trim()}`);
      any = true;
    }
  }
  if (!any) {
    lines.push(
      "(具体的な採用情報の入力はありません。業種と企業情報から、その業界で一般的にありうる範囲の内容を書き、断定的な数字の捏造は避けてください)"
    );
  }
  return lines.join("\n");
}
