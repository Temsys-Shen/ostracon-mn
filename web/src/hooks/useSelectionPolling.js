import { useEffect } from "react";
import MNBridge from "../lib/mnBridge";

function useSelectionPolling(connected, setSelectedCount) {
  useEffect(() => {
    if (!connected) { setSelectedCount(0); return; }
    const poll = async () => {
      try {
        const info = await MNBridge.send("getSelectedCardsInfo");
        setSelectedCount(info?.noteCount || 0);
      } catch (_) { console.warn("selection poll failed", _); }
    };
    poll();
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, [connected, setSelectedCount]);
}

export { useSelectionPolling };
