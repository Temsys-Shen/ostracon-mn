import { useCallback, useEffect, useRef } from "react";

// 通用防抖 hook。返回一个防抖后的回调函数。
// fn 用 ref 保存，每次 render 都更新，避免闭包过期；但返回的回调身份稳定（只在 delayMs/deps 变化时改变）。
// delayMs: 防抖延迟毫秒数
// deps: 依赖列表，变化时重新创建防抖回调
//
// 用法：
//   const debouncedSearch = useDebouncedCallback((text) => search(text), 250, [search]);
//   useEffect(() => { debouncedSearch(query); }, [query, debouncedSearch]);
function useDebouncedCallback(fn, delayMs, deps = []) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return useCallback((...args) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fnRef.current(...args), delayMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delayMs, ...deps]);
}

export { useDebouncedCallback };
