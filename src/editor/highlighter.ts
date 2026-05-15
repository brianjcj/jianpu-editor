function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function highlightLine(line: string): string {
  // 整行指令（!标题 %调号 @速度 $空弦）
  const trimmed = line.trimStart();
  if (trimmed.startsWith('!') || trimmed.startsWith('%') || trimmed.startsWith('@') || trimmed.startsWith('$')) {
    return `<span class="hl-command">${escapeHtml(line)}</span>`;
  }

  let html = '';
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    // 行内注释
    if (ch === '#') {
      html += `<span class="hl-comment">${escapeHtml(line.slice(i))}</span>`;
      break;
    }

    // 小节线 / 反复号（优先匹配最长的）
    if (ch === '|' || ch === ':') {
      const ahead = line.slice(i);
      let matched = '';
      if (ahead.startsWith(':||:')) matched = ':||:';
      else if (ahead.startsWith(':||')) matched = ':||';
      else if (ahead.startsWith('||:')) matched = '||:';
      else if (ahead.startsWith('|:')) matched = '|:';
      else if (ahead.startsWith(':|')) matched = ':|';
      else if (ahead.startsWith('||')) matched = '||';
      else if (ch === '|') matched = '|';
      else if (ch === ':') matched = ':';

      if (matched) {
        html += `<span class="hl-barline">${escapeHtml(matched)}</span>`;
        i += matched.length;
        continue;
      }
    }

    // 跳房子 [1 [2 [3
    if (ch === '[' && /[123]/.test(line[i + 1] || '')) {
      html += `<span class="hl-barline">${escapeHtml(ch + line[i + 1])}</span>`;
      i += 2;
      continue;
    }

    // 跳房子结束
    if (ch === ']') {
      html += `<span class="hl-barline">${escapeHtml(ch)}</span>`;
      i++;
      continue;
    }

    // 三连音括号
    if (ch === '{' || ch === '}') {
      html += `<span class="hl-barline">${escapeHtml(ch)}</span>`;
      i++;
      continue;
    }

    // 数字音符 / 休止符 / 节拍
    if (/[0-7Xx]/.test(ch)) {
      html += `<span class="hl-digit">${escapeHtml(ch)}</span>`;
      i++;
      continue;
    }

    // 高音 ^  低音 _
    if (ch === '^' || ch === '_') {
      html += `<span class="hl-octave">${escapeHtml(ch)}</span>`;
      i++;
      continue;
    }

    // 升降号
    if (ch === '#' || ch === 'b') {
      html += `<span class="hl-accidental">${escapeHtml(ch)}</span>`;
      i++;
      continue;
    }

    // 附点
    if (ch === '.') {
      html += `<span class="hl-dot">${escapeHtml(ch)}</span>`;
      i++;
      continue;
    }

    // 增时线 / 休止符
    if (ch === '-') {
      html += `<span class="hl-keyword">${escapeHtml(ch)}</span>`;
      i++;
      continue;
    }

    // 下划线 / 等号（时值简写）
    if (ch === '/' || ch === '=') {
      html += `<span class="hl-keyword">${escapeHtml(ch)}</span>`;
      i++;
      continue;
    }

    // 连音线
    if (ch === '~') {
      html += `<span class="hl-keyword">${escapeHtml(ch)}</span>`;
      i++;
      continue;
    }

    // 演奏技法 / 滑音 / 框选
    if (ch === '弹' || ch === '挑' || ch === '滑' || ch === '框') {
      html += `<span class="hl-technique">${escapeHtml(ch)}</span>`;
      i++;
      continue;
    }

    // 倚音括号
    if (ch === '(' || ch === ')') {
      html += `<span class="hl-octave">${escapeHtml(ch)}</span>`;
      i++;
      continue;
    }

    // 默认：原样输出
    html += escapeHtml(ch);
    i++;
  }

  return html;
}

export function highlight(text: string): string {
  return text
    .split('\n')
    .map(highlightLine)
    .join('\n');
}

export function initHighlightSync(options: {
  editor: HTMLTextAreaElement;
  highlightEl: HTMLPreElement;
  codeEl: HTMLElement;
}) {
  const { editor, highlightEl, codeEl } = options;

  function update() {
    codeEl.innerHTML = highlight(editor.value) + '\n';
  }

  // 初始化时高亮一次
  update();

  // textarea 内容变化立即更新高亮（渲染走防抖，高亮不防抖）
  editor.addEventListener('input', update);

  // 滚动同步
  editor.addEventListener('scroll', () => {
    highlightEl.scrollTop = editor.scrollTop;
    highlightEl.scrollLeft = editor.scrollLeft;
  });

  return { update };
}
