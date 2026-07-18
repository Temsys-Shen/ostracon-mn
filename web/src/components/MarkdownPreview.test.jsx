import { fireEvent, render } from "@testing-library/react";
import React from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";
import { describe, expect, test, vi } from "vitest";
import { MarkdownBody, measureHtmlContent, ObsidianHtmlBody, normalizeDisplayMathFences } from "./VaultBrowser";

describe("Markdown preview line breaks", () => {
  test("renders Obsidian HTML inside a shadow root and rewrites vault assets", () => {
    const contentRef = { current: null };
    const { container } = render(<ObsidianHtmlBody html={'<div class="ta-bookmark"><div class="ta-bookmark-content"><div class="ta-bookmark-url-text">https://example.com</div><img src="ostracon-asset://Assets%2Fcover.png"></div><a data-href="Other.md">书签</a></div>'} assetUrls={{ "Assets/cover.png": "data:image/png;base64,YQ==" }} onOpen={vi.fn()} contentRef={contentRef} />);
    const shadow = container.querySelector(".obsidian-html-host").shadowRoot;
    expect(shadow.querySelector(".ta-bookmark")).not.toBeNull();
    expect(shadow.querySelector("img").src).toBe("data:image/png;base64,YQ==");
    expect(shadow.querySelector("style").textContent).toContain(".copy-code-button");
    expect(shadow.querySelector("style").textContent).toContain(".token.keyword");
    expect(shadow.querySelector("style").textContent).toContain(".ta-bookmark-cover");
    expect(shadow.querySelector("style").textContent).toContain("flex-direction:column-reverse");
    expect(shadow.querySelector("style").textContent).toContain("width:100%;max-width:100%");
    expect(shadow.querySelector("style").textContent).toContain("img{max-width:100%!important;width:auto!important;height:auto!important;object-fit:contain!important}");
    expect(shadow.querySelector("style").textContent).not.toContain("height:76px;object-fit:cover");
    expect(contentRef.current).toBe(shadow.querySelector(".obsidian-html-body"));
  });
  test("opens a Typing Assistant bookmark URL", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const { container } = render(<ObsidianHtmlBody html={'<div class="ta-bookmark"><div class="ta-bookmark-url-text">https://example.com/page</div></div>'} assetUrls={{}} onOpen={vi.fn()} />);
    fireEvent.click(container.querySelector(".obsidian-html-host").shadowRoot.querySelector(".ta-bookmark"));
    expect(open).toHaveBeenCalledWith("https://example.com/page", "_blank");
    open.mockRestore();
  });
  test("measures the responsive HTML body for readonly imports", () => {
    expect(measureHtmlContent({ clientWidth: 638.4, scrollHeight: 912.6 })).toEqual({ width: 638, height: 913 });
    expect(() => measureHtmlContent({ clientWidth: 0, scrollHeight: 400 })).toThrow("HTML预览尺寸无效");
  });
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
