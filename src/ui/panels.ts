export function initPanels(options: { onRender: () => void }) {
  const { onRender } = options;

  const panelStates = {
    editor: true,
    syntax: false,
    preview: true,
  };

  const syntaxModal = document.getElementById('syntaxModal') as HTMLDivElement;
  const btnCloseSyntaxModal = document.getElementById('btnCloseSyntaxModal') as HTMLButtonElement;

  function openSyntaxModal() {
    syntaxModal.classList.add('active');
  }

  function closeSyntaxModal() {
    syntaxModal.classList.remove('active');
    panelStates.syntax = false;
    document.getElementById('toggleSyntax')!.classList.remove('active');
  }

  btnCloseSyntaxModal.addEventListener('click', closeSyntaxModal);
  syntaxModal.addEventListener('click', (e: MouseEvent) => {
    if (e.target === syntaxModal) closeSyntaxModal();
  });

  function updatePanelVisibility() {
    const editorPanel = document.querySelector('.editor-panel') as HTMLDivElement;
    const previewPanel = document.querySelector('.preview-panel') as HTMLDivElement;
    const main = document.querySelector('.main') as HTMLDivElement;

    if (panelStates.editor) {
      editorPanel.classList.remove('panel-hidden');
      document.getElementById('toggleEditor')!.classList.add('active');
    } else {
      editorPanel.classList.add('panel-hidden');
      document.getElementById('toggleEditor')!.classList.remove('active');
    }

    if (panelStates.syntax) {
      openSyntaxModal();
      document.getElementById('toggleSyntax')!.classList.add('active');
    } else {
      document.getElementById('toggleSyntax')!.classList.remove('active');
    }

    if (panelStates.preview) {
      previewPanel.classList.remove('panel-hidden');
      document.getElementById('togglePreview')!.classList.add('active');
    } else {
      previewPanel.classList.add('panel-hidden');
      document.getElementById('togglePreview')!.classList.remove('active');
    }

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

    setTimeout(() => onRender(), 100);
  }

  document.getElementById('toggleEditor')!.addEventListener('click', () => {
    panelStates.editor = !panelStates.editor;
    updatePanelVisibility();
  });

  document.getElementById('toggleSyntax')!.addEventListener('click', () => {
    panelStates.syntax = !panelStates.syntax;
    updatePanelVisibility();
  });

  document.getElementById('togglePreview')!.addEventListener('click', () => {
    panelStates.preview = !panelStates.preview;
    updatePanelVisibility();
  });
}
