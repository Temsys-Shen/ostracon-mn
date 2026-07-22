import { describe, expect, test } from "vitest";
import { __test__ } from "./lanScan";

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
});
