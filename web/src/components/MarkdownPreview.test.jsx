import { fireEvent, render } from "@testing-library/react";
import React from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";
import { describe, expect, test, vi } from "vitest";
import { MarkdownBody, normalizeDisplayMathFences } from "./VaultBrowser";

describe("Markdown preview line breaks", () => {
  test("renders a soft line ending as a visible break", () => {
    const { container } = render(
      <ReactMarkdown remarkPlugins={[remarkBreaks]}>{"first\nsecond"}</ReactMarkdown>,
    );

    expect(container.querySelector("br")).not.toBeNull();
  });

  test("renders inline and display math with KaTeX", () => {
    const { container } = render(
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{"Inline $x^2$\n\n$$\ny = x + 1\n$$"}</ReactMarkdown>,
    );

    expect(container.querySelectorAll(".katex")).toHaveLength(2);
    expect(container.querySelector(".katex-display")).not.toBeNull();
  });

  test("normalizes an Obsidian display math fence attached to the formula", () => {
    const markdown = "$$\nM_{persp\\rightarrow ortho}=\\begin{pmatrix}\n\nn&0&0&0\\\\\n\n0&n&0&0\\\\\n\n0&0&n+f&-nf\\\\\n\n0&0&1&0\n\n\\end{pmatrix}$$\n\n- $M_{persp\\rightarrow ortho}$ 变换";
    const normalized = normalizeDisplayMathFences(markdown);
    const { container } = render(
      <MarkdownBody markdown={markdown} assetUrls={{}} onOpen={vi.fn()} />,
    );

    expect(normalized).toContain("\\end{pmatrix}\n$$\n\n-");
    expect(container.querySelector(".katex-display .katex-error")).toBeNull();
    expect(container.querySelector("li .katex")).not.toBeNull();
  });

  test("keeps wheel and touch scrolling inside code blocks", () => {
    const onWheel = vi.fn();
    const onTouchMove = vi.fn();
    const { container } = render(
      <div onWheel={onWheel} onTouchMove={onTouchMove}>
        <MarkdownBody markdown={"```js\nconst value = 1;\n```"} assetUrls={{}} onOpen={vi.fn()} />
      </div>,
    );
    const codeBlock = container.querySelector("pre");
    Object.defineProperty(codeBlock, "clientHeight", { configurable: true, value: 200 });

    fireEvent.wheel(codeBlock, { deltaY: 40 });
    fireEvent.touchStart(codeBlock, { touches: [{ clientX: 30, clientY: 40 }] });
    fireEvent.touchMove(codeBlock, { touches: [{ clientX: 20, clientY: 10 }] });

    expect(codeBlock.scrollLeft).toBe(10);
    expect(codeBlock.scrollTop).toBe(70);
    expect(onWheel).not.toHaveBeenCalled();
    expect(onTouchMove).not.toHaveBeenCalled();
  });

  test("opens external links outside the WebView and keeps document links internal", () => {
    const onOpen = vi.fn();
    const { container } = render(
      <MarkdownBody markdown={"[Website](https://example.com) [Document](ostracon-doc://Notes%2FExample.md)"} assetUrls={{}} onOpen={onOpen} />,
    );
    const links = container.querySelectorAll("a");

    expect(links[0].getAttribute("target")).toBe("_blank");
    expect(links[0].getAttribute("rel")).toBe("noreferrer");
    expect(links[1].hasAttribute("target")).toBe(false);
    fireEvent.click(links[1]);
    expect(onOpen).toHaveBeenCalledWith("Notes/Example.md");
  });
});
