import './style.css';
import { state, appConfig, loadSettings, editor, status, cache } from './state';
import { JianPuParser } from './parser';
import { JianPuRenderer } from './renderer';
import { JianPuPlayer } from './player';
import { initPanels } from './ui/panels';
import { initVirtualKeyboard } from './ui/keyboard';
import { initExportModal, initSettingsModal } from './ui/modals';
import { initEditorSync } from './editor/sync';
import { initHighlightSync } from './editor/highlighter';

declare global {
  interface Window {
    render: () => void;
  }
}

const canvas = document.getElementById('jianpuCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

const parser = new JianPuParser();
const renderer = new JianPuRenderer(canvas, ctx);
const player = new JianPuPlayer();

function applySettingsToRenderer() {
  renderer.config.lineHeight = appConfig.lineHeight;
  renderer.config.maxMeasuresPerLine = appConfig.maxMeasuresPerLine;
}

function parseAndRender() {
  const text = editor.value;
  cache.parseResult = parser.parse(text);
  renderer.render(cache.parseResult);
}

function renderCached() {
  if (cache.parseResult) {
    renderer.render(cache.parseResult);
  } else {
    parseAndRender();
  }
}
window.render = renderCached;

// 输入防抖 150ms
let inputDebounceTimer: ReturnType<typeof setTimeout>;
editor.addEventListener('input', () => {
  clearTimeout(inputDebounceTimer);
  inputDebounceTimer = setTimeout(() => {
    parseAndRender();
    localStorage.setItem('jianpu_editor_content', editor.value);
  }, 150);
});

// 播放按钮
const btnPlay = document.getElementById('btnPlay') as HTMLButtonElement;
btnPlay.addEventListener('click', () => {
  if (state.isPlaying) {
    player.stop(false, false, false);
    btnPlay.innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> 播放';
    btnPlay.classList.remove('btn-active');
    return;
  }

  if (state.playbackNotes.length === 0) {
    status.textContent = '没有可播放的音符';
    return;
  }

  player.play(state.playbackNotes, state.totalDuration);
  btnPlay.innerHTML =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg> 暂停';
  btnPlay.classList.add('btn-active');
  status.textContent = `播放中... ♩=${state.bpm}`;
});

// 停止按钮
const btnStop = document.getElementById('btnStop') as HTMLButtonElement;
btnStop.addEventListener('click', () => {
  player.stop();
  btnPlay.innerHTML =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> 播放';
  btnPlay.classList.remove('btn-active');
});

// 音量滑块
const volumeSlider = document.getElementById('volumeSlider') as HTMLInputElement;
volumeSlider.addEventListener('input', (e: Event) => {
  const val = parseInt((e.target as HTMLInputElement).value, 10);
  player.volume = val / 100;
  document.getElementById('volumeValue')!.textContent = val + '%';
  if (player.masterGain && player.audioCtx) {
    player.masterGain.gain.setValueAtTime(player.volume, player.audioCtx.currentTime);
  }
});

// 打印按钮
document.getElementById('btnPrint')!.addEventListener('click', () => {
  window.print();
});

// 示例按钮（逻辑在 highlightSync 初始化后绑定，见下方）

// 复制源码按钮
document.getElementById('btnCopy')!.addEventListener('click', async () => {
  const btn = document.getElementById('btnCopy') as HTMLButtonElement;
  const originalHTML = btn.innerHTML;

  try {
    await navigator.clipboard.writeText(editor.value);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = editor.value;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }

  btn.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> 已复制';
  btn.style.background = 'var(--success)';
  btn.style.color = '#fff';
  btn.style.borderColor = 'var(--success)';

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
document.getElementById('zoomSelect')!.addEventListener('change', (e: Event) => {
  state.zoom = parseFloat((e.target as HTMLSelectElement).value);
  updateZoom();
});

function updateZoom() {
  canvas.style.transform = `scale(${state.zoom})`;
  canvas.style.transformOrigin = 'top center';
}

// 键盘快捷键
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.target === editor) return;

  if (e.code === 'Space') {
    e.preventDefault();
    btnPlay.click();
  }
  if (e.code === 'Escape') {
    btnStop.click();
  }
  if (e.ctrlKey && e.key === 'p') {
    e.preventDefault();
    window.print();
  }
});

// 初始化各子模块
initPanels({ onRender: renderCached });
initVirtualKeyboard({ editor });
initEditorSync({ canvas, renderer, editor });
const highlightSync = initHighlightSync({
  editor,
  highlightEl: document.getElementById('editorHighlight') as HTMLPreElement,
  codeEl: document.querySelector('#editorHighlight code') as HTMLElement,
});
initExportModal({ parser, renderer, canvas, ctx, editor });
initSettingsModal({ applySettings: applySettingsToRenderer, onRender: renderCached });

// 示例按钮
document.getElementById('btnExample')!.addEventListener('click', () => {
  const example = `!小星星
%C=4/4
@100
$1_ 5_ 1 5

框(1 1 5 5) | 框(6 6 5) - | 4 4 3 3 | 2 2 1 - |
5 5 4 4 | 3 3 2 - | 5 5 4 4 | 3 3 2 - |
1 1 5 5 | 6 6 5 - | 4 4 3 3 | 2 2 1 - ||`;
  editor.value = example;
  highlightSync.update();
  parseAndRender();
  status.innerHTML = '<span class="status-dot"></span>已加载：小星星';
});

// 恢复设置
loadSettings();
applySettingsToRenderer();

// 恢复上次内容
const saved = localStorage.getItem('jianpu_editor_content');
if (saved) {
  editor.value = saved;
  highlightSync.update();
}

// 初始渲染
parseAndRender();

// 窗口大小变化（内容未变，直接用缓存重绘）
window.addEventListener('resize', renderCached);
