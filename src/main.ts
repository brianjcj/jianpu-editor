// @ts-nocheck
import './style.css';
import JSZip from 'jszip';
import { state, appConfig, loadSettings, editor, status, canvasContainer, cache } from './state';

let canvas = document.getElementById('jianpuCanvas') as HTMLCanvasElement;
let ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
import { JianPuParser } from './parser';
import { JianPuRenderer } from './renderer';
import { JianPuPlayer } from './player';

const parser = new JianPuParser();
const renderer = new JianPuRenderer(canvas, ctx);
const player = new JianPuPlayer();

function applySettingsToRenderer() {
  renderer.config.lineHeight = appConfig.lineHeight;
  renderer.config.maxMeasuresPerLine = appConfig.maxMeasuresPerLine;
}

// 解析并渲染（文本变化时调用）
function parseAndRender() {
  const text = editor.value;
  cache.parseResult = parser.parse(text);
  renderer.render(cache.parseResult);
}
// 使用缓存直接重绘（播放进度更新等高频场景调用）
function renderCached() {
  if (cache.parseResult) {
    renderer.render(cache.parseResult);
  } else {
    parseAndRender();
  }
}
// player.ts 在模块外调用全局 render，挂载缓存版本
(window as any).render = renderCached;

// 事件监听（输入防抖 150ms，避免快速输入时连续重绘）
let inputDebounceTimer: ReturnType<typeof setTimeout>;
editor.addEventListener('input', () => {
  clearTimeout(inputDebounceTimer);
  inputDebounceTimer = setTimeout(() => {
    parseAndRender();
    // 保存到 localStorage
    localStorage.setItem('jianpu_editor_content', editor.value);
  }, 150);
});

// 播放按钮
document.getElementById('btnPlay').addEventListener('click', () => {
  if (state.isPlaying) {
    player.stop(false, false, false);
    document.getElementById('btnPlay').innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> 播放';
    document.getElementById('btnPlay').classList.remove('btn-active');
    return;
  }

  if (state.playbackNotes.length === 0) {
    status.textContent = '没有可播放的音符';
    return;
  }

  player.play(state.playbackNotes, state.totalDuration);
  document.getElementById('btnPlay').innerHTML =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg> 暂停';
  document.getElementById('btnPlay').classList.add('btn-active');
  status.textContent = `播放中... ♩=${state.bpm}`;
});

// 停止按钮
document.getElementById('btnStop').addEventListener('click', () => {
  player.stop();
  document.getElementById('btnPlay').innerHTML =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> 播放';
  document.getElementById('btnPlay').classList.remove('btn-active');
});

// 音量滑块
document.getElementById('volumeSlider').addEventListener('input', e => {
  const val = parseInt(e.target.value, 10);
  player.volume = val / 100;
  document.getElementById('volumeValue').textContent = val + '%';
  if (player.masterGain && player.audioCtx) {
    player.masterGain.gain.setValueAtTime(player.volume, player.audioCtx.currentTime);
  }
});

// 打印按钮
document.getElementById('btnPrint').addEventListener('click', () => {
  window.print();
});

// 兼容 iOS Safari / 老浏览器的下载触发
function triggerDownload(url, filename) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  // 延迟移除，避免打断浏览器下载请求
  setTimeout(() => {
    if (link.parentNode) link.parentNode.removeChild(link);
  }, 1000);
}

