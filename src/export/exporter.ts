import JSZip from 'jszip';
import type { JianPuParser } from '../parser';
import type { JianPuRenderer } from '../renderer';
import type { PageInfo } from '../types';
import { appConfig } from '../state';

function triggerDownload(url: string, filename: string) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    if (link.parentNode) link.parentNode.removeChild(link);
  }, 1000);
}

export async function doExport(options: {
  parser: JianPuParser;
  renderer: JianPuRenderer;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  editor: HTMLTextAreaElement;
}) {
  const { parser, renderer, canvas, ctx, editor } = options;

  const btnConfirmExport = document.getElementById('btnConfirmExport') as HTMLButtonElement;
  const exportModal = document.getElementById('exportModal') as HTMLDivElement;
  const exportResolution = document.getElementById('exportResolution') as HTMLSelectElement;
  const status = document.getElementById('status') as HTMLDivElement;

  let scale = parseFloat(exportResolution.value);
  const format = (document.getElementById('exportFormat') as HTMLSelectElement).value;

  const maxCanvasSize = 4096;
  if (format === 'png' && Math.round(720 * scale) > maxCanvasSize) {
    scale = Math.floor((maxCanvasSize / 720) * 10) / 10;
  }

  const text = editor.value;
  const data = parser.parse(text);
  const layout = renderer.computeLayout(data);

  const origCanvas = canvas;
  const origCtx = ctx;
  const dateStr = new Date().toISOString().slice(0, 10);
  const baseName = (data.settings.title || 'jianpu').replace(/[^\w\u4e00-\u9fa5]/g, '_');

  try {
    btnConfirmExport.disabled = true;
    btnConfirmExport.textContent = '导出中…';
    status.textContent = '正在导出…';

    if (!layout) {
      if (format === 'png') {
        const tmp = document.createElement('canvas');
        const tmpCtx = tmp.getContext('2d')!;
        renderer.setCanvas(tmp, tmpCtx);
        renderer.renderEmpty({ scale });
        triggerDownload(tmp.toDataURL('image/png'), `${baseName}_${dateStr}.png`);
      } else {
        const svgStr = renderer.renderEmptySVG({ scale });
        const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
        triggerDownload(URL.createObjectURL(blob), `${baseName}_${dateStr}.svg`);
      }
      status.textContent = '已导出';
      return;
    }

    const A4_HEIGHT = 1050;
    const MARGIN_Y = 50;
    const titleHeader = (layout.settings.title ? 40 : 0) + 50;
    const firstPageAvailable = A4_HEIGHT - MARGIN_Y - MARGIN_Y - titleHeader;
    const otherPageAvailable = A4_HEIGHT - MARGIN_Y - MARGIN_Y;

    const pages: { lines: number[]; usedHeight: number }[] = [];
    let currentPage: { lines: number[]; usedHeight: number } = { lines: [], usedHeight: 0 };
    let isFirstPage = true;

    for (let i = 0; i < layout.lines.length; i++) {
      const h = layout.lineHeights[i];
      const available = isFirstPage ? firstPageAvailable : otherPageAvailable;
      if (currentPage.lines.length === 0) {
        currentPage.lines.push(i);
        currentPage.usedHeight = h;
      } else if (currentPage.usedHeight + h <= available) {
        currentPage.lines.push(i);
        currentPage.usedHeight += h;
      } else {
        pages.push(currentPage);
        currentPage = { lines: [i], usedHeight: h };
        isFirstPage = false;
      }
    }
    if (currentPage.lines.length > 0) pages.push(currentPage);

    if (pages.length === 1) {
      if (format === 'png') {
        const tmp = document.createElement('canvas');
        const tmpCtx = tmp.getContext('2d')!;
        renderer.setCanvas(tmp, tmpCtx);
        renderer.render(data, { scale });
        triggerDownload(tmp.toDataURL('image/png'), `${baseName}_${dateStr}.png`);
        status.textContent = '已导出 PNG';
      } else {
        const svgStr = renderer.renderSVG(data, { scale });
        const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
        triggerDownload(URL.createObjectURL(blob), `${baseName}_${dateStr}.svg`);
        status.textContent = '已导出 SVG';
      }
    } else {
      const lineH = appConfig.lineHeight || 81;
      const labelExtra = 18;
      const firstPageHeader = (layout.settings.title ? 35 : 0) + Math.round(lineH * 0.75);
      const pageHeights = pages.map((pg, idx) => {
        const headerH = idx === 0 ? firstPageHeader : 0;
        return Math.max(400, 50 + headerH + pg.usedHeight + 50);
      });

      if (format === 'png') {
        for (const h of pageHeights) {
          if (Math.round(720 * scale) > maxCanvasSize || Math.round(h * scale) > maxCanvasSize) {
            let safeScale = scale;
            for (const ph of pageHeights) {
              safeScale = Math.min(safeScale, maxCanvasSize / 720, maxCanvasSize / ph);
            }
            scale = Math.floor(safeScale * 10) / 10;
            break;
          }
        }
      }

      const useFixedA4 = format === 'png' ? Math.round(1050 * scale) <= maxCanvasSize : true;
      const zip = new JSZip();

      if (format === 'png') {
        const tmpContainer = document.createElement('div');
        tmpContainer.style.cssText =
          'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1;overflow:hidden;';
        document.body.appendChild(tmpContainer);

        for (let p = 0; p < pages.length; p++) {
          const tmp = document.createElement('canvas');
          tmpContainer.appendChild(tmp);
          const tmpCtx = tmp.getContext('2d')!;
          renderer.setCanvas(tmp, tmpCtx);

          const pageInfo = {
            pageIndex: p,
            lineIndices: pages[p].lines,
            totalPages: pages.length,
          };

          if (!useFixedA4) {
            (pageInfo as Record<string, unknown>).actualHeight = pageHeights[p];
          }

          renderer.render(data, { scale, pageInfo });

          let blob = await new Promise<Blob | null>((resolve) => tmp.toBlob(resolve, 'image/png'));
          if (!blob || blob.size < 100) {
            const dataUrl = tmp.toDataURL('image/png');
            const base64 = dataUrl.split(',')[1];
            if (!base64 || base64.length < 100) {
              throw new Error(`第 ${p + 1} 页 canvas 无内容`);
            }
            const binaryStr = atob(base64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
            blob = new Blob([bytes], { type: 'image/png' });
          }

          if (tmp.parentNode) tmp.parentNode.removeChild(tmp);
          zip.file(`第${p + 1}页.png`, blob);
          status.textContent = `正在导出第 ${p + 1}/${pages.length} 页…`;
          await new Promise((r) => setTimeout(r, 0));
        }

        if (tmpContainer.parentNode) tmpContainer.parentNode.removeChild(tmpContainer);
      } else {
        for (let p = 0; p < pages.length; p++) {
          const pageInfo: PageInfo = {
            pageIndex: p,
            lineIndices: pages[p].lines,
            totalPages: pages.length,
          };
          if (!useFixedA4) {
            pageInfo.actualHeight = pageHeights[p];
          }
          const svgStr = renderer.renderSVG(data, { scale, pageInfo });
          const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
          zip.file(`第${p + 1}页.svg`, blob);
          status.textContent = `正在导出第 ${p + 1}/${pages.length} 页…`;
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      status.textContent = '正在生成 ZIP…';
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const blobUrl = URL.createObjectURL(zipBlob);
      triggerDownload(blobUrl, `${baseName}_${dateStr}.zip`);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      status.textContent = `已导出 ${pages.length} 页 ZIP`;
    }
  } catch (err) {
    console.error(err);
    const msg = '导出失败：' + (err instanceof Error ? err.message : String(err));
    status.textContent = msg;
    alert(msg);
  } finally {
    renderer.setCanvas(origCanvas, origCtx);
    btnConfirmExport.disabled = false;
    btnConfirmExport.textContent = '导出';
    exportModal.classList.remove('active');
    setTimeout(() => (status.textContent = '就绪'), 3000);
  }
}
