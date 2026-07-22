import { afterEach, describe, expect, test, vi } from "vitest";
import { __test__, scanLan } from "./lanScan";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("lanScan", () => {
  test("builds 192.168 fallback subnets in preferred order", () => {
    const subnets = __test__.buildFallbackSubnets();

    expect(subnets.slice(0, 6)).toEqual([
      "192.168.1",
      "192.168.100",
      "192.168.0",
      "192.168.2",
      "192.168.3",
      "192.168.4",
    ]);
    expect(subnets.slice(6, 101)).toEqual(Array.from({ length: 95 }, (_, index) => "192.168." + (index + 5)));
    expect(subnets.slice(101)).toEqual(["10.0.0", "172.16.0"]);
  });

  test("keeps dynamic subnets first without duplicating fallback subnets", () => {
    const subnets = __test__.getCandidateSubnets("10.0.0.8");

    expect(subnets.slice(0, 4)).toEqual(["10.0.0", "192.168.1", "192.168.100", "192.168.0"]);
    expect(subnets.filter((subnet) => subnet === "10.0.0")).toHaveLength(1);
  });

  test("aborts every active discover request when stopped", async () => {
    const signals = [];
    vi.stubGlobal("fetch", vi.fn((url, options) => {
      signals.push(options.signal);
      return new Promise((resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    }));

    const stop = scanLan(27123, vi.fn(), "");
    await Promise.resolve();
    stop();
    await Promise.resolve();

    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
});