async function doExport() {
  let scale = parseFloat(exportResolution.value);
  const format = document.getElementById('exportFormat').value;

  // iOS Safari canvas 宽度检查（仅 PNG）
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
        canvas = tmp;
        ctx = tmp.getContext('2d');
        renderer.setCanvas(canvas, ctx);
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

    const pages = [];
    let currentPage = { lines: [], usedHeight: 0 };
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
        canvas = tmp;
        ctx = tmp.getContext('2d');
        renderer.setCanvas(canvas, ctx);
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
      // 先计算每页高度
      const lineH = appConfig.lineHeight || 81;
      const labelExtra = 18;
      const firstPageHeader = (layout.settings.title ? 35 : 0) + Math.round(lineH * 0.75);
      const pageHeights = pages.map((pg, idx) => {
        const headerH = idx === 0 ? firstPageHeader : 0;
        return Math.max(400, 50 + headerH + pg.usedHeight + 50);
      });

      if (format === 'png') {
        // 检查目标 scale 是否会超限（高度或宽度任一超限都要降级）
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

      // A4 固定高度 1050，如果 scale 下不超限就用固定 A4（更标准），否则用自适应高度
      const useFixedA4 = format === 'png' ? Math.round(1050 * scale) <= maxCanvasSize : true; // SVG 无 canvas 限制，固定用 A4

      const zip = new JSZip();

      if (format === 'png') {
        const tmpContainer = document.createElement('div');
        tmpContainer.style.cssText =
          'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1;overflow:hidden;';
        document.body.appendChild(tmpContainer);

        for (let p = 0; p < pages.length; p++) {
          const tmp = document.createElement('canvas');
          tmpContainer.appendChild(tmp);
          canvas = tmp;
          ctx = tmp.getContext('2d');
          renderer.setCanvas(canvas, ctx);

          const pageInfo = {
            pageIndex: p,
            lineIndices: pages[p].lines,
            totalPages: pages.length,
          };

          if (!useFixedA4) {
            pageInfo.actualHeight = pageHeights[p];
          }

          renderer.render(data, { scale, pageInfo });

          let blob = await new Promise(resolve => tmp.toBlob(resolve, 'image/png'));
          if (!blob || blob.size < 100) {
            const dataUrl = tmp.toDataURL('image/png');
            const base64 = dataUrl.split(',')[1];
            if (!base64 || base64.length < 100) {
              throw new Error(`第 ${p + 1} 页 canvas 无内容`);
            }
            const binaryStr = atob(base64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
            blob = bytes;
          }

          if (tmp.parentNode) tmp.parentNode.removeChild(tmp);
          zip.file(`第${p + 1}页.png`, blob);
          status.textContent = `正在导出第 ${p + 1}/${pages.length} 页…`;
          await new Promise(r => setTimeout(r, 0));
        }

        if (tmpContainer.parentNode) tmpContainer.parentNode.removeChild(tmpContainer);
      } else {
        for (let p = 0; p < pages.length; p++) {
          const pageInfo = {
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
          await new Promise(r => setTimeout(r, 0));
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
    const msg = '导出失败：' + (err && err.message ? err.message : String(err));
    status.textContent = msg;
    alert(msg);
  } finally {
    canvas = origCanvas;
    ctx = origCtx;
    renderer.setCanvas(canvas, ctx);
    btnConfirmExport.disabled = false;
    btnConfirmExport.textContent = '导出';
    exportModal.classList.remove('active');
    setTimeout(() => (status.textContent = '就绪'), 3000);
  }
}

// 示例按钮
document.getElementById('btnExample').addEventListener('click', () => {
  const example = `!小星星
%C=4/4
@100
$1_ 5_ 1 5

框(1 1 5 5) | 框(6 6 5) - | 4 4 3 3 | 2 2 1 - |
5 5 4 4 | 3 3 2 - | 5 5 4 4 | 3 3 2 - |
1 1 5 5 | 6 6 5 - | 4 4 3 3 | 2 2 1 - ||`;
  editor.value = example;
  render();
  status.innerHTML = '<span class="status-dot"></span>已加载：小星星';
});

// 复制源码按钮
document.getElementById('btnCopy').addEventListener('click', async () => {
  const btn = document.getElementById('btnCopy');
  const originalHTML = btn.innerHTML;

  try {
    await navigator.clipboard.writeText(editor.value);
  } catch (err) {
    // 降级方案
    const textarea = document.createElement('textarea');
    textarea.value = editor.value;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }

  // 按钮变为成功状态
  btn.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> 已复制';
  btn.style.background = 'var(--success)';
  btn.style.color = '#fff';
  btn.style.borderColor = 'var(--success)';

  // 底部状态栏提示
  status.innerHTML = '<span class="status-dot" style="background:var(--success);"></span>已复制到剪贴板';

  setTimeout(() => {
    btn.innerHTML = originalHTML;
    btn.style.background = '';
    btn.style.color = '';
    btn.style.borderColor = '';
    status.innerHTML = '<span class="status-dot"></span>就绪';
  }, 2000);
});

// 缩放控制
document.getElementById('zoomSelect').addEventListener('change', e => {
  state.zoom = parseFloat(e.target.value);
  updateZoom();
});

function updateZoom() {
  canvas.style.transform = `scale(${state.zoom})`;
  canvas.style.transformOrigin = 'top center';
}

// 键盘快捷键
document.addEventListener('keydown', e => {
  if (e.target === editor) return; // 编辑时不触发

  if (e.code === 'Space') {
    e.preventDefault();
    document.getElementById('btnPlay').click();
  }
  if (e.code === 'Escape') {
    document.getElementById('btnStop').click();
  }
  if (e.ctrlKey && e.key === 'p') {
    e.preventDefault();
    window.print();
  }
});

// 浮动虚拟键盘
const fabToggle = document.getElementById('fabToggle');
const fabKeys = document.getElementById('fabKeys');
const fabKeyboard = document.getElementById('fabKeyboard');

// 阻止键盘区域触发编辑器失焦
fabKeyboard.addEventListener('pointerdown', e => {
  e.preventDefault();
});

// 源码编辑器获得焦点时显示浮动键盘
editor.addEventListener('focus', () => {
  fabKeyboard.classList.add('visible');
  syncFabKeyboardPosition();
});
editor.addEventListener('blur', () => {
  // 延迟检查，如果焦点不在键盘上则隐藏
  setTimeout(() => {
    if (!fabKeyboard.contains(document.activeElement)) {
      fabKeyboard.classList.remove('visible');
      fabKeys.classList.remove('open');
    }
  }, 150);
});

// 移动端键盘弹出时补偿 layout viewport 滚动，防止 fixed 元素被顶走
function syncFabKeyboardPosition() {
  const vv = window.visualViewport;
  if (!vv) return;
  // offsetTop: visual viewport 顶部相对于 layout viewport 顶部的偏移
  // 当键盘弹出并推动 layout viewport 时，offsetTop > 0，
  // 需要把 fixed 元素向下拉回同等距离，才能保持在可视区域顶部
  const top = 16 + vv.offsetTop;
  fabKeyboard.style.top = top + 'px';
}

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', syncFabKeyboardPosition);
  window.visualViewport.addEventListener('scroll', syncFabKeyboardPosition);
}
// 不支持 visualViewport 的旧浏览器 fallback
window.addEventListener('resize', syncFabKeyboardPosition);

fabToggle.addEventListener('click', e => {
  e.preventDefault();
  fabKeys.classList.toggle('open');
  editor.focus();
});

fabKeyboard.addEventListener('click', e => {
  const key = e.target.closest('.fab-key');
  if (!key) return;

  e.preventDefault();
  const char = key.dataset.char;

  if (char === 'BACKSPACE') {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    if (start > 0) {
      const text = editor.value;
      editor.value = text.slice(0, start - 1) + text.slice(end);
      editor.selectionStart = editor.selectionEnd = start - 1;
    }
  } else if (char === '框(') {
    // 框选按钮特殊处理：有选中文本则包裹，无选中文本则插入空框并将光标放入
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const text = editor.value;
    const selected = text.slice(start, end);
    if (selected.length > 0) {
      const replacement = '框(' + selected + ')';
      editor.value = text.slice(0, start) + replacement + text.slice(end);
      editor.selectionStart = start + replacement.length;
      editor.selectionEnd = start + replacement.length;
    } else {
      editor.value = text.slice(0, start) + '框()' + text.slice(end);
      editor.selectionStart = editor.selectionEnd = start + 2; // 光标放在括号内
    }
  } else {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const text = editor.value;
    editor.value = text.slice(0, start) + char + text.slice(end);
    editor.selectionStart = editor.selectionEnd = start + char.length;
  }

  editor.dispatchEvent(new Event('input'));
  editor.focus();
});

// 面板状态 - 与HTML初始状态保持一致
const panelStates = {
  editor: true,
  syntax: false,
  preview: true,
};

// 语法提示弹窗控制
const syntaxModal = document.getElementById('syntaxModal');
const btnCloseSyntaxModal = document.getElementById('btnCloseSyntaxModal');

function openSyntaxModal() {
  syntaxModal.classList.add('active');
}

function closeSyntaxModal() {
  syntaxModal.classList.remove('active');
  // 关闭弹窗时重置按钮状态
  panelStates.syntax = false;
  document.getElementById('toggleSyntax').classList.remove('active');
}

btnCloseSyntaxModal.addEventListener('click', closeSyntaxModal);
syntaxModal.addEventListener('click', e => {
  if (e.target === syntaxModal) closeSyntaxModal();
});

function updatePanelVisibility() {
  const editorPanel = document.querySelector('.editor-panel');
  const previewPanel = document.querySelector('.preview-panel');
  const main = document.querySelector('.main');

  // 编辑器
  if (panelStates.editor) {
    editorPanel.classList.remove('panel-hidden');
    document.getElementById('toggleEditor').classList.add('active');
  } else {
    editorPanel.classList.add('panel-hidden');
    document.getElementById('toggleEditor').classList.remove('active');
  }

  // 语法提示 - 现在用弹窗，不再控制面板显示
  if (panelStates.syntax) {
    openSyntaxModal();
    document.getElementById('toggleSyntax').classList.add('active');
  } else {
    document.getElementById('toggleSyntax').classList.remove('active');
  }

  // 预览区
  if (panelStates.preview) {
    previewPanel.classList.remove('panel-hidden');
    document.getElementById('togglePreview').classList.add('active');
  } else {
    previewPanel.classList.add('panel-hidden');
    document.getElementById('togglePreview').classList.remove('active');
  }

  // 如果只有一个面板显示，让它占满空间
  const visiblePanels = [panelStates.editor, panelStates.preview].filter(Boolean).length;
  if (visiblePanels === 1) {
    if (panelStates.editor && !panelStates.preview) {
      editorPanel.style.width = '100%';
      editorPanel.style.flex = '1';
    }
    if (panelStates.preview && !panelStates.editor) {
      previewPanel.style.width = '100%';
      previewPanel.style.flex = '1';
    }
  } else {
    editorPanel.style.width = '';
    editorPanel.style.flex = '';
    previewPanel.style.width = '';
    previewPanel.style.flex = '';
    main.style.flexDirection = '';
  }

  // 重新渲染
  setTimeout(() => render(), 100);
}

document.getElementById('toggleEditor').addEventListener('click', () => {
  panelStates.editor = !panelStates.editor;
  updatePanelVisibility();
});

document.getElementById('toggleSyntax').addEventListener('click', () => {
  panelStates.syntax = !panelStates.syntax;
  updatePanelVisibility();
});

document.getElementById('togglePreview').addEventListener('click', () => {
  panelStates.preview = !panelStates.preview;
  updatePanelVisibility();
});

// 恢复设置
loadSettings();
applySettingsToRenderer();

// 恢复上次内容
const saved = localStorage.getItem('jianpu_editor_content');
if (saved) {
  editor.value = saved;
}

// 初始渲染
parseAndRender();

// 窗口大小变化（内容未变，直接用缓存重绘）
window.addEventListener('resize', () => {
  renderCached();
});

// 导出对话框初始化（DOM 已就绪后绑定）
function initExportModal() {
  const exportModal = document.getElementById('exportModal');
  const exportFormat = document.getElementById('exportFormat');
  const exportResolution = document.getElementById('exportResolution');
  const resolutionLabel = document.getElementById('resolutionLabel');
  const exportHint = document.getElementById('exportHint');
  const btnCancelExport = document.getElementById('btnCancelExport');
  const btnConfirmExport = document.getElementById('btnConfirmExport');
  if (!exportModal || !exportResolution) return;

  const RESOLUTION_HINTS = {
    '1.5': {
      label: '屏幕浏览',
      size: '约 1080×1600 像素',
      file: '文件约 200–400 KB',
      desc: '适合微信、网页分享，加载快。',
    },
    '3.5': {
      label: '高清打印',
      size: '约 2520×3700 像素',
      file: '文件约 1–2 MB',
      desc: '适合 A4 纸打印，字迹清晰无锯齿。',
    },
    '5': { label: '超清打印', size: '约 3600×5300 像素', file: '文件约 2–4 MB', desc: '适合高精度打印或放大查看。' },
  };

  function updateExportHint() {
    const fmt = exportFormat.value;
    if (fmt === 'svg') {
      exportHint.innerHTML =
        '<strong>SVG 矢量图</strong>：无限缩放不失真，文件极小，<br>打印效果最佳，推荐用于印刷排版。';
      resolutionLabel.style.display = 'none';
      exportResolution.style.display = 'none';
      return;
    }
    resolutionLabel.style.display = '';
    exportResolution.style.display = '';
    const val = exportResolution.value;
    const info = RESOLUTION_HINTS[val];
    if (info) {
      exportHint.innerHTML = `<strong>${info.label}</strong>：${info.size}，${info.file}<br>${info.desc}`;
    }
  }
  exportFormat.addEventListener('change', updateExportHint);
  exportResolution.addEventListener('change', updateExportHint);
  updateExportHint();

  document.getElementById('btnExport').addEventListener('click', () => {
    exportModal.classList.add('active');
  });

  btnCancelExport.addEventListener('click', () => {
    exportModal.classList.remove('active');
  });

  exportModal.addEventListener('click', e => {
    if (e.target === exportModal) exportModal.classList.remove('active');
  });

  btnConfirmExport.addEventListener('click', doExport);
}

function initSettingsModal() {
  const settingsModal = document.getElementById('settingsModal');
  const lineHeightSlider = document.getElementById('lineHeightSlider');
  const lineHeightNumber = document.getElementById('lineHeightNumber');
  const lineHeightValue = document.getElementById('lineHeightValue');
  const enableMaxMeasures = document.getElementById('enableMaxMeasures');
  const maxMeasuresSlider = document.getElementById('maxMeasuresSlider');
  const maxMeasuresNumber = document.getElementById('maxMeasuresNumber');
  const maxMeasuresValue = document.getElementById('maxMeasuresValue');
  const btnCancelSettings = document.getElementById('btnCancelSettings');
  const btnConfirmSettings = document.getElementById('btnConfirmSettings');

  if (!settingsModal) return;

  function syncLineHeight(val) {
    val = Math.max(40, Math.min(150, parseInt(val) || 81));
    lineHeightSlider.value = val;
    lineHeightNumber.value = val;
    lineHeightValue.textContent = val + 'px';
  }

  function syncMaxMeasures(val) {
    val = Math.max(2, Math.min(20, parseInt(val) || 4));
    maxMeasuresSlider.value = val;
    maxMeasuresNumber.value = val;
    maxMeasuresValue.textContent = val;
  }

  // 同步 UI（配置已在页面加载时恢复）
  syncLineHeight(appConfig.lineHeight);
  enableMaxMeasures.checked = appConfig.enableMaxMeasures;
  maxMeasuresSlider.value = appConfig.maxMeasuresPerLine || 4;
  maxMeasuresNumber.value = appConfig.maxMeasuresPerLine || 4;
  maxMeasuresSlider.disabled = !appConfig.enableMaxMeasures;
  maxMeasuresNumber.disabled = !appConfig.enableMaxMeasures;
  maxMeasuresValue.textContent = appConfig.enableMaxMeasures ? appConfig.maxMeasuresPerLine || 4 : '自动';

  // 打开设置
  document.getElementById('btnSettings').addEventListener('click', () => {
    settingsModal.classList.add('active');
  });

  // 取消
  btnCancelSettings.addEventListener('click', () => {
    settingsModal.classList.remove('active');
  });
  settingsModal.addEventListener('click', e => {
    if (e.target === settingsModal) settingsModal.classList.remove('active');
  });

  // 行距滑块
  lineHeightSlider.addEventListener('input', e => {
    syncLineHeight(e.target.value);
  });

  // 行距数字输入：input 只同步 slider / 显示，不做截断；change / blur 时才截断
  lineHeightNumber.addEventListener('input', e => {
    const raw = e.target.value;
    const val = parseInt(raw);
    if (!isNaN(val) && raw.trim() !== '') {
      lineHeightSlider.value = val;
      lineHeightValue.textContent = val + 'px';
    }
  });
  lineHeightNumber.addEventListener('change', e => {
    syncLineHeight(e.target.value);
  });

  // 限制小节数复选框
  enableMaxMeasures.addEventListener('change', e => {
    const checked = e.target.checked;
    maxMeasuresSlider.disabled = !checked;
    maxMeasuresNumber.disabled = !checked;
    maxMeasuresValue.textContent = checked ? maxMeasuresSlider.value : '自动';
  });

  // 小节数滑块
  maxMeasuresSlider.addEventListener('input', e => {
    if (enableMaxMeasures.checked) {
      syncMaxMeasures(e.target.value);
    }
  });

  // 小节数数字输入：input 只同步 slider / 显示，不做截断；change / blur 时才截断
  maxMeasuresNumber.addEventListener('input', e => {
    if (!enableMaxMeasures.checked) return;
    const raw = e.target.value;
    const val = parseInt(raw);
    if (!isNaN(val) && raw.trim() !== '') {
      maxMeasuresSlider.value = val;
      maxMeasuresValue.textContent = val;
    }
  });
  maxMeasuresNumber.addEventListener('change', e => {
    if (enableMaxMeasures.checked) {
      syncMaxMeasures(e.target.value);
    }
  });

  // 恢复默认
  document.getElementById('btnResetSettings').addEventListener('click', () => {
    appConfig.lineHeight = 81;
    appConfig.enableMaxMeasures = false;
    appConfig.maxMeasuresPerLine = null;

    syncLineHeight(81);
    enableMaxMeasures.checked = false;
    syncMaxMeasures(4);
    maxMeasuresSlider.disabled = true;
    maxMeasuresNumber.disabled = true;
    maxMeasuresValue.textContent = '自动';

    localStorage.setItem(
      'jianpu_editor_settings',
      JSON.stringify({
        lineHeight: appConfig.lineHeight,
        enableMaxMeasures: appConfig.enableMaxMeasures,
        maxMeasuresPerLine: appConfig.maxMeasuresPerLine,
      })
    );

    applySettingsToRenderer();
    render();

    status.textContent = '已恢复默认设置';
    setTimeout(() => {
      if (status.textContent === '已恢复默认设置') status.textContent = '就绪';
    }, 2000);
  });

  btnConfirmSettings.addEventListener('click', () => {
    appConfig.lineHeight = parseInt(lineHeightSlider.value);
    appConfig.enableMaxMeasures = enableMaxMeasures.checked;
    appConfig.maxMeasuresPerLine = enableMaxMeasures.checked ? parseInt(maxMeasuresSlider.value) : null;

    localStorage.setItem(
      'jianpu_editor_settings',
      JSON.stringify({
        lineHeight: appConfig.lineHeight,
        enableMaxMeasures: appConfig.enableMaxMeasures,
        maxMeasuresPerLine: appConfig.maxMeasuresPerLine,
      })
    );

    applySettingsToRenderer();
    render();

    settingsModal.classList.remove('active');
    status.textContent = '设置已应用';
    setTimeout(() => {
      if (status.textContent === '设置已应用') status.textContent = '就绪';
    }, 2000);
  });
}

window.addEventListener('DOMContentLoaded', () => {
  initExportModal();
  initSettingsModal();
});

// ===== 点击预览跳转到源码 =====
canvas.addEventListener('click', e => {
  if (!renderer.clickMap || renderer.clickMap.length === 0) return;

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const canvasX = (e.clientX - rect.left) * scaleX;
  const canvasY = (e.clientY - rect.top) * scaleY;
  const logicalX = canvasX / renderer.lastRenderScale;
  const logicalY = canvasY / renderer.lastRenderScale;

  let target = null;
  // 优先匹配音符（更精确）
  for (const item of renderer.clickMap) {
    if (
      item.type === 'note' &&
      logicalX >= item.x &&
      logicalX <= item.x + item.width &&
      logicalY >= item.y &&
      logicalY <= item.y + item.height
    ) {
      target = item;
      break;
    }
  }
  // 没匹配到音符则匹配小节
  if (!target) {
    for (const item of renderer.clickMap) {
      if (
        item.type === 'measure' &&
        logicalX >= item.x &&
        logicalX <= item.x + item.width &&
        logicalY >= item.y &&
        logicalY <= item.y + item.height
      ) {
        target = item;
        break;
      }
    }
  }

  if (target && target.sourceStart !== undefined && target.sourceEnd !== undefined) {
    editor.focus();
    editor.setSelectionRange(target.sourceStart, target.sourceEnd);
    // 临时高亮反馈
    editor.style.transition = 'box-shadow 0.15s ease';
    editor.style.boxShadow = 'inset 0 0 0 2px var(--primary)';
    setTimeout(() => {
      editor.style.boxShadow = '';
    }, 600);
  }
});
