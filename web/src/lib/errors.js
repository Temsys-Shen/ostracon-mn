// 统一错误信息归一化。之前在 useConnection / useSend / usePreferences / App.jsx / useQuote 各有一份重复实现。

export function normalizeError(e) {
  if (!e) return "未知错误";
  return typeof e === "string" ? e : e.message || JSON.stringify(e);
}
