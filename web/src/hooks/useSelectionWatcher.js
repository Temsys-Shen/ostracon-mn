import { useEffect } from "react";
import MNBridge from "../lib/mnBridge";
import useBridgeStore from "../store/useBridgeStore";
import { normalizeError } from "../lib/errors";
import { EVT_SELECTION_CHANGED } from "../lib/events";
import { MN_CMD } from "../lib/commands";

// 统一监听 MN 端 SelectionChanged 事件，并行刷新两个全局 API 写入 store：
// - getSelectedCardsInfo（发送页卡片数）
// - getObsidianInsertContext（浏览页追加目标）
//
// 替代原来的两个 3 秒轮询（useSelectionPolling + VaultBrowser 内的 getObsidianInsertContext 轮询）。
// mount 时主动 refresh 一次，覆盖 WebView 重载/插件重启时错过事件的情况。
// 引文选区会触发 MN 的图像识别，只允许引文页激活时由 useQuote 读取。
function useSelectionWatcher(active) {
  const setSelection = useBridgeStore((s) => s.setSelection);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const refresh = async () => {
      setSelection({ loading: true, error: "" });
      try {
        // 每个 promise 独立 catch，单个失败不影响其他；失败的返回 { __error } 标记。
        const [cardsInfo, insertContext] = await Promise.all([
          MNBridge.send(MN_CMD.GET_SELECTED_CARDS_INFO).catch((e) => ({ __error: e })),
          MNBridge.send(MN_CMD.GET_OBSIDIAN_INSERT_CONTEXT, null, 10000).catch((e) => ({ __error: e })),
        ]);
        if (cancelled) return;
        // 只覆盖成功的字段，失败的保留 store 上次成功值
        const patch = { loading: false };
        if (!cardsInfo || !cardsInfo.__error) patch.cardsInfo = cardsInfo || null;
        if (!insertContext || !insertContext.__error) patch.insertContext = insertContext || null;
        setSelection(patch);
      } catch (e) {
        if (!cancelled) setSelection({ loading: false, error: normalizeError(e) });
      }
    };

    refresh();
    window.addEventListener(EVT_SELECTION_CHANGED, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(EVT_SELECTION_CHANGED, refresh);
    };
  }, [active, setSelection]);
}

export { useSelectionWatcher };
