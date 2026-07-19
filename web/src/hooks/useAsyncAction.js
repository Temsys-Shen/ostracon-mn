import { useCallback, useState } from "react";
import { normalizeError } from "../lib/errors";

// 通用异步操作 hook。抽出 useVaultBrowser 内 5 处 setLoading/setError/try-catch-finally 样板。
//
// 用法：
//   const { loading, error, run } = useAsyncAction();
//   const loadFolder = useCallback(async (path) => {
//     await run(async () => setFolder(await command(OB_CMD.LIST_VAULT_FOLDER, { path })));
//   }, [run, command]);
//
// run 会自动管理 loading/error 状态，失败时把错误信息写入 error。
// 抛出的异常会被 catch 并写入 error，然后 re-throw（让调用方也能处理）。
function useAsyncAction() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = useCallback(async (fn) => {
    setLoading(true);
    setError("");
    try {
      return await fn();
    } catch (e) {
      const message = normalizeError(e);
      setError(message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, run, setError };
}

export { useAsyncAction };
