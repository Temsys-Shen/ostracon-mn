import { useEffect, useRef } from "react";

// 通用轮询 hook。fn 用 ref 保存，每次 render 都更新，避免闭包过期；但 effect 只在 enabled/intervalMs/deps 变化时重建。
// enabled 为 false 时不启动定时器（用于条件轮询，如 rootSelectionStatus === "waiting" 时才轮询）。
function usePolling(fn, intervalMs, { enabled = true, deps = [] } = {}) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => fnRef.current(), intervalMs);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, ...deps]);
}

export { usePolling };
