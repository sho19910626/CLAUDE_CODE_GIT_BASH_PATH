# BGMライブラリ

動画編集スタジオ (`/video`) で使うBGMの置き場所です。**このフォルダに音源ファイルを置くだけ**で、書き出し設定のBGM一覧に出てきます。

```
public/bgm/
  catalog.json      ← 曲名・トーン・想定業種(任意。無くても動きます)
  trust-01.mp3      ← 音源をここに置く
  bright-01.mp3
  ...
```

対応形式: `mp3` / `m4a` / `aac` / `wav` / `ogg` / `flac`
ファイル名は**半角英数字・ハイフン・アンダースコアのみ**にしてください（日本語ファイル名は一覧に出ません）。

---

## catalog.json の書き方

書かなくても動きますが、書くと**トーンで絞り込めて、想定業種が画面に出る**ので選ぶのが速くなります。

```json
{
  "tracks": [
    {
      "file": "trust-01.mp3",
      "title": "静かな信頼",
      "mood": "trust",
      "industries": ["士業", "医療", "BtoB SaaS"],
      "bpm": 88,
      "note": "Suno v5.5 / 2026-08-18 / Pro plan"
    }
  ]
}
```

| 項目 | 必須 | 内容 |
|---|---|---|
| `file` | ○ | ファイル名。これが一致した曲に情報が紐づきます |
| `title` | | 画面に出る曲名。省略するとファイル名がそのまま出ます |
| `mood` | | `trust` / `bright` / `tech` / `warm` / `drive` のいずれか。省略時は `trust` |
| `industries` | | 想定業種のタグ。選ぶときの手がかりとして表示されます |
| `bpm` | | テンポ |
| `note` | | **出所のメモ。生成に使ったサービス・プラン・日付を必ず残してください**（後から「この曲はどこから来たのか」を説明できるようにするため） |

`file` に書いたファイルが実在しない場合、その行は無視されます。逆にフォルダにあって `catalog.json` に無いファイルは、ファイル名を曲名として「落ち着いた信頼感」に入ります。

---

## トーンの区分

| id | 表示名 | 合う案件 |
|---|---|---|
| `trust` | 落ち着いた信頼感 | 士業・医療・金融・BtoB SaaS。堅い商材で、軽く聞こえさせたくないとき |
| `bright` | 明るい・軽快 | 小売・飲食・教育・採用。親しみやすさを出したいとき |
| `tech` | 先進的・テック | IT・製造DX・スタートアップ。新しさや仕組みの賢さを見せたいとき |
| `warm` | あたたかい・人物中心 | 介護・保育・地域密着・採用。人の表情や現場の空気を主役にするとき |
| `drive` | 力強い・前進 | 建設・物流・営業・成長企業。勢いと前進感を出したいとき |

---

## 曲を作るときの共通ルール

このツールのBGMは**ナレーションとテロップの下に敷く伴奏**です。曲単体としての良さより、**喋りを邪魔しないこと**が優先されます。

1. **ボーカルなし（インスト）**。歌詞があると、ナレーションと言葉がぶつかって両方聞き取れなくなります
2. **主旋律を目立たせすぎない**。印象的なメロディは動画の内容から注意を奪います
3. **2〜3分**あると扱いやすい（短くても書き出し時に自動でループします）
4. **中音域（人の声の帯域）を空ける**。ピアノやパッドの厚い和音を中音域いっぱいに置くと声が埋もれます
5. **急な展開・大きな静止を入れない**。任意の位置で切られてループするため、盛り上がりの落差が大きいと繋ぎ目が目立ちます
6. **書き出しは mp3 で十分**（重ねる音量が10〜20%のため、音質差は出ません）

書き出し側で以下は自動的に処理されるので、曲側で作り込む必要はありません。

- 尺に合わせたループ、頭1.5秒フェードイン、終わり2.5秒フェードアウト
- 話し声に合わせた自動音量ダウン（サイドチェイン。声がある間だけ約10dB下がります）

---

## Suno用プロンプト（18曲分）

Sunoの **Custom モード**で、**Instrumental を必ずON**にして使ってください。
各曲の `Style of Music` 欄に下のプロンプトを貼り、`Title` は任意です。

生成は1プロンプトにつき2案出るので、**両方聴いて良い方を採用**してください。気に入らなければ同じプロンプトで回し直すと別の曲が出ます。

> **注意**: 商用利用（クライアントへの納品）には Suno の**有料プラン**が必要です。無料プランの出力は非商用限定です。

---

### trust — 落ち着いた信頼感（4曲）

**trust-01「静かな信頼」**
```
Calm corporate ambient instrumental, soft felt piano with gentle arpeggios, warm analog pad underneath, subtle deep sub bass, no drums, spacious reverb, 85 BPM, C major, restrained and unhurried, background music for a Japanese B2B service explainer video, leaves the midrange open for a narrator's voice, no vocals, no melody hooks, loops smoothly
```

**trust-02「確かな歩み」**
```
Understated corporate underscore, muted piano chords on the downbeat, soft brushed rim clicks, warm upright bass, light string pad swell, 92 BPM, F major, professional and reassuring without being sentimental, steady pulse with no dramatic build, background bed for a corporate narration, instrumental only
```

**trust-03「朝の事務所」**
```
Quiet minimal instrumental, clean electric piano (Rhodes) with soft tremolo, sparse acoustic guitar harmonics, very light shaker, no snare, 80 BPM, A minor moving to C major, calm morning atmosphere of a small Japanese office, unobtrusive and even in dynamics, no vocals, no lead melody
```

