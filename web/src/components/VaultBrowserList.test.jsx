import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, test, vi } from "vitest";
import { DOCUMENT_ROW_HEIGHT, DocumentRow } from "./VaultBrowser";

const documentItem = {
  title: "课程笔记",
  path: "课程/第一章/课程笔记.md",
  folder: "课程/第一章",
  mtime: new Date(2026, 6, 20).getTime(),
};

describe("Vault browser document rows", () => {
  test("uses the same compact height as folder rows", () => {
    expect(DOCUMENT_ROW_HEIGHT).toBe(36);
  });

  test("keeps the full path out of visible copy while retaining navigation context", () => {
    const onOpen = vi.fn();
    render(<DocumentRow active item={documentItem} onOpen={onOpen} />);

    const row = screen.getByRole("button", { name: `课程笔记，${documentItem.path}` });
    expect(row.getAttribute("title")).toBe(documentItem.path);
    expect(row.getAttribute("aria-current")).toBe("page");
    expect(row.textContent).toContain("课程笔记");
    expect(row.textContent).not.toContain(documentItem.path);
    expect(row.querySelector("small")).toBeNull();

    fireEvent.click(row);
    expect(onOpen).toHaveBeenCalledWith(documentItem.path);
  });
});
