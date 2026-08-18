// ナレーションの声の一覧。画面(クライアント)からも読むため、
// node の API を使う tts.ts とは分けている。

export const TTS_VOICES = [
  { id: "alloy", label: "alloy（中性・落ち着き）" },
  { id: "ash", label: "ash（男性寄り・低め）" },
  { id: "ballad", label: "ballad（男性寄り・やわらかい）" },
  { id: "coral", label: "coral（女性寄り・明るい）" },
  { id: "nova", label: "nova（女性寄り・軽快）" },
  { id: "sage", label: "sage（中性・落ち着き）" },
  { id: "shimmer", label: "shimmer（女性寄り・やさしい）" },
] as const;