**trust-04「積み重ね」**
```
Neutral corporate background instrumental, sustained warm synth pad, slow marimba pattern, soft sine bass, occasional soft piano note, no percussion kit, 84 BPM, D major, patient and consistent, designed to sit underneath a spoken explanation, low midrange density, seamless loop, instrumental
```

---

### bright — 明るい・軽快（4曲）

**bright-01「はじまりの合図」**
```
Light and friendly corporate pop instrumental, plucked ukulele and muted electric guitar, claps on the offbeat, soft kick and shaker, warm bass, whistle-free, 108 BPM, G major, cheerful but not childish, background music for a Japanese service introduction video, keeps the midrange clear for narration, no vocals
```

**bright-02「軽やかな導線」**
```
Upbeat corporate indie instrumental, bright marimba and glockenspiel motif, tight acoustic drums with brushed snare, bouncing bass, hand claps, 116 BPM, D major, optimistic and tidy, steady groove without big transitions, background bed for product explainer narration, instrumental only, loops cleanly
```

**bright-03「店先のにぎわい」**
```
Warm and cheerful acoustic instrumental, fingerpicked nylon guitar, light tambourine, soft cajon, upright bass, subtle glockenspiel accents, 104 BPM, A major, friendly neighborhood shop atmosphere, gentle and welcoming, no vocals, no strong lead line, even dynamics for voiceover
```

**bright-04「はずむ一歩」**
```
Playful corporate instrumental, staccato pizzicato strings, light woodblock and shaker, simple bouncy synth bass, occasional bell, 112 BPM, C major, curious and energetic in a polite way, keeps a consistent level throughout, background music under Japanese narration, instrumental
```

---

### tech — 先進的・テック（4曲）

**tech-01「静かな演算」**
```
Minimal tech ambient instrumental, clean pulsing synth arpeggio, deep sub bass, soft filtered noise sweep, sparse rim click percussion, 100 BPM, E minor, modern and precise, restrained and cool without being cold, background for a SaaS product demo narration, no vocals, no dramatic drops, seamless loop
```

**tech-02「仕組みが動く」**
```
Modern corporate electronic instrumental, muted plucked synth sequence, tight electronic kick and closed hat, warm analog bass, airy pad, light glitch texture, 110 BPM, A minor, intelligent and forward-moving, steady sixteenth-note motion, designed to sit under a spoken product explanation, instrumental only
```

**tech-03「見えないインフラ」**
```
Ambient technology underscore, slowly evolving synth pad layers, low pulsing drone, occasional soft digital bell, no drum kit, 90 BPM, D minor, spacious and serious, suggests reliable infrastructure working quietly, very low midrange density so narration stays clear, no vocals, loops smoothly
```

**tech-04「更新される現場」**
```
Clean modern electronic instrumental, crisp plucked synth, subtle side-chained pad, simple four-on-the-floor kick at low volume, tight shaker, warm sub bass, 114 BPM, F# minor, contemporary Japanese corporate tech video mood, consistent energy without build-ups, instrumental, no lead melody
```

---

### warm — あたたかい・人物中心（3曲）

**warm-01「人の手のぬくもり」**
```
Warm acoustic instrumental, soft fingerpicked steel string guitar, gentle upright piano, light brushed snare, warm double bass, subtle string pad, 88 BPM, C major, tender and sincere without being sad, background music for a Japanese recruiting video about people at work, leaves space for a narrator, no vocals
```

**warm-02「毎日のそば」**
```
Gentle heartfelt instrumental, soft piano with a simple repeating figure, warm cello sustain underneath, light shaker, no drum kit, 76 BPM, F major, kind and quiet, everyday warmth of a care facility or local business, even dynamics throughout, instrumental only, seamless loop
```

**warm-03「はたらく横顔」**
```
Soft acoustic corporate instrumental, nylon guitar and felt piano trading simple phrases, warm bass, light rim and shaker, subtle string swell, 84 BPM, G major, respectful and human, focuses on atmosphere rather than melody, background bed under Japanese interview narration, no vocals
```

---

### drive — 力強い・前進（3曲）

**drive-01「現場が動く」**
```
Driving corporate rock instrumental, muted palm electric guitar riff, solid kick and snare, punchy bass, light tambourine, 120 BPM, E minor, strong and reliable rather than aggressive, steady forward motion with no big breakdown, background music for a Japanese construction or logistics company video, instrumental, no vocals
```

**drive-02「前へ」**
```
Energetic corporate instrumental, staccato strings with a rising figure, powerful but controlled drums, driving bass, subtle brass stabs, 124 BPM, D minor to D major, determined and ambitious, keeps a consistent intensity so it can be cut anywhere, background under narration, no vocals, loops cleanly
```

**drive-03「積み上げる力」**
```
Bold modern corporate instrumental, hybrid orchestral and electronic, low string ostinato, taiko-like low toms at moderate volume, tight snare, synth bass, 118 BPM, A minor, powerful and industrious, avoids cinematic risers and cymbal crashes, steady and loopable, instrumental only
```

---

## 曲を追加したあとの手順

1. mp3 を `public/bgm/` に置く
2. `catalog.json` の `tracks` に1行足す（曲名・mood・想定業種・出所メモ）
3. ブラウザで `/video` を開き直す（サーバーの再起動は不要です）

`note` に**生成日・使ったサービス・プラン**を残しておいてください。納品先から音源の出所を聞かれたときに、すぐ答えられるようにするためです。
