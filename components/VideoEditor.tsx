"use client";

// サービス説明動画から「ショート動画」と「本編(3〜5分)」を作る編集画面。
//
// 全自動で構成を出したあと、人が一覧でカットを外す・テロップを直す・並べ替える。
// 手直しの結果はそのまま編集台本(EDL)としてサーバーに戻り、ffmpeg が書き出す。

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_RENDER_SETTINGS,
  VARIANT_SIZE,
  VARIANT_TARGET,
  planDurationSec,
  type ContentAnalysis,
  type ProjectBrief,
  type RenderSettings,
  type SourceClip,
  type TitleCard,
  type VideoCut,
  type VideoCutPlan,
  type VideoVariant,
} from "@/lib/video/edl-types";
import { TTS_VOICES } from "@/lib/video/voices";
import { BGM_MOODS, type BgmMood, type BgmTrack } from "@/lib/video/bgm-types";

interface RenderedOutput {
  fileName: string;
  durationSec: number;
  cutCount: number;
  /** キャッシュ回避用。書き出すたびに変える */
  stamp: number;
}

const EMPTY_BRIEF: ProjectBrief = {
  companyName: "",
  serviceName: "",
  url: "",
  target: "",
  appeal: "",
  cta: "",
  tone: "",
};

/** 秒を "1:23.4" 形式にする */
function fmt(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest.toFixed(1).padStart(4, "0")}`;
}

/** 秒を "3分12秒" 形式にする(合計尺の表示用) */
function fmtLong(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec - m * 60);
  return m > 0 ? `${m}分${s}秒` : `${s}秒`;
}

export default function VideoEditor() {
  const [projectId, setProjectId] = useState<string>("");
  const [sources, setSources] = useState<SourceClip[]>([]);
  const [brief, setBrief] = useState<ProjectBrief>(EMPTY_BRIEF);

  const [analysis, setAnalysis] = useState<ContentAnalysis | null>(null);
  const [plans, setPlans] = useState<Record<VideoVariant, VideoCutPlan | null>>({
    short: null,
    main: null,
  });
  const [tab, setTab] = useState<VideoVariant>("short");

  const [settings, setSettings] = useState<Record<VideoVariant, RenderSettings>>({
    short: { ...DEFAULT_RENDER_SETTINGS },
    // 横型は素材の縦横比が変わらないことが多いので、そのまま収める設定を既定にする
    main: { ...DEFAULT_RENDER_SETTINGS, fit: "blur" },
  });

  const [uploadMsg, setUploadMsg] = useState("");
  const [uploadPct, setUploadPct] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeMsg, setAnalyzeMsg] = useState("");
  const [analyzePct, setAnalyzePct] = useState(0);
  const [rendering, setRendering] = useState<VideoVariant | null>(null);
  const [renderMsg, setRenderMsg] = useState("");
  const [renderPct, setRenderPct] = useState(0);
  const [outputs, setOutputs] = useState<Partial<Record<VideoVariant, RenderedOutput>>>({});
  const [error, setError] = useState("");
  const [bgmName, setBgmName] = useState("");
  const [logoName, setLogoName] = useState("");
  const [preview, setPreview] = useState<{ src: string; start: number; end: number } | null>(null);
  const [bgmTracks, setBgmTracks] = useState<BgmTrack[]>([]);
  const [moodFilter, setMoodFilter] = useState<BgmMood | "all">("all");

  const previewRef = useRef<HTMLVideoElement | null>(null);
  const plan = plans[tab];
  const current = settings[tab];

  // BGMライブラリは public/bgm/ を見るだけなので、案件に関係なく最初に読む
  useEffect(() => {
    let alive = true;
    void fetch("/api/video/bgm")
      .then((r) => (r.ok ? r.json() : { tracks: [] }))
      .then((d: { tracks?: BgmTrack[] }) => {
        if (alive) setBgmTracks(d.tracks ?? []);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const visibleTracks = useMemo(
    () => (moodFilter === "all" ? bgmTracks : bgmTracks.filter((t) => t.mood === moodFilter)),
    [bgmTracks, moodFilter]
  );

  const totalSourceSec = useMemo(
    () => sources.reduce((sum, s) => sum + s.durationSec, 0),
    [sources]
  );

  // ── アップロード ───────────────────────────────────────────
  const upload = useCallback(
    (file: File, kind: "source" | "bgm" | "logo") =>
      new Promise<{ projectId: string; source?: SourceClip; storedName?: string }>((resolve, reject) => {
        const params = new URLSearchParams({ kind, name: file.name });
        if (projectId) params.set("projectId", projectId);
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/video/source?${params.toString()}`);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          let data: { projectId?: string; source?: SourceClip; storedName?: string; error?: string };
          try {
            data = JSON.parse(xhr.responseText);
          } catch {
            reject(new Error(`アップロードに失敗しました (${xhr.status})`));
            return;
          }
          if (xhr.status >= 400 || !data.projectId) {
            reject(new Error(data.error ?? `アップロードに失敗しました (${xhr.status})`));
            return;
          }
          resolve({ projectId: data.projectId, source: data.source, storedName: data.storedName });
        };
        xhr.onerror = () => reject(new Error("アップロード中に通信が切れました"));
        xhr.send(file);
      }),
    [projectId]
  );

  const handleSourceFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setError("");
      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          setUploadMsg(`アップロード中: ${file.name} (${i + 1}/${files.length})`);
          setUploadPct(0);
          const res = await upload(file, "source");
          setProjectId(res.projectId);
          if (res.source) setSources((prev) => [...prev, res.source as SourceClip]);
        }
        setUploadMsg("");
      } catch (e) {
        setUploadMsg("");
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [upload]
  );

  const handleExtraFile = useCallback(
    async (file: File | null | undefined, kind: "bgm" | "logo") => {
      if (!file) return;
      if (!projectId) {
        setError("先に素材動画をアップロードしてください。");
        return;
      }
      setError("");
      try {
        setUploadMsg(`アップロード中: ${file.name}`);
        await upload(file, kind);
        setUploadMsg("");
        if (kind === "bgm") {
          setBgmName(file.name);
          setSettings((prev) => ({
            short: { ...prev.short, useBgm: true },
            main: { ...prev.main, useBgm: true },
          }));
        } else {
          setLogoName(file.name);
          setSettings((prev) => ({
            short: { ...prev.short, useLogo: true },
            main: { ...prev.main, useLogo: true },
          }));
        }
      } catch (e) {
        setUploadMsg("");
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [projectId, upload]
  );

  // ── NDJSON ストリームの読み取り ────────────────────────────
  const readStream = useCallback(
    async <T,>(
      res: Response,
      onProgress: (message: string, ratio?: number) => void
    ): Promise<T> => {
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `エラー (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done: T | null = null;

      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let ev: { type: string; message?: string; ratio?: number; error?: string; data?: T };
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }
          if (ev.type === "progress" && ev.message) onProgress(ev.message, ev.ratio);
          else if (ev.type === "error") throw new Error(ev.error ?? "処理に失敗しました");
          else if (ev.type === "done" && ev.data) done = ev.data;
        }
      }
      if (!done) {
        throw new Error("処理の途中で接続が切れました。もう一度お試しください。");
      }
      return done;
    },
    []
  );

  // ── 解析と構成設計 ─────────────────────────────────────────
  const analyze = useCallback(async () => {
    if (!projectId || sources.length === 0) {
      setError("先に素材動画をアップロードしてください。");
      return;
    }
    setError("");
    setAnalyzing(true);
    setAnalyzeMsg("素材を確認しています");
    setAnalyzePct(0);
    try {
      const res = await fetch("/api/video/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, brief }),
      });
      const data = await readStream<{
        analysis: ContentAnalysis;
        short: VideoCutPlan;
        main: VideoCutPlan;
      }>(res, (message, ratio) => {
        setAnalyzeMsg(message);
        if (typeof ratio === "number") setAnalyzePct(Math.round(ratio * 100));
      });
      setAnalysis(data.analysis);
      setPlans({ short: data.short, main: data.main });
      setOutputs({});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyzing(false);
    }
  }, [brief, projectId, readStream, sources.length]);

  // ── 書き出し ───────────────────────────────────────────────
  const render = useCallback(
    async (variant: VideoVariant) => {
      const target = plans[variant];
      if (!projectId || !target) return;
      setError("");
      setRendering(variant);
      setRenderMsg("準備しています");
      setRenderPct(0);
      try {
        const res = await fetch("/api/video/render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, variant, plan: target, settings: settings[variant] }),
        });
        const data = await readStream<{ fileName: string; durationSec: number; cutCount: number }>(
          res,
          (message, ratio) => {
            setRenderMsg(message);
            if (typeof ratio === "number") setRenderPct(Math.round(ratio * 100));
          }
        );
        setOutputs((prev) => ({ ...prev, [variant]: { ...data, stamp: Date.now() } }));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setRendering(null);
      }
    },
    [plans, projectId, readStream, settings]
  );

  // ── 台本の編集 ─────────────────────────────────────────────
  const updatePlan = useCallback(
    (variant: VideoVariant, updater: (p: VideoCutPlan) => VideoCutPlan) => {
      setPlans((prev) => {
        const target = prev[variant];
        if (!target) return prev;
        return { ...prev, [variant]: updater(target) };
      });
    },
    []
  );

  const updateCut = useCallback(
    (variant: VideoVariant, id: string, patch: Partial<VideoCut>) => {
      updatePlan(variant, (p) => ({
        ...p,
        cuts: p.cuts.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      }));
    },
    [updatePlan]
  );

  const moveCut = useCallback(
    (variant: VideoVariant, index: number, dir: -1 | 1) => {
      updatePlan(variant, (p) => {
        const next = [...p.cuts];
        const to = index + dir;
        if (to < 0 || to >= next.length) return p;
        [next[index], next[to]] = [next[to], next[index]];
        return { ...p, cuts: next };
      });
    },
    [updatePlan]
  );

  const removeCut = useCallback(
    (variant: VideoVariant, id: string) => {
      updatePlan(variant, (p) => ({ ...p, cuts: p.cuts.filter((c) => c.id !== id) }));
    },
    [updatePlan]
  );

  const playCut = useCallback(
    (cut: VideoCut) => {
      const source = sources[cut.sourceIndex];
      if (!source || !projectId) return;
      setPreview({
        src: `/api/video/file?projectId=${projectId}&name=${encodeURIComponent(source.storedName)}`,
        start: cut.startSec,
        end: cut.endSec,
      });
      // 素材が同じなら要素が再生成されないため、明示的にシークし直す
      requestAnimationFrame(() => {
        const el = previewRef.current;
        if (!el) return;
        el.currentTime = cut.startSec;
        void el.play().catch(() => undefined);
      });
    },
    [projectId, sources]
  );

  const setSetting = useCallback(
    (variant: VideoVariant, patch: Partial<RenderSettings>) => {
      setSettings((prev) => ({ ...prev, [variant]: { ...prev[variant], ...patch } }));
    },
    []
  );

  const busy = analyzing || rendering !== null || uploadMsg !== "";
  const duration = plan ? planDurationSec(plan) : 0;
  const target = VARIANT_TARGET[tab];
  const overTarget = plan ? duration > target.max : false;
  const underTarget = plan ? duration < target.min : false;

  return (
    <div className="container">
      <div className="header">
        <h1>動画編集スタジオ</h1>
        <span className="sub">説明動画 → ショート動画 + 本編(3〜5分)</span>
      </div>
      <p className="lede">
        サービスの説明動画をアップロードすると、AIが話している内容を聞き取り、
        SNS用のショート動画と、商談・サイト掲載用の3〜5分の動画を設計します。
        カットとテロップは一覧で手直しでき、そのままMP4で書き出せます。
        <Link href="/" className="ip-navlink">
          Insta Studio →
        </Link>
        <Link href="/indeed" className="ip-navlink">
          Indeed 提案スタジオ →
        </Link>
      </p>

      {error ? <div className="error-box">{error}</div> : null}

      {/* ===== STEP 1: 素材 ===== */}
      <section className="panel vs-step">
        <h2 className="vs-step-title">
          <span className="vs-step-no">1</span>素材をアップロード
        </h2>
        <p className="vs-note">
          サービス説明動画・画面録画・撮影クリップのいずれでも構いません。複数本まとめて入れると、
          カットごとに最適な素材をAIが選びます。対応形式: mp4 / mov / webm など。
        </p>

        <label className="vs-drop">
          <input
            type="file"
            accept="video/*"
            multiple
            disabled={busy}
            onChange={(e) => {
              void handleSourceFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <span className="vs-drop-label">クリックして動画を選ぶ（複数可）</span>
        </label>

        {uploadMsg ? (
          <div className="vs-progress">
            <div className="vs-progress-bar">
              <span style={{ width: `${uploadPct}%` }} />
            </div>
            <span className="vs-progress-text">
              {uploadMsg} {uploadPct}%
            </span>
          </div>
        ) : null}

        {sources.length > 0 ? (
          <div className="vs-sources">
            {sources.map((s) => (
              <div key={s.index} className="vs-source">
                <span className="vs-source-no">素材{s.index}</span>
                <span className="vs-source-name">{s.fileName}</span>
                <span className="vs-source-meta">
                  {fmt(s.durationSec)} / {s.width}×{s.height} / 音声{s.hasAudio ? "あり" : "なし"}
                </span>
              </div>
            ))}
            <div className="vs-source-total">
              合計 {fmtLong(totalSourceSec)}・{sources.length}本
            </div>
          </div>
        ) : null}

        <div className="vs-extra">
          <label className="vs-extra-item">
            <span>BGM（任意・mp3など）</span>
            <input
              type="file"
              accept="audio/*"
              disabled={busy || !projectId}
              onChange={(e) => {
                void handleExtraFile(e.target.files?.[0], "bgm");
                e.target.value = "";
              }}
            />
            {bgmName ? <em>{bgmName}</em> : null}
          </label>
          <label className="vs-extra-item">
            <span>ロゴ（任意・透過PNG）</span>
            <input
              type="file"
              accept="image/png"
              disabled={busy || !projectId}
              onChange={(e) => {
                void handleExtraFile(e.target.files?.[0], "logo");
                e.target.value = "";
              }}
            />
            {logoName ? <em>{logoName}</em> : null}
          </label>
        </div>
        <p className="vs-note vs-note-warn">
          BGMは権利処理済みの音源をご用意ください。このツールは音源を配布しません。
        </p>
      </section>

      {/* ===== STEP 2: ヒアリング ===== */}
      <section className="panel vs-step">
        <h2 className="vs-step-title">
          <span className="vs-step-no">2</span>案件の情報を入力
        </h2>
        <p className="vs-note">
          すべて任意ですが、埋めるほど構成の精度が上がります。特に「届けたい相手」と「取ってほしい行動」は、
          カットの選び方とテロップの書き方を大きく変えます。
        </p>
        <div className="vs-brief">
          <BriefField label="企業名" value={brief.companyName} onChange={(v) => setBrief({ ...brief, companyName: v })} />
          <BriefField label="サービス・商品名" value={brief.serviceName} onChange={(v) => setBrief({ ...brief, serviceName: v })} />
          <BriefField label="企業HPのURL" value={brief.url} onChange={(v) => setBrief({ ...brief, url: v })} placeholder="https://..." />
          <BriefField label="届けたい相手" value={brief.target} onChange={(v) => setBrief({ ...brief, target: v })} placeholder="例: 従業員30〜100名の建設会社の現場管理者" />
          <BriefField label="必ず伝えたいこと" value={brief.appeal} onChange={(v) => setBrief({ ...brief, appeal: v })} textarea />
          <BriefField label="取ってほしい行動（CTA）" value={brief.cta} onChange={(v) => setBrief({ ...brief, cta: v })} placeholder="例: 無料デモの申し込み" />
          <BriefField label="トーンの希望" value={brief.tone} onChange={(v) => setBrief({ ...brief, tone: v })} placeholder="例: 落ち着いた信頼感のある雰囲気" />
        </div>

        <button className="btn btn-primary" disabled={busy || sources.length === 0} onClick={() => void analyze()}>
          {analyzing ? "構成を作成中…" : plan ? "構成を作り直す" : "解析して構成を作る"}
        </button>
        {analyzing ? (
          <div className="vs-progress">
            <div className="vs-progress-bar">
              <span style={{ width: `${analyzePct}%` }} />
            </div>
            <span className="vs-progress-text">{analyzeMsg}</span>
          </div>
        ) : null}
        {sources.length > 0 && !analyzing ? (
          <p className="vs-note">
            文字起こしを含めて、素材の長さのおよそ 1/3〜1/2 の時間がかかります（30分の素材で10〜15分程度）。
          </p>
        ) : null}
      </section>

      {/* ===== STEP 3: 編集 ===== */}
      {plan && analysis ? (
        <section className="panel vs-step">
          <h2 className="vs-step-title">
            <span className="vs-step-no">3</span>構成を確認して手直し
          </h2>

          <div className="vs-analysis">
            <p>
              <strong>{analysis.brandName}</strong> / {analysis.serviceName}
            </p>
            <p className="vs-note">{analysis.summary}</p>
            <p className="vs-note">
              <strong>届ける相手:</strong> {analysis.targetAudience}
            </p>
            {analysis.proofPoints.length > 0 ? (
              <p className="vs-note">
                <strong>素材にあった事実・数字:</strong> {analysis.proofPoints.join(" / ")}
              </p>
            ) : (
              <p className="vs-note vs-note-warn">
                素材の中に具体的な数字・実績が見つかりませんでした。テロップにも数字は入りません。
              </p>
            )}
          </div>

          <div className="tabs vs-tabs">
            {(["short", "main"] as VideoVariant[]).map((v) => (
              <button key={v} className={`tab ${tab === v ? "active" : ""}`} onClick={() => setTab(v)}>
                {v === "short" ? "ショート動画" : "本編 (3〜5分)"}
              </button>
            ))}
          </div>

          <div className="vs-summary">
            <div>
              <span className="vs-summary-label">出力</span>
              {VARIANT_SIZE[tab].label}
            </div>
            <div>
              <span className="vs-summary-label">合計尺</span>
              <strong className={overTarget || underTarget ? "vs-warn" : "vs-ok"}>{fmtLong(duration)}</strong>
              <span className="vs-note-inline">（目安 {target.label}）</span>
            </div>
            <div>
              <span className="vs-summary-label">カット</span>
              {plan.cuts.filter((c) => c.enabled).length} / {plan.cuts.length} 本
            </div>
          </div>
          {overTarget ? (
            <p className="vs-note vs-note-warn">
              目安より長くなっています。優先度の低いカットのチェックを外すか、終了秒を早めてください。
            </p>
          ) : null}

          {preview ? (
            <video
              ref={previewRef}
              className="vs-preview-player"
              src={preview.src}
              controls
              onLoadedMetadata={(e) => {
                e.currentTarget.currentTime = preview.start;
              }}
              onTimeUpdate={(e) => {
                if (e.currentTarget.currentTime >= preview.end) e.currentTarget.pause();
              }}
            />
          ) : null}

          <CardEditor
            label="オープニング"
            card={plan.opening}
            onChange={(card) => updatePlan(tab, (p) => ({ ...p, opening: card }))}
          />

          <div className="vs-cuts">
            {plan.cuts.map((cut, i) => (
              <CutRow
                key={cut.id}
                index={i}
                cut={cut}
                source={sources[cut.sourceIndex]}
                isFirst={i === 0}
                isLast={i === plan.cuts.length - 1}
                onChange={(patch) => updateCut(tab, cut.id, patch)}
                onMove={(dir) => moveCut(tab, i, dir)}
                onRemove={() => removeCut(tab, cut.id)}
                onPlay={() => playCut(cut)}
              />
            ))}
          </div>

          <CardEditor
            label="エンディング（CTA）"
            card={plan.closing}
            onChange={(card) => updatePlan(tab, (p) => ({ ...p, closing: card }))}
          />

          <div className="field">
            <label>SNS投稿用キャプション</label>
            <textarea
              rows={5}
              value={plan.caption}
              onChange={(e) => updatePlan(tab, (p) => ({ ...p, caption: e.target.value }))}
            />
          </div>
          {plan.hashtags.length > 0 ? (
            <div className="hashtag-cloud">
              {plan.hashtags.map((h) => (
                <span key={h} className="hashtag">
                  {h}
                </span>
              ))}
            </div>
          ) : null}

          {/* ===== 書き出し ===== */}
          <h3 className="vs-section-title">書き出し設定</h3>
          <div className="vs-settings">
            <label className="vs-setting">
              <span>音声</span>
              <select
                value={current.audioMode}
                onChange={(e) => setSetting(tab, { audioMode: e.target.value as RenderSettings["audioMode"] })}
              >
                <option value="original">元の音声をそのまま使う</option>
                <option value="narration">AIナレーションに差し替える</option>
              </select>
            </label>
            {current.audioMode === "narration" ? (
              <label className="vs-setting">
                <span>読み上げる声</span>
                <select value={current.ttsVoice} onChange={(e) => setSetting(tab, { ttsVoice: e.target.value })}>
                  {TTS_VOICES.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="vs-setting">
              <span>縦横比が変わるとき</span>
              <select value={current.fit} onChange={(e) => setSetting(tab, { fit: e.target.value as RenderSettings["fit"] })}>
                <option value="crop">中央を切り抜く（人物・実写向き）</option>
                <option value="blur">全体を残す（画面録画・デモ向き）</option>
              </select>
            </label>
            <label className="vs-setting">
              <span>アクセントカラー</span>
              <input
                type="color"
                value={current.accentColor}
                onChange={(e) => setSetting(tab, { accentColor: e.target.value })}
              />
            </label>
            <label className="vs-setting vs-setting-check">
              <input
                type="checkbox"
                checked={current.showHeadlines}
                onChange={(e) => setSetting(tab, { showHeadlines: e.target.checked })}
              />
              <span>大テロップを入れる</span>
            </label>
            <label className="vs-setting vs-setting-check">
              <input
                type="checkbox"
                checked={current.showSubtitles}
                onChange={(e) => setSetting(tab, { showSubtitles: e.target.checked })}
              />
              <span>字幕を入れる</span>
            </label>
            <label className="vs-setting vs-setting-check">
              <input
                type="checkbox"
                checked={current.useBgm}
                disabled={!bgmName && bgmTracks.length === 0}
                onChange={(e) => setSetting(tab, { useBgm: e.target.checked })}
              />
              <span>BGMを重ねる{!bgmName && bgmTracks.length === 0 ? "（音源がありません）" : ""}</span>
            </label>
            <label className="vs-setting vs-setting-check">
              <input
                type="checkbox"
                checked={current.useLogo}
                disabled={!logoName}
                onChange={(e) => setSetting(tab, { useLogo: e.target.checked })}
              />
              <span>ロゴを表示{logoName ? "" : "（未アップロード）"}</span>
            </label>
            {current.useBgm ? (
              <>
                <label className="vs-setting">
                  <span>BGMの音量 {Math.round(current.bgmVolume * 100)}%</span>
                  <input
                    type="range"
                    min={2}
                    max={40}
                    value={Math.round(current.bgmVolume * 100)}
                    onChange={(e) => setSetting(tab, { bgmVolume: Number(e.target.value) / 100 })}
                  />
                </label>
                <label className="vs-setting vs-setting-check">
                  <input
                    type="checkbox"
                    checked={current.bgmDucking}
                    onChange={(e) => setSetting(tab, { bgmDucking: e.target.checked })}
                  />
                  <span>話し声に合わせてBGMを自動で下げる</span>
                </label>
              </>
            ) : null}
          </div>

          {current.useBgm ? (
            <BgmPicker
              tracks={visibleTracks}
              total={bgmTracks.length}
              selected={current.bgmTrack}
              uploadedName={bgmName}
              moodFilter={moodFilter}
              onMoodFilter={setMoodFilter}
              onSelect={(file) => setSetting(tab, { bgmTrack: file })}
            />
          ) : null}

          <button className="btn btn-primary" disabled={busy} onClick={() => void render(tab)}>
            {rendering === tab ? "書き出し中…" : `${tab === "short" ? "ショート動画" : "本編"}を書き出す`}
          </button>

          {rendering === tab ? (
            <div className="vs-progress">
              <div className="vs-progress-bar">
                <span style={{ width: `${renderPct}%` }} />
              </div>
              <span className="vs-progress-text">
                {renderMsg} {renderPct}%
              </span>
            </div>
          ) : null}

          {outputs[tab] ? (
            <div className="vs-output">
              <video
                className="vs-output-player"
                controls
                src={`/api/video/file?projectId=${projectId}&name=${outputs[tab]!.fileName}&v=${outputs[tab]!.stamp}`}
              />
              <div className="vs-output-meta">
                <span>
                  {fmtLong(outputs[tab]!.durationSec)} / {outputs[tab]!.cutCount}カット /{" "}
                  {VARIANT_SIZE[tab].label}
                </span>
                <a
                  className="btn btn-ghost btn-small"
                  href={`/api/video/file?projectId=${projectId}&name=${outputs[tab]!.fileName}&download=${encodeURIComponent(
                    `${plan.title || "video"}-${tab}.mp4`
                  )}`}
                >
                  MP4をダウンロード
                </a>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

/* ===== 小さな部品 ===== */

/** BGMライブラリの選択。トーンで絞り込み、その場で試聴できるようにする */
function BgmPicker(props: {
  tracks: BgmTrack[];
  /** 絞り込み前の総数。0 なら「音源がまだ無い」案内を出す */
  total: number;
  selected: string;
  uploadedName: string;
  moodFilter: BgmMood | "all";
  onMoodFilter: (m: BgmMood | "all") => void;
  onSelect: (file: string) => void;
}) {
  const { tracks, total, selected, uploadedName } = props;
  const activeMood = BGM_MOODS.find((m) => m.id === props.moodFilter);

  if (total === 0 && !uploadedName) {
    return (
      <div className="vs-bgm">
        <p className="vs-note vs-note-warn">
          BGMの音源がまだありません。<code>public/bgm/</code> に mp3 を置くと、ここに一覧が出ます。
          置き方と、Sunoで曲を作るときのプロンプトは <code>public/bgm/README.md</code> にまとめてあります。
        </p>
      </div>
    );
  }

  return (
    <div className="vs-bgm">
      <div className="vs-bgm-head">
        <span className="vs-bgm-title">BGMを選ぶ</span>
        <div className="vs-bgm-moods">
          <button
            className={`template-pill ${props.moodFilter === "all" ? "active" : ""}`}
            onClick={() => props.onMoodFilter("all")}
          >
            すべて
          </button>
          {BGM_MOODS.map((m) => (
            <button
              key={m.id}
              className={`template-pill ${props.moodFilter === m.id ? "active" : ""}`}
              onClick={() => props.onMoodFilter(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      {activeMood ? <p className="vs-note">{activeMood.hint}</p> : null}

      <div className="vs-bgm-list">
        {uploadedName ? (
          <label className={`vs-bgm-item ${selected === "" ? "on" : ""}`}>
            <input
              type="radio"
              name="bgm-track"
              checked={selected === ""}
              onChange={() => props.onSelect("")}
            />
            <span className="vs-bgm-name">この案件にアップロードした音源</span>
            <span className="vs-bgm-meta">{uploadedName}</span>
          </label>
        ) : null}

        {tracks.map((t) => (
          <label key={t.file} className={`vs-bgm-item ${selected === t.file ? "on" : ""}`}>
            <input
              type="radio"
              name="bgm-track"
              checked={selected === t.file}
              onChange={() => props.onSelect(t.file)}
            />
            <span className="vs-bgm-name">{t.title}</span>
            <span className="vs-bgm-meta">
              {fmt(t.durationSec)}
              {t.bpm ? ` / ${t.bpm}BPM` : ""}
              {t.industries.length > 0 ? ` / ${t.industries.join("・")}` : ""}
            </span>
            {/* 試聴は public/ の静的配信をそのまま鳴らす */}
            <audio className="vs-bgm-audio" controls preload="none" src={`/bgm/${t.file}`} />
          </label>
        ))}

        {tracks.length === 0 && total > 0 ? (
          <p className="vs-note">このトーンの曲はまだありません。</p>
        ) : null}
      </div>
    </div>
  );
}


function BriefField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
}) {
  return (
    <div className="field">
      <label>{props.label}</label>
      {props.textarea ? (
        <textarea
          rows={3}
          value={props.value}
          placeholder={props.placeholder}
          onChange={(e) => props.onChange(e.target.value)}
        />
      ) : (
        <input
          type="text"
          value={props.value}
          placeholder={props.placeholder}
          onChange={(e) => props.onChange(e.target.value)}
        />
      )}
    </div>
  );
}

function CardEditor(props: { label: string; card: TitleCard; onChange: (c: TitleCard) => void }) {
  const { card, onChange } = props;
  return (
    <div className="vs-card-editor">
      <span className="vs-card-label">{props.label}</span>
      <textarea
        rows={2}
        value={card.title}
        placeholder="主文（改行で2行まで）"
        onChange={(e) => onChange({ ...card, title: e.target.value })}
      />
      <input
        type="text"
        value={card.subtitle}
        placeholder="補足の1行"
        onChange={(e) => onChange({ ...card, subtitle: e.target.value })}
      />
      <label className="vs-card-dur">
        表示
        <input
          type="number"
          step={0.1}
          min={1.2}
          max={5}
          value={card.durationSec}
          onChange={(e) => onChange({ ...card, durationSec: Number(e.target.value) })}
        />
        秒
      </label>
    </div>
  );
}

function CutRow(props: {
  index: number;
  cut: VideoCut;
  source?: SourceClip;
  isFirst: boolean;
  isLast: boolean;
  onChange: (patch: Partial<VideoCut>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onPlay: () => void;
}) {
  const { cut, source } = props;
  const length = Math.max(0, cut.endSec - cut.startSec);

  return (
    <div className={`vs-cut ${cut.enabled ? "" : "off"}`}>
      <div className="vs-cut-head">
        <label className="vs-cut-use">
          <input
            type="checkbox"
            checked={cut.enabled}
            onChange={(e) => props.onChange({ enabled: e.target.checked })}
          />
          <span>使う</span>
        </label>
        <span className="vs-cut-no">#{props.index + 1}</span>
        <span className="vs-cut-src">素材{cut.sourceIndex}</span>
        <label className="vs-cut-time">
          <input
            type="number"
            step={0.1}
            min={0}
            max={source?.durationSec ?? 9999}
            value={cut.startSec}
            onChange={(e) => props.onChange({ startSec: Number(e.target.value) })}
          />
          <span>→</span>
          <input
            type="number"
            step={0.1}
            min={0}
            max={source?.durationSec ?? 9999}
            value={cut.endSec}
            onChange={(e) => props.onChange({ endSec: Number(e.target.value) })}
          />
        </label>
        <span className="vs-cut-len">{length.toFixed(1)}秒</span>
        <div className="vs-cut-actions">
          <button className="btn btn-ghost btn-small" onClick={props.onPlay} title="この区間を再生">
            ▶
          </button>
          <button className="btn btn-ghost btn-small" disabled={props.isFirst} onClick={() => props.onMove(-1)}>
            ↑
          </button>
          <button className="btn btn-ghost btn-small" disabled={props.isLast} onClick={() => props.onMove(1)}>
            ↓
          </button>
          <button className="btn btn-ghost btn-small" onClick={props.onRemove} title="このカットを削除">
            ×
          </button>
        </div>
      </div>

      <div className="vs-cut-body">
        <label className="vs-cut-field">
          <span>大テロップ（改行で2行まで／空欄なら出しません）</span>
          <textarea
            rows={2}
            value={cut.headline}
            onChange={(e) => props.onChange({ headline: e.target.value })}
          />
        </label>
        <label className="vs-cut-field">
          <span>字幕</span>
          <input type="text" value={cut.subtitle} onChange={(e) => props.onChange({ subtitle: e.target.value })} />
        </label>
        <label className="vs-cut-field">
          <span>ナレーション原稿（AIナレーション使用時のみ）</span>
          <input type="text" value={cut.narration} onChange={(e) => props.onChange({ narration: e.target.value })} />
        </label>
      </div>

      {cut.quote || cut.reason ? (
        <div className="vs-cut-meta">
          {cut.reason ? <span className="vs-cut-reason">{cut.reason}</span> : null}
          {cut.quote ? <span className="vs-cut-quote">「{cut.quote}」</span> : null}
        </div>
      ) : null}
    </div>
  );
}
