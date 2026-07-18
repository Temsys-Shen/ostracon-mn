import html2canvas from "html2canvas";
import { PDFDocument } from "pdf-lib";

const CSS_TO_PDF_POINTS = 72 / 96;
const MAX_PDF_PAGE_POINTS = 14400;
const MAX_PDF_PAGE_CSS_HEIGHT = MAX_PDF_PAGE_POINTS / CSS_TO_PDF_POINTS;
const CAPTURE_SCALE = 2;
const MAX_CAPTURE_PIXELS = 16_000_000;
const MAX_CAPTURE_EDGE = 16_384;

function calculateCaptureBandHeight(width, scale = CAPTURE_SCALE) {
  if (!Number.isFinite(width) || width <= 0) throw new Error("PDF预览宽度无效");
  const scaledWidth = Math.ceil(width * scale);
  if (scaledWidth > MAX_CAPTURE_EDGE) throw new Error("PDF预览宽度超过Canvas限制");
  return Math.max(1, Math.floor(Math.min(MAX_CAPTURE_EDGE / scale, MAX_CAPTURE_PIXELS / (width * scale * scale))));
}

function calculatePdfPages(width, height, bandHeight = calculateCaptureBandHeight(width)) {
  if (!Number.isFinite(height) || height <= 0) throw new Error("PDF预览高度无效");
  const pages = [];
  let pageOffset = 0;
  while (pageOffset < height) {
    const pageHeight = Math.min(MAX_PDF_PAGE_CSS_HEIGHT, height - pageOffset);
    const bands = [];
    let bandOffset = 0;
    while (bandOffset < pageHeight) {
      const currentHeight = Math.min(bandHeight, pageHeight - bandOffset);
      bands.push({ sourceY: pageOffset + bandOffset, pageY: bandOffset, height: currentHeight });
      bandOffset += currentHeight;
    }
    pages.push({ width, height: pageHeight, bands });
    pageOffset += pageHeight;
  }
  return pages;
}

function waitForImage(image) {
  if (image.complete && image.naturalWidth > 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const done = () => { image.removeEventListener("load", done); image.removeEventListener("error", failed); resolve(); };
    const failed = () => { image.removeEventListener("load", done); image.removeEventListener("error", failed); reject(new Error(`PDF图片加载失败: ${image.currentSrc || image.src || "未知图片"}`)); };
    image.addEventListener("load", done, { once: true });
    image.addEventListener("error", failed, { once: true });
  });
}

function canvasToPngBytes(canvas) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(async blob => {
        if (!blob) { reject(new Error("PDF画布无法转换为PNG，可能包含跨域图片")); return; }
        resolve(new Uint8Array(await blob.arrayBuffer()));
      }, "image/png");
    } catch (error) {
      reject(new Error(`PDF画布导出失败，可能包含跨域图片: ${error.message || String(error)}`));
    }
  });
}

function nextAnimationFrame() {
  return new Promise(resolve => window.requestAnimationFrame(resolve));
}

function normalizeCanvasText(root) {
  const elements = [root, ...root.querySelectorAll("*")];
  for (const element of elements) {
    if (element.style?.textAlign === "justify") {
      element.style.textAlign = "left";
      element.style.textJustify = "auto";
      element.style.letterSpacing = "normal";
      element.style.wordSpacing = "normal";
    }
  }
}

async function createCaptureSurface(sourceElement) {
  if (!sourceElement) throw new Error("PDF预览正文不存在");
  const width = Math.round(sourceElement.clientWidth);
  if (width <= 0) throw new Error("PDF预览宽度无效");
  const viewport = document.createElement("div");
  viewport.className = "ostracon-pdf-capture";
  viewport.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;overflow:visible;background:#fff;color:#111;z-index:-1`;
  const style = document.createElement("style");
  style.textContent = ".ostracon-pdf-content{display:block;width:100%;max-width:100%;min-width:0;overflow-wrap:anywhere;word-break:break-word}.ostracon-pdf-content *{box-sizing:border-box;max-width:100%}.ostracon-pdf-content img{max-width:100%!important;width:auto!important;height:auto!important;object-fit:contain!important}";
  const content = sourceElement.cloneNode(true);
  content.classList.add("ostracon-pdf-content");
  content.style.width = "100%";
  content.style.maxWidth = "100%";
  normalizeCanvasText(content);
  viewport.append(style, content);
  document.body.appendChild(viewport);
  if (document.fonts?.ready) await document.fonts.ready;
  await Promise.all(Array.from(content.querySelectorAll("img")).map(waitForImage));
  await nextAnimationFrame();
  await nextAnimationFrame();
  const height = Math.ceil(content.scrollHeight);
  if (height <= 0) { viewport.remove(); throw new Error("PDF预览正文高度无效"); }
  return { viewport, content, width, height };
}

async function renderContinuousPdf(sourceElement, onProgress = () => {}) {
  onProgress("generating");
  const surface = await createCaptureSurface(sourceElement);
  try {
    const pdf = await PDFDocument.create();
    const pages = calculatePdfPages(surface.width, surface.height);
    const totalBands = pages.reduce((sum, page) => sum + page.bands.length, 0);
    let completedBands = 0;
    surface.viewport.style.overflow = "hidden";
    for (const pagePlan of pages) {
      const page = pdf.addPage([pagePlan.width * CSS_TO_PDF_POINTS, pagePlan.height * CSS_TO_PDF_POINTS]);
      for (const band of pagePlan.bands) {
        surface.viewport.style.height = `${band.height}px`;
        surface.content.style.transform = `translateY(${-band.sourceY}px)`;
        await nextAnimationFrame();
        const canvas = await html2canvas(surface.viewport, {
          backgroundColor: "#ffffff",
          width: surface.width,
          height: band.height,
          scale: CAPTURE_SCALE,
          useCORS: true,
          allowTaint: false,
          logging: false,
          imageTimeout: 15000,
        });
        const png = await pdf.embedPng(await canvasToPngBytes(canvas));
        const drawHeight = band.height * CSS_TO_PDF_POINTS;
        page.drawImage(png, {
          x: 0,
          y: page.getHeight() - band.pageY * CSS_TO_PDF_POINTS - drawHeight,
          width: page.getWidth(),
          height: drawHeight,
        });
        canvas.width = 0;
        canvas.height = 0;
        completedBands += 1;
        onProgress("generating", completedBands / totalBands);
      }
    }
    return await pdf.save();
  } finally {
    surface.viewport.remove();
  }
}

export { calculateCaptureBandHeight, calculatePdfPages, normalizeCanvasText, renderContinuousPdf };
