export function initVirtualKeyboard(options: { editor: HTMLTextAreaElement }) {
  const { editor } = options;

  const fabToggle = document.getElementById('fabToggle') as HTMLButtonElement;
  const fabKeys = document.getElementById('fabKeys') as HTMLDivElement;
  const fabKeyboard = document.getElementById('fabKeyboard') as HTMLDivElement;

  fabKeyboard.addEventListener('pointerdown', (e: PointerEvent) => {
    e.preventDefault();
  });

  editor.addEventListener('focus', () => {
    fabKeyboard.classList.add('visible');
    syncFabKeyboardPosition();
  });

  editor.addEventListener('blur', () => {
    setTimeout(() => {
      if (!fabKeyboard.contains(document.activeElement)) {
        fabKeyboard.classList.remove('visible');
        fabKeys.classList.remove('open');
      }
    }, 150);
  });

  function syncFabKeyboardPosition() {
    const vv = window.visualViewport;
    if (!vv) return;
    const top = 16 + vv.offsetTop;
    fabKeyboard.style.top = top + 'px';
  }

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncFabKeyboardPosition);
    window.visualViewport.addEventListener('scroll', syncFabKeyboardPosition);
  }
  window.addEventListener('resize', syncFabKeyboardPosition);

  fabToggle.addEventListener('click', (e: MouseEvent) => {
    e.preventDefault();
    fabKeys.classList.toggle('open');
    editor.focus();
  });

  fabKeyboard.addEventListener('click', (e: MouseEvent) => {
    const key = (e.target as HTMLElement).closest('.fab-key') as HTMLElement | null;
    if (!key) return;

    e.preventDefault();
    const char = key.dataset.char as string;

    if (char === 'BACKSPACE') {
      const start = editor.selectionStart ?? 0;
      const end = editor.selectionEnd ?? 0;
      if (start > 0) {
        const text = editor.value;
        editor.value = text.slice(0, start - 1) + text.slice(end);
        editor.selectionStart = editor.selectionEnd = start - 1;
      }
    } else if (char === '框(') {
      const start = editor.selectionStart ?? 0;
      const end = editor.selectionEnd ?? 0;
      const text = editor.value;
      const selected = text.slice(start, end);
      if (selected.length > 0) {
        const replacement = '框(' + selected + ')';
        editor.value = text.slice(0, start) + replacement + text.slice(end);
        editor.selectionStart = editor.selectionEnd = start + replacement.length;
      } else {
        editor.value = text.slice(0, start) + '框()' + text.slice(end);
        editor.selectionStart = editor.selectionEnd = start + 2;
      }
    } else {
      const start = editor.selectionStart ?? 0;
      const end = editor.selectionEnd ?? 0;
      const text = editor.value;
      editor.value = text.slice(0, start) + char + text.slice(end);
      editor.selectionStart = editor.selectionEnd = start + char.length;
    }

    editor.dispatchEvent(new Event('input'));
    editor.focus();
  });
}
