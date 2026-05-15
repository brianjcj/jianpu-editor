import type { JianPuRenderer } from '../renderer';

export function initEditorSync(options: {
  canvas: HTMLCanvasElement;
  renderer: JianPuRenderer;
  editor: HTMLTextAreaElement;
}) {
  const { canvas, renderer, editor } = options;

  canvas.addEventListener('click', (e: MouseEvent) => {
    if (!renderer.clickMap || renderer.clickMap.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = (e.clientX - rect.left) * scaleX;
    const canvasY = (e.clientY - rect.top) * scaleY;
    const logicalX = canvasX / renderer.lastRenderScale;
    const logicalY = canvasY / renderer.lastRenderScale;

    let target = null;
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
      editor.style.transition = 'box-shadow 0.15s ease';
      editor.style.boxShadow = 'inset 0 0 0 2px var(--primary)';
      setTimeout(() => {
        editor.style.boxShadow = '';
      }, 600);
    }
  });
}
