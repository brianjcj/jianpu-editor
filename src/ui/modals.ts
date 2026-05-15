import { doExport } from '../export/exporter';
import { appConfig } from '../state';
import type { JianPuParser } from '../parser';
import type { JianPuRenderer } from '../renderer';

export function initExportModal(deps: {
  parser: JianPuParser;
  renderer: JianPuRenderer;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  editor: HTMLTextAreaElement;
}) {
  const exportModal = document.getElementById('exportModal') as HTMLDivElement;
  const exportFormat = document.getElementById('exportFormat') as HTMLSelectElement;
  const exportResolution = document.getElementById('exportResolution') as HTMLSelectElement;
  const resolutionLabel = document.getElementById('resolutionLabel') as HTMLSpanElement;
  const exportHint = document.getElementById('exportHint') as HTMLDivElement;
  const btnCancelExport = document.getElementById('btnCancelExport') as HTMLButtonElement;
  const btnConfirmExport = document.getElementById('btnConfirmExport') as HTMLButtonElement;
  if (!exportModal || !exportResolution) return;

  const RESOLUTION_HINTS: Record<string, { label: string; size: string; file: string; desc: string }> = {
    '1.5': { label: '屏幕浏览', size: '约 1080×1600 像素', file: '文件约 200–400 KB', desc: '适合微信、网页分享，加载快。' },
    '3.5': { label: '高清打印', size: '约 2520×3700 像素', file: '文件约 1–2 MB', desc: '适合 A4 纸打印，字迹清晰无锯齿。' },
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

  document.getElementById('btnExport')!.addEventListener('click', () => {
    exportModal.classList.add('active');
  });

  btnCancelExport.addEventListener('click', () => {
    exportModal.classList.remove('active');
  });

  exportModal.addEventListener('click', (e: MouseEvent) => {
    if (e.target === exportModal) exportModal.classList.remove('active');
  });

  btnConfirmExport.addEventListener('click', () => doExport(deps));
}

export function initSettingsModal(options: {
  applySettings: () => void;
  onRender: () => void;
}) {
  const { applySettings, onRender } = options;

  const settingsModal = document.getElementById('settingsModal') as HTMLDivElement;
  const lineHeightSlider = document.getElementById('lineHeightSlider') as HTMLInputElement;
  const lineHeightNumber = document.getElementById('lineHeightNumber') as HTMLInputElement;
  const lineHeightValue = document.getElementById('lineHeightValue') as HTMLSpanElement;
  const enableMaxMeasures = document.getElementById('enableMaxMeasures') as HTMLInputElement;
  const maxMeasuresSlider = document.getElementById('maxMeasuresSlider') as HTMLInputElement;
  const maxMeasuresNumber = document.getElementById('maxMeasuresNumber') as HTMLInputElement;
  const maxMeasuresValue = document.getElementById('maxMeasuresValue') as HTMLSpanElement;
  const btnCancelSettings = document.getElementById('btnCancelSettings') as HTMLButtonElement;
  const btnConfirmSettings = document.getElementById('btnConfirmSettings') as HTMLButtonElement;
  const status = document.getElementById('status') as HTMLDivElement;

  if (!settingsModal) return;

  function syncLineHeight(val: string | number) {
    let v = Math.max(40, Math.min(150, parseInt(String(val)) || 81));
    lineHeightSlider.value = String(v);
    lineHeightNumber.value = String(v);
    lineHeightValue.textContent = v + 'px';
  }

  function syncMaxMeasures(val: string | number) {
    let v = Math.max(2, Math.min(20, parseInt(String(val)) || 4));
    maxMeasuresSlider.value = String(v);
    maxMeasuresNumber.value = String(v);
    maxMeasuresValue.textContent = String(v);
  }

  syncLineHeight(appConfig.lineHeight);
  enableMaxMeasures.checked = appConfig.enableMaxMeasures;
  maxMeasuresSlider.value = String(appConfig.maxMeasuresPerLine || 4);
  maxMeasuresNumber.value = String(appConfig.maxMeasuresPerLine || 4);
  maxMeasuresSlider.disabled = !appConfig.enableMaxMeasures;
  maxMeasuresNumber.disabled = !appConfig.enableMaxMeasures;
  maxMeasuresValue.textContent = appConfig.enableMaxMeasures ? String(appConfig.maxMeasuresPerLine || 4) : '自动';

  document.getElementById('btnSettings')!.addEventListener('click', () => {
    settingsModal.classList.add('active');
  });

  btnCancelSettings.addEventListener('click', () => {
    settingsModal.classList.remove('active');
  });
  settingsModal.addEventListener('click', (e: MouseEvent) => {
    if (e.target === settingsModal) settingsModal.classList.remove('active');
  });

  lineHeightSlider.addEventListener('input', (e: Event) => {
    syncLineHeight((e.target as HTMLInputElement).value);
  });

  lineHeightNumber.addEventListener('input', (e: Event) => {
    const raw = (e.target as HTMLInputElement).value;
    const val = parseInt(raw);
    if (!isNaN(val) && raw.trim() !== '') {
      lineHeightSlider.value = String(val);
      lineHeightValue.textContent = val + 'px';
    }
  });
  lineHeightNumber.addEventListener('change', (e: Event) => {
    syncLineHeight((e.target as HTMLInputElement).value);
  });

  enableMaxMeasures.addEventListener('change', (e: Event) => {
    const checked = (e.target as HTMLInputElement).checked;
    maxMeasuresSlider.disabled = !checked;
    maxMeasuresNumber.disabled = !checked;
    maxMeasuresValue.textContent = checked ? maxMeasuresSlider.value : '自动';
  });

  maxMeasuresSlider.addEventListener('input', (e: Event) => {
    if (enableMaxMeasures.checked) {
      syncMaxMeasures((e.target as HTMLInputElement).value);
    }
  });

  maxMeasuresNumber.addEventListener('input', (e: Event) => {
    if (!enableMaxMeasures.checked) return;
    const raw = (e.target as HTMLInputElement).value;
    const val = parseInt(raw);
    if (!isNaN(val) && raw.trim() !== '') {
      maxMeasuresSlider.value = String(val);
      maxMeasuresValue.textContent = String(val);
    }
  });
  maxMeasuresNumber.addEventListener('change', (e: Event) => {
    if (enableMaxMeasures.checked) {
      syncMaxMeasures((e.target as HTMLInputElement).value);
    }
  });

  document.getElementById('btnResetSettings')!.addEventListener('click', () => {
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

    applySettings();
    onRender();

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

    applySettings();
    onRender();

    settingsModal.classList.remove('active');
    status.textContent = '设置已应用';
    setTimeout(() => {
      if (status.textContent === '设置已应用') status.textContent = '就绪';
    }, 2000);
  });
}
