import { NOTE_FREQUENCIES, TECHNIQUES } from './constants';
import { state } from './state';
import { SVGContext } from './svg-context';
import type {
  ParseResult,
  RenderOptions,
  ClickMapItem,
  NotePosition,
  NoteGroup,
  Token,
  PlaybackNote,
  GlobalSettings,
} from './types';

export class JianPuRenderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  config: Record<string, unknown>;
  clickMap: ClickMapItem[];
  lastRenderScale: number;

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    this.config = {
      noteSize: 28,
      lineHeight: 81,
      measureGap: 40,
      noteGap: 36,
      marginX: 60,
      marginY: 80,
      titleSize: 28,
      subtitleSize: 14,
      dotRadius: 3,
      underlineHeight: 3,
      barlineWidth: 2,
      maxMeasuresPerLine: null,
    };
    this.clickMap = [];
    this.lastRenderScale = 1.5;
    this.setCanvas(canvas, ctx);
  }

  setCanvas(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;
  }

  _textWidth(ctx, text) {
    if (ctx.measureText) return ctx.measureText(text).width;
    return 0;
  }

  renderKeyHeader(ctx: any, settings: GlobalSettings, x: number, y: number) {
    const hasOpenStrings = settings.openStrings && settings.openStrings.length > 0;
    const keyStr = `1=${settings.key}`;
    const timeStr = ` ${settings.timeSignature[0]}/${settings.timeSignature[1]}拍  ♩=${settings.bpm}`;

    ctx.font = `12px "Segoe UI", "PingFang SC", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#555';

    let currentX = x;

    // "1=C"
    ctx.fillText(keyStr, currentX, y);
    currentX += this._textWidth(ctx, keyStr) + 2;

    if (hasOpenStrings) {
      ctx.fillText(' (', currentX, y);
      currentX += this._textWidth(ctx, ' (');

      const noteSize = 11;
      for (let i = 0; i < settings.openStrings.length; i++) {
        const os = settings.openStrings[i];
        const nx = currentX + noteSize / 2;

        if (ctx.save) ctx.save();

        ctx.font = `bold ${noteSize}px "Segoe UI", "PingFang SC", sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#555';

        // 升降号
        if (os.accidental) {
          ctx.font = `${noteSize * 0.7}px "Segoe UI", sans-serif`;
          ctx.fillText(os.accidental === '#' ? '♯' : '♭', nx - noteSize * 0.45, y);
          ctx.font = `bold ${noteSize}px "Segoe UI", "PingFang SC", sans-serif`;
        }

        // 数字
        ctx.fillText(os.digit, nx, y);

        // 低音点
        if (os.octave < 0) {
          for (let j = 0; j < Math.abs(os.octave); j++) {
            ctx.beginPath();
            ctx.arc(nx, y + noteSize * 0.75 + j * 7, 1.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        // 高音点
        if (os.octave > 0) {
          for (let j = 0; j < os.octave; j++) {
            ctx.beginPath();
            ctx.arc(nx, y - noteSize * 0.75 - j * 7, 1.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        if (ctx.restore) ctx.restore();
        currentX += noteSize + 3;
      }

      ctx.font = `12px "Segoe UI", "PingFang SC", sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(')', currentX, y);
      currentX += this._textWidth(ctx, ')');
    }

    // " 4/4拍  ♩=100"
    ctx.fillText(timeStr, currentX, y);
  }

  render(data: ParseResult, options: RenderOptions = {}) {
    let canvas = this.canvas;
    let ctx = this.ctx;
    const { measures, flatMeasures, settings } = data;
    this.clickMap = [];
    if (measures.length === 0) {
      this.renderEmpty(options);
      return;
    }

    // 先计算播放时间戳（供渲染时使用）
    this.collectPlaybackNotes(flatMeasures || measures, settings);

    const A4_WIDTH = 720;
    const A4_HEIGHT = 1050;
    const MARGIN_X = 40;
    const MARGIN_Y = 50;

    const beatsPerLine = 16;
    const lines = this.layoutMeasures(measures, beatsPerLine, this.config.maxMeasuresPerLine);

    const lineHasLabel: boolean[] = lines.map(lineMeasures =>
      lineMeasures.some(measure => measure.notes.some(note => note.note))
    );

    const lineHeight = (this.config.lineHeight as number) || 81;
    const labelExtraHeight = 18;
    const titleHeight = settings.title ? 40 : 0;
    let totalHeight = MARGIN_Y * 2 + titleHeight + 20;
    for (let i = 0; i < lines.length; i++) {
      totalHeight += lineHeight + ((lineHasLabel[i] as any) ? labelExtraHeight : 0);
    }

    const renderScale = options.scale || 1.5;
    this.lastRenderScale = renderScale;
    const pageInfo = options.pageInfo || null;

    const pageHeight =
      pageInfo && pageInfo.actualHeight ? pageInfo.actualHeight : pageInfo ? A4_HEIGHT : Math.max(totalHeight, 400);
    canvas.width = Math.round(A4_WIDTH * renderScale);
    canvas.height = Math.round(pageHeight * renderScale);
    if (!pageInfo) {
      canvas.style.width = '100%';
      canvas.style.maxWidth = A4_WIDTH + 'px';
      canvas.style.height = 'auto';
    }
    // 设置 width/height 会重置 canvas 上下文，必须重新获取 ctx
    ctx = canvas.getContext('2d');
    ctx.scale(renderScale, renderScale);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, A4_WIDTH, pageHeight);

    let y = MARGIN_Y;
    if (settings.title && (!pageInfo || pageInfo.pageIndex === 0)) {
      ctx.fillStyle = '#1a1a2e';
      ctx.font = `bold 22px "Segoe UI", "PingFang SC", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(settings.title, A4_WIDTH / 2, y);
      y += 35;
    }

    if (!pageInfo || pageInfo.pageIndex === 0) {
      ctx.fillStyle = '#555';
      this.renderKeyHeader(ctx, settings, MARGIN_X, y);
      y += lineHeight * 0.75;
    } else {
      y = MARGIN_Y;
    }

    let avgMeasureWidth = null;
    if (lines.length > 1) {
      let totalWidth = 0;
      let totalCount = 0;
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        const lineAvailableWidth = A4_WIDTH - MARGIN_X * 2;
        const perMeasureWidth = lineAvailableWidth / line.length;
        totalWidth += perMeasureWidth;
        totalCount += 1;
      }
      avgMeasureWidth = totalWidth / totalCount;
    }

    for (let i = 0; i < lines.length; i++) {
      if (pageInfo && !pageInfo.lineIndices.includes(i)) continue;
      const line = lines[i];
      const isLastLine = i === lines.length - 1;
      const useMaxWidth =
        isLastLine && avgMeasureWidth !== null && line.length < lines[0].length ? avgMeasureWidth * 1.2 : null;
      this.renderLine(ctx, line, MARGIN_X, y, A4_WIDTH - MARGIN_X * 2, useMaxWidth, settings.timeSignature);
      y += lineHeight + ((lineHasLabel[i] as any) ? labelExtraHeight : 0);
    }

    // 页码
    if (pageInfo && pageInfo.totalPages > 1) {
      ctx.fillStyle = '#999';
      ctx.font = `11px "Segoe UI", "PingFang SC", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`— ${pageInfo.pageIndex + 1} / ${pageInfo.totalPages} —`, A4_WIDTH / 2, pageHeight - 20);
    }

    state.bpm = settings.bpm;
    state.key = settings.key;
    state.timeSignature = settings.timeSignature;
  }

  computeLayout(data: ParseResult) {
    const { measures, settings } = data;
    if (measures.length === 0) return null;

    const A4_WIDTH = 720;
    const MARGIN_X = 40;
    const MARGIN_Y = 50;
    const beatsPerLine = 16;
    const lines = this.layoutMeasures(measures, beatsPerLine, this.config.maxMeasuresPerLine);

    const lineHasLabel: boolean[] = lines.map(lineMeasures =>
      lineMeasures.some(measure => measure.notes.some(note => note.note))
    );

    const lineHeight = (this.config.lineHeight as number) || 81;
    const labelExtraHeight = 18;
    const titleHeight = settings.title ? 40 : 0;
    let totalHeight = MARGIN_Y * 2 + titleHeight + 20;
    const lineHeights = [];
    for (let i = 0; i < lines.length; i++) {
      const h = lineHeight + ((lineHasLabel[i] as any) ? labelExtraHeight : 0);
      lineHeights.push(h);
      totalHeight += h;
    }

    return { measures, settings, lines, lineHasLabel, totalHeight, lineHeights };
  }

  layoutMeasures(measures, maxPerLine, maxMeasuresPerLine = null) {
    // 按小节总时值换行，每行最多容纳 maxPerLine 个"时值单位"
    // 一个四分音符 = 1 单位，这样每行宽度更均匀
    const lines = [];
    let currentLine = [];
    let currentUnits = 0;
    let inVolta = false;

    for (const measure of measures) {
      if (measure.voltaStart !== null) {
        inVolta = true;
      }

      // 计算小节的时值单位（基于实际时值，而不是音符数量）
      let measureUnits = 0;
      for (const note of measure.notes) {
        measureUnits += note.duration;
      }

      // 如果当前行已经有小节，且加入这个小节会超过限制，则换行
      // 但至少要放一个小节（避免空行）
      // 若正处于跳房子内部，则避免拆散跳房子
      if (currentLine.length > 0 && currentUnits + measureUnits > maxPerLine) {
        if (inVolta) {
          currentLine.push(measure);
          currentUnits += measureUnits;
        } else {
          lines.push(currentLine);
          currentLine = [measure];
          currentUnits = measureUnits;
        }
      } else {
        currentLine.push(measure);
        currentUnits += measureUnits;
      }

      if (measure.voltaEnd) {
        inVolta = false;
      }
    }

    if (currentLine.length > 0) {
      lines.push(currentLine);
    }

    // 如果设置了每行最大小节数，且自动布局超过了限制，则按小节数重新排版
    if (maxMeasuresPerLine && maxMeasuresPerLine > 0) {
      const maxMeasuresInAuto = Math.max(...lines.map(line => line.length));
      if (maxMeasuresInAuto > maxMeasuresPerLine) {
        const countLines = [];
        let countLine = [];
        for (const measure of measures) {
          if (countLine.length >= maxMeasuresPerLine) {
            countLines.push(countLine);
            countLine = [measure];
          } else {
            countLine.push(measure);
          }
        }
        if (countLine.length > 0) {
          countLines.push(countLine);
        }
        return countLines;
      }
    }

    return lines;
  }

  renderLine(ctx, lineMeasures, x, y, availableWidth, maxMeasureWidth = null, timeSignature = [4, 4]) {
    // 新布局策略：
    // 1. 计算每小节的总时值权重
    // 2. 按小节权重比例分配每小节的总宽度
    // 3. 小节内部再按音符权重分配位置
    // 这样同一个小节在不同行宽度一致，行与行对齐

    const REPEAT_END_EXTRA = 14; // 后反复号后的额外间距（像素）

    const measureWeights = [];
    let lineTotalWeight = 0;
    let totalExtra = 0;
    for (const measure of lineMeasures) {
      let mw = 0;
      for (const note of measure.notes) {
        mw += this.getNoteWeight(note);
      }
      measureWeights.push(mw);
      lineTotalWeight += mw;
      if (measure.repeatEnd) totalExtra += REPEAT_END_EXTRA;
    }

    const baseAvailable = Math.max(availableWidth - totalExtra, 1);

    // 计算每小节的分配宽度（按权重比例）
    const measureWidths = [];
    for (let i = 0; i < lineMeasures.length; i++) {
      const ratio = measureWeights[i] / lineTotalWeight;
      let width = baseAvailable * ratio;
      if (maxMeasureWidth !== null) {
        width = Math.min(width, maxMeasureWidth);
      }
      if (lineMeasures[i].repeatEnd) {
        width += REPEAT_END_EXTRA;
      }
      measureWidths.push(width);
    }

    // 渲染每小节
    let currentX = x;
    let voltaStartX = null;
    let voltaNumber = null;

    for (let m = 0; m < lineMeasures.length; m++) {
      const measure = lineMeasures[m];
      const measureWidth = measureWidths[m];
      const isLast = m === lineMeasures.length - 1;
      const measureStartX = currentX;

      // 前反复号（若前一小节有后反复号，则两者合并绘制，这里跳过）
      if (measure.repeatStart) {
        if (m === 0 || !lineMeasures[m - 1].repeatEnd) {
          this.drawRepeatStart(ctx, currentX, y);
        }
      }

      // 跳房子开始
      if (measure.voltaStart !== null && voltaStartX === null) {
        voltaStartX = currentX;
        voltaNumber = measure.voltaStart;
      }

      // 识别需要连线的音符组
      const noteGroups = this.groupShortNotes(measure.notes, timeSignature);

      // 计算小节内基础单位宽度（避免音符紧贴小节线）
      const measureWeight = measureWeights[m];
      // 若前一小节有后反复号，则本小节前反复号会被合并绘制，不必额外留宽
      const prevHasRepeatEnd = m > 0 && lineMeasures[m - 1].repeatEnd;
      const effectiveRepeatStart = measure.repeatStart && !prevHasRepeatEnd;
      // 后反复号的额外间距已通过 measureWidth 提供，不再从 noteAreaMargin 扣除
      const baseMeasureWidth = measureWidth - (measure.repeatEnd ? REPEAT_END_EXTRA : 0);
      const noteAreaMargin = effectiveRepeatStart ? 26 : 12;
      // 每行第一小节左侧不留间距（第一个音符左对齐），其他小节左右对称
      // 但如果第一小节有前反复号，则保留左侧间距，避免音符与反复号挤在一起
      const isFirstMeasure = m === 0;
      let leftMargin;
      if (isFirstMeasure && !effectiveRepeatStart) {
        leftMargin = 0;
      } else if (effectiveRepeatStart) {
        leftMargin = 18;
      } else if (prevHasRepeatEnd) {
        leftMargin = 12; // 后反复号/合并反复号后需要更大间距
      } else {
        leftMargin = noteAreaMargin / 2;
      }
      const unitWidth = (baseMeasureWidth - noteAreaMargin) / Math.max(measureWeight, 1);

      // 预计算每个音符的位置
      const notePositions = [];
      let tempX = currentX + leftMargin;
      const firstNoteSize = 20; // 与 renderNote 中的字号一致
      for (let i = 0; i < measure.notes.length; i++) {
        const note = measure.notes[i];
        const noteWidth = unitWidth * this.getNoteWeight(note);
        let noteX = tempX + noteWidth / 2;
        // 每行第一个小节第一个音符左对齐，消除左侧留白，使各行开头对齐
        // 但如果小节有前反复号，则不做此处理，以免音符与反复号重叠
        if (m === 0 && i === 0 && noteWidth >= firstNoteSize && !effectiveRepeatStart) {
          noteX = tempX + firstNoteSize / 2;
        }
        notePositions.push({
          x: noteX,
          width: noteWidth,
          left: tempX,
          right: tempX + noteWidth,
          sourceStart: note.sourceStart,
          sourceEnd: note.sourceEnd,
        });
        tempX += noteWidth;
      }

      // 记录小节级点击映射
      if (measure.notes.length > 0) {
        this.clickMap.push({
          type: 'measure',
          x: measureStartX,
          y: y - 30,
          width: measureWidth,
          height: 70,
          sourceStart: measure.sourceStart,
          sourceEnd: measure.sourceEnd,
        });
      }

      // 渲染小节内音符
      for (let i = 0; i < measure.notes.length; i++) {
        const note = measure.notes[i];
        const pos = notePositions[i];

        // 画连音（三连音等）弧线
        if (note.tuplet && note.tuplet.index === 0) {
          const endIdx = i + note.tuplet.count - 1;
          if (endIdx < notePositions.length) {
            let maxOctave = 0;
            for (let t = i; t <= endIdx; t++) {
              if (measure.notes[t].octave > maxOctave) maxOctave = measure.notes[t].octave;
            }
            this.renderTupletBracket(ctx, pos, notePositions[endIdx], y, note.tuplet.number, maxOctave);
          }
        }

        const group = noteGroups.find(g => g.indices.includes(i));
        // 记录音符级点击映射
        if (note.sourceStart !== undefined && note.sourceEnd !== undefined) {
          this.clickMap.push({
            type: 'note',
            x: pos.left,
            y: y - 28,
            width: pos.width,
            height: 60,
            sourceStart: note.sourceStart,
            sourceEnd: note.sourceEnd,
          });
        }
        if (note.type === 'note' || note.type === 'beat') {
          this.renderNote(ctx, note, pos.x, y, group, notePositions, i);
          // 如果前面有倚音，在这里渲染所有连续倚音（依附于当前主音）
          let graceCount = 0;
          for (let j = i - 1; j >= 0 && measure.notes[j].type === 'grace'; j--) {
            graceCount++;
          }
          if (graceCount > 0) {
            const gSize = 14;
            const graceNotes = [];
            const graceXs = [];
            for (let k = 0; k < graceCount; k++) {
              const graceIndex = i - graceCount + k;
              graceNotes.push(measure.notes[graceIndex]);
              graceXs.push(pos.x - (graceCount - k) * gSize * 0.9);
            }
            this.renderGraceGroup(ctx, graceNotes, graceXs, y, pos.x);
          }
        } else if (note.type === 'rest') {
          this.renderRest(ctx, note, pos.x, y, pos.width, group);
        } else if (note.type === 'grace') {
          // 倚音本身不在这里渲染，而是在下一个主音位置渲染
          // 但如果倚音在最后一个位置（没有后续主音），则独立渲染
          if (i === measure.notes.length - 1) {
            // 收集所有尾部连续的倚音
            let tailStart = i;
            while (tailStart >= 0 && measure.notes[tailStart].type === 'grace') tailStart--;
            tailStart++;
            const tailCount = i - tailStart + 1;
            const gSize = 14;
            const graceNotes = [];
            const graceXs = [];
            for (let k = 0; k < tailCount; k++) {
              const graceIndex = tailStart + k;
              graceNotes.push(measure.notes[graceIndex]);
              graceXs.push(pos.x - (tailCount - k) * gSize * 0.9);
            }
            this.renderGraceGroup(ctx, graceNotes, graceXs, y);
          }
        }
      }

      // 画组间连线下划线
      for (const group of noteGroups) {
        if (group.indices.length >= 2) {
          this.renderGroupBeams(ctx, measure.notes, notePositions, group, y);
        }
      }

      // 画连音线（tie）——连接当前音符和下一个同音高音符
      for (let i = 0; i < measure.notes.length - 1; i++) {
        const note = measure.notes[i];
        const nextNote = measure.notes[i + 1];
        if (
          (note.type === 'note' || note.type === 'beat') &&
          (nextNote.type === 'note' || nextNote.type === 'beat') &&
          note.isTie &&
          note.digit === nextNote.digit &&
          note.octave === nextNote.octave
        ) {
          this.renderTie(ctx, notePositions[i], notePositions[i + 1], y, Math.max(note.octave, nextNote.octave));
        }
      }

      // 更新 currentX 到小节末尾
      currentX += measureWidth;

      // 反复标记与结束线
      if (measure.repeatEnd) {
        const nextHasStart = m + 1 < lineMeasures.length && lineMeasures[m + 1].repeatStart;
        // 统一向左偏移 5px，让粗线/最右端对齐 currentX（行尾对齐）
        if (nextHasStart) {
          this.drawRepeatBoth(ctx, currentX - 5, y, measure.isDouble && isLast);
        } else {
          this.drawRepeatEnd(ctx, currentX - 5, y, measure.isDouble && isLast);
        }
      } else if (measure.isDouble && isLast) {
        // 终止双竖线（两条竖线：细线+粗线）
        ctx.strokeStyle = '#1a1a2e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(currentX, y - 20);
        ctx.lineTo(currentX, y + 23);
        ctx.stroke();

        // 粗线
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(currentX + 5, y - 20);
        ctx.lineTo(currentX + 5, y + 23);
        ctx.stroke();
      } else {
        // 普通小节线
        ctx.strokeStyle = '#1a1a2e';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(currentX, y - 20);
        ctx.lineTo(currentX, y + 23);
        ctx.stroke();
      }

      // 跳房子结束
      if (measure.voltaEnd && voltaStartX !== null) {
        // 有后反复号时，跳房子线对齐到后反复号的细线位置
        let voltaEndX = measure.repeatEnd ? currentX - 5 : currentX;
        // 若同时是终止线（isDouble），跳房子线应延伸到最外侧粗线/第三条线
        if (measure.isDouble && isLast) {
          voltaEndX = currentX + 5;
        }
        this.drawVoltaBracket(ctx, voltaStartX, voltaEndX, y, voltaNumber);
        voltaStartX = null;
        voltaNumber = null;
      }

      // 框选手绘标注
      this.renderBoxes(ctx, measure, notePositions, y);

      // 流程控制文字标记
      this.drawFlowMark(ctx, measure, measureStartX, y, measureWidth);
    }
  }

  getNoteWeight(note) {
    if (note.type === 'grace') return 0.3; // 倚音占很小宽度
    if (note.type === 'rest') return note.duration;
    // 连音（三连音等）成员按实际时值精确计算宽度
    if (note.tuplet) return note.duration;
    // duration >= 1 是四分或更长
    if (note.duration >= 1) return 1;
    if (note.duration >= 0.5) return 0.7; // 八分音符组占 0.7 宽度
    if (note.duration >= 0.25) return 0.5; // 十六分音符组占 0.5 宽度
    return 0.4; // 三十二分
  }

  groupShortNotes(notes, timeSignature = [4, 4]) {
    // 将相邻的短音符分组，用于连线下划线
    // 规则：
    //   - x/4 拍号：按每个四分音符（1拍）为一组，不跨拍
    //   - 6/8 拍号：每 3 个八分音符（1.5拍）为一组
    //   - 休止符也参与分组（只打断无下划线的长音符）
    const [beats, beatUnit] = timeSignature;
    let groupDuration = 1; // 默认四分音符为单位
    if (beatUnit === 8 && beats % 3 === 0) {
      groupDuration = 1.5; // 复拍子（6/8、9/8 等）每大组 3 个八分音符
    }

    const groups = [];
    let currentGroup = null;
    let accumulated = 0; // 当前在分组周期内的累积时值

    const nearBoundary = val => {
      const mod = val % groupDuration;
      return mod < 0.001 || mod > groupDuration - 0.001;
    };

    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      const dur = note.duration || 0;

      // 倚音不参与普通音符的连音分组
      if (note.type === 'grace') {
        continue;
      }

      if (note.underlines > 0) {
        // 如果连音组兼容性不同，也要断开
        if (currentGroup && !this.isCompatible(currentGroup, note)) {
          groups.push(currentGroup);
          currentGroup = null;
        }

        // 若当前累积时值正好落在分组边界上，结束旧组
        if (currentGroup && nearBoundary(accumulated)) {
          groups.push(currentGroup);
          currentGroup = null;
        }

        // 开始新组（如果需要）
        if (!currentGroup) {
          currentGroup = {
            indices: [i],
            notes: [note],
            underlines: note.underlines,
          };
        } else {
          currentGroup.indices.push(i);
          currentGroup.notes.push(note);
        }

        accumulated += dur;

        // 若加完后正好落在边界，结束当前组，让下一个下划线音符开新组
        if (nearBoundary(accumulated)) {
          groups.push(currentGroup);
          currentGroup = null;
        }
      } else {
        // 无下划线的音符（四分、二分、全音符等）打断分组
        if (currentGroup) {
          groups.push(currentGroup);
          currentGroup = null;
        }
        accumulated += dur;
        // 边界对齐：如果 accumulated 跨过整数倍 groupDuration，取模
        const periods = Math.round(accumulated / groupDuration);
        const target = periods * groupDuration;
        if (Math.abs(accumulated - target) < 0.001) {
          accumulated = target;
        }
      }
    }

    if (currentGroup) groups.push(currentGroup);
    return groups;
  }

  isCompatible(group, note) {
    // 兼容性检查：连音组内外的音符不能混组
    const lastNote = group.notes[group.notes.length - 1];
    if (lastNote.tuplet || note.tuplet) {
      const a = lastNote.tuplet ? lastNote.tuplet.groupId : null;
      const b = note.tuplet ? note.tuplet.groupId : null;
      return a === b;
    }
    return true;
  }

  isNoteActive(note: any) {
    if (!state.isPlaying || !note._playbackTimes) return false;
    const t = state.playbackCurrentTime;
    return note._playbackTimes.some(pt => t >= pt.startTime && t < pt.startTime + pt.duration);
  }

  renderNote(
    ctx: CanvasRenderingContext2D | SVGContext,
    note: any,
    x: number,
    y: number,
    group: NoteGroup | undefined,
    notePositions: NotePosition[],
    noteIdx: number
  ) {
    const size = 20; // 缩小字号适配 A4
    const dotRadius = 2;

    const isActive = this.isNoteActive(note);
    const color = isActive ? '#ef4444' : '#1a1a2e';

    ctx.fillStyle = color;
    ctx.font = `bold ${size}px "Segoe UI", "PingFang SC", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 所有音符统一基线，不根据高低音偏移
    const noteY = y;

    // 升降号
    let xOffset = 0;
    if (note.accidental) {
      ctx.font = `${size * 0.7}px "Segoe UI", sans-serif`;
      ctx.fillText(note.accidental === '#' ? '♯' : '♭', x - size * 0.5, noteY);
      xOffset = size * 0.2;
    }

    // 数字
    ctx.font = `bold ${size}px "Segoe UI", "PingFang SC", sans-serif`;
    ctx.fillText(note.digit, x + xOffset, noteY);

    // 高音点（上方）—— 基于统一基线向上画，距离加大
    if (note.octave > 0) {
      for (let i = 0; i < note.octave; i++) {
        ctx.beginPath();
        ctx.arc(x + xOffset, noteY - size * 0.75 - i * 10, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 演奏技法符号（弹 \，挑 /）
    if (note.technique && TECHNIQUES[note.technique]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      const techY = note.octave > 0 ? noteY - size * 0.75 - (note.octave - 1) * 10 - 14 : noteY - size * 0.65 - 10;
      const techSize = size * 0.26;
      if (note.technique === '弹') {
        ctx.beginPath();
        ctx.moveTo(x + xOffset - techSize, techY - techSize);
        ctx.lineTo(x + xOffset + techSize, techY + techSize);
        ctx.stroke();
      } else if (note.technique === '挑') {
        ctx.beginPath();
        ctx.moveTo(x + xOffset - techSize, techY + techSize);
        ctx.lineTo(x + xOffset + techSize, techY - techSize);
        ctx.stroke();
      }
    }

    // 附点
    if (note.hasDot) {
      ctx.beginPath();
      ctx.arc(x + size * 0.5 + xOffset, noteY + 1, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    // 单音符的下划线（不在组内的，或组内只有一个音符的）
    if (note.underlines > 0 && (!group || group.indices.length === 1)) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      const lineY = noteY + size * 0.4 + 4;
      const lineWidth = size * 0.567; // 覆盖音符宽度的70%

      for (let i = 0; i < note.underlines; i++) {
        ctx.beginPath();
        ctx.moveTo(x - lineWidth / 2 + xOffset, lineY + i * 5);
        ctx.lineTo(x + lineWidth / 2 + xOffset, lineY + i * 5);
        ctx.stroke();
      }
    }

    // 低音点（下方）—— 画在最下面下划线的下面
    if (note.octave < 0) {
      let lowerDotBaseY;
      if (note.underlines > 0) {
        lowerDotBaseY = noteY + size * 0.4 + 4 + (note.underlines - 1) * 5 + 8;
      } else {
        lowerDotBaseY = noteY + size * 0.75;
      }
      for (let i = 0; i < Math.abs(note.octave); i++) {
        ctx.beginPath();
        ctx.arc(x + xOffset, lowerDotBaseY + i * 10, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 滑音：起始音小字在目标音偏左上方，下划线延长带箭头
    if (note.slideFrom) {
      const slideSize = 13;
      const slideDigit = note.slideFrom.digit;
      const slideOctave = note.slideFrom.octave || 0;
      const slideAccidental = note.slideFrom.accidental || '';

      // 起始音在目标音偏左上方
      const slideX = x + xOffset - 6;
      const slideY = noteY - 20;

      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 起始音升降号
      let slideOffset = 0;
      if (slideAccidental) {
        ctx.font = `${slideSize * 0.7}px "Segoe UI", sans-serif`;
        ctx.fillText(slideAccidental === '#' ? '♯' : '♭', slideX - slideSize * 0.5, slideY);
        slideOffset = slideSize * 0.2;
      }

      // 起始音数字
      ctx.font = `bold ${slideSize}px "Segoe UI", "PingFang SC", sans-serif`;
      ctx.fillText(slideDigit, slideX + slideOffset, slideY);

      // 起始音高音点
      if (slideOctave > 0) {
        for (let i = 0; i < slideOctave; i++) {
          ctx.beginPath();
          ctx.arc(slideX + slideOffset, slideY - slideSize * 0.75 - i * 7, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 起始音低音点
      if (slideOctave < 0) {
        for (let i = 0; i < Math.abs(slideOctave); i++) {
          ctx.beginPath();
          ctx.arc(slideX + slideOffset, slideY + slideSize * 0.75 + i * 7, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 箭头线：尾部固定，向右延伸到目标音右边界
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      const lineY = slideY + slideSize * 0.5 + 2;
      const tailX = x + xOffset - 10;
      const headX = x + xOffset + size * 0.4;

      ctx.beginPath();
      ctx.moveTo(tailX, lineY);
      ctx.lineTo(headX, lineY);
      ctx.stroke();

      // 箭头头（只有上半部分）
      const headLen = 5;
      ctx.beginPath();
      ctx.moveTo(headX, lineY);
      ctx.lineTo(headX - headLen, lineY - headLen * 0.6);
      ctx.stroke();
    }

    // 标注
    if (note.note) {
      const labelSize = 13;
      let labelY = y + size * 0.5 + 3;
      if (note.underlines > 0) {
        labelY = Math.max(labelY, y + size * 0.4 + 4 + (note.underlines - 1) * 5 + 5);
      }
      if (note.octave < 0) {
        const dotBase = note.underlines > 0 ? y + size * 0.4 + 4 + (note.underlines - 1) * 5 + 8 : y + size * 0.75;
        labelY = Math.max(labelY, dotBase + (Math.abs(note.octave) - 1) * 10 + 8);
      }
      if (note.isTie) {
        labelY = Math.max(labelY, y + size * 0.5 + 5 + 5);
      }
      ctx.fillStyle = '#64748b';
      ctx.font = `${labelSize}px "Segoe UI", "PingFang SC", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(note.note, x + xOffset, labelY);
    }
  }

  renderGraceNote(ctx, note, x, y, mainNoteX) {
    const size = 14; // 小字号
    const dotRadius = 2;

    ctx.fillStyle = '#1a1a2e';
    ctx.font = `bold ${size}px "Segoe UI", "PingFang SC", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 倚音在主音左上方
    const graceX = x - size * 0.8;
    const graceY = y - size * 1.2;

    // 升降号
    let xOffset = 0;
    if (note.accidental) {
      ctx.font = `${size * 0.7}px "Segoe UI", sans-serif`;
      ctx.fillText(note.accidental === '#' ? '♯' : '♭', graceX - size * 0.5, graceY);
      xOffset = size * 0.2;
    }

    // 数字
    ctx.font = `bold ${size}px "Segoe UI", "PingFang SC", sans-serif`;
    ctx.fillText(note.digit, graceX + xOffset, graceY);

    // 高音点
    if (note.octave > 0) {
      for (let i = 0; i < note.octave; i++) {
        ctx.beginPath();
        ctx.arc(graceX + xOffset, graceY - size * 0.75 - i * 7, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 演奏技法符号
    if (note.technique && TECHNIQUES[note.technique]) {
      ctx.strokeStyle = '#1a1a2e';
      ctx.lineWidth = 1.2;
      const techY = note.octave > 0 ? graceY - size * 0.75 - (note.octave - 1) * 7 - 10 : graceY - size * 0.6 - 8;
      const techSize = size * 0.22;
      if (note.technique === '弹') {
        ctx.beginPath();
        ctx.moveTo(graceX + xOffset - techSize, techY - techSize);
        ctx.lineTo(graceX + xOffset + techSize, techY + techSize);
        ctx.stroke();
      } else if (note.technique === '挑') {
        ctx.beginPath();
        ctx.moveTo(graceX + xOffset - techSize, techY + techSize);
        ctx.lineTo(graceX + xOffset + techSize, techY - techSize);
        ctx.stroke();
      }
    }

    // 下划线（八分/十六分音符）
    if (note.underlines > 0) {
      ctx.strokeStyle = '#1a1a2e';
      ctx.lineWidth = 1.2;
      const lineY = graceY + size * 0.4 + 2;
      const lineWidth = size * 0.486;

      for (let i = 0; i < note.underlines; i++) {
        ctx.beginPath();
        ctx.moveTo(graceX + xOffset - lineWidth / 2, lineY + i * 3);
        ctx.lineTo(graceX + xOffset + lineWidth / 2, lineY + i * 3);
        ctx.stroke();
      }
    }

    // 低音点——画在最下面下划线的下面
    if (note.octave < 0) {
      let lowerDotBaseY;
      if (note.underlines > 0) {
        lowerDotBaseY = graceY + size * 0.4 + 2 + (note.underlines - 1) * 3 + 6;
      } else {
        lowerDotBaseY = graceY + size * 0.75;
      }
      for (let i = 0; i < Math.abs(note.octave); i++) {
        ctx.beginPath();
        ctx.arc(graceX + xOffset, lowerDotBaseY + i * 7, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 倚音连接线：从倚音下方垂直向下，再水平向右连到主音符头部
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 1.2;
    const lineStartX = graceX + xOffset;
    const lineStartY = graceY + size * 0.5;
    const lineEndY = y; // 连到主音符头部
    const r = 3; // 拐角圆弧半径
    ctx.beginPath();
    ctx.moveTo(lineStartX, lineStartY);
    ctx.lineTo(lineStartX, lineEndY + r);
    ctx.arc(lineStartX + r, lineEndY + r, r, Math.PI, Math.PI * 1.5, true);
    ctx.lineTo(mainNoteX || x, lineEndY);
    ctx.stroke();
  }

  renderGraceGroup(ctx, notes, xs, y, mainNoteX?: number) {
    const size = 14;
    const dotRadius = 2;

    const groupActive = state.isPlaying && notes.some(n => this.isNoteActive(n));

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const graceY = y - size * 1.2;

    for (let idx = 0; idx < notes.length; idx++) {
      const note = notes[idx];
      const isActive = this.isNoteActive(note);
      const color = isActive ? '#ef4444' : '#1a1a2e';
      ctx.fillStyle = color;
      const graceX = xs[idx] - size * 0.8;
      let xOffset = 0;

      if (note.accidental) {
        ctx.font = `${size * 0.7}px "Segoe UI", sans-serif`;
        ctx.fillText(note.accidental === '#' ? '♯' : '♭', graceX - size * 0.5, graceY);
        xOffset = size * 0.2;
      }

      ctx.font = `bold ${size}px "Segoe UI", "PingFang SC", sans-serif`;
      ctx.fillText(note.digit, graceX + xOffset, graceY);

      if (note.octave > 0) {
        for (let i = 0; i < note.octave; i++) {
          ctx.beginPath();
          ctx.arc(graceX + xOffset, graceY - size * 0.75 - i * 7, dotRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 演奏技法符号
      if (note.technique && TECHNIQUES[note.technique]) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        const techY = note.octave > 0 ? graceY - size * 0.75 - (note.octave - 1) * 7 - 10 : graceY - size * 0.6 - 8;
        const techSize = size * 0.22;
        if (note.technique === '弹') {
          ctx.beginPath();
          ctx.moveTo(graceX + xOffset - techSize, techY - techSize);
          ctx.lineTo(graceX + xOffset + techSize, techY + techSize);
          ctx.stroke();
        } else if (note.technique === '挑') {
          ctx.beginPath();
          ctx.moveTo(graceX + xOffset - techSize, techY + techSize);
          ctx.lineTo(graceX + xOffset + techSize, techY - techSize);
          ctx.stroke();
        }
      }
    }

    if (notes.some(n => n.underlines > 0)) {
      ctx.strokeStyle = groupActive ? '#ef4444' : '#1a1a2e';
      ctx.lineWidth = 1.2;
      const baseLineY = graceY + size * 0.4 + 2;
      const lineSpacing = 3;

      for (let line = 0; line < 3; line++) {
        const required = line + 1;
        let segStart = -1;
        for (let idx = 0; idx <= notes.length; idx++) {
          const hasLine = idx < notes.length && notes[idx].underlines >= required;
          if (hasLine && segStart === -1) {
            segStart = idx;
          } else if ((!hasLine || idx === notes.length) && segStart !== -1) {
            const segEnd = idx - 1;
            const startX = xs[segStart] - size * 0.8;
            const endX = xs[segEnd] - size * 0.8;
            const lineY = baseLineY + line * lineSpacing;
            ctx.beginPath();
            ctx.moveTo(startX - size * 0.243, lineY);
            ctx.lineTo(endX + size * 0.243, lineY);
            ctx.stroke();
            segStart = -1;
          }
        }
      }
    }

    // 低音点——画在最下面下划线的下面
    for (let idx = 0; idx < notes.length; idx++) {
      const note = notes[idx];
      if (note.octave < 0) {
        const isActive = this.isNoteActive(note);
        ctx.fillStyle = isActive ? '#ef4444' : '#1a1a2e';
        const graceX = xs[idx] - size * 0.8;
        let xOffset = note.accidental ? size * 0.2 : 0;
        let lowerDotBaseY;
        if (note.underlines > 0) {
          lowerDotBaseY = graceY + size * 0.4 + 2 + (note.underlines - 1) * 3 + 6;
        } else {
          lowerDotBaseY = graceY + size * 0.75;
        }
        for (let i = 0; i < Math.abs(note.octave); i++) {
          ctx.beginPath();
          ctx.arc(graceX + xOffset, lowerDotBaseY + i * 7, dotRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    if (mainNoteX !== undefined && notes.length > 0) {
      // 1) 从整组倚音的 X 中心开始
      const groupStartX = xs[0] - size * 0.8;
      const groupEndX = xs[xs.length - 1] - size * 0.8;
      const startX = (groupStartX + groupEndX) / 2;

      // 2) 起点在下划线下方，不穿过下划线
      const maxUnderlines = Math.max(...notes.map(n => n.underlines));
      const baseLineY = graceY + size * 0.4 + 2;
      const startY = maxUnderlines > 0 ? baseLineY + (maxUnderlines - 1) * 3 + 4 : graceY + size * 0.6;

      // 3) 终点留 margin，不直接贴到主音符
      const endX = mainNoteX - size * 0.6;
      const endY = y - size * 0.4;

      // 简单的小弧线：起点 → 控制点(偏下) → 终点
      const cpX = (startX + endX) / 2;
      const cpY = Math.max(startY, endY) + size * 0.6;

      ctx.strokeStyle = groupActive ? '#ef4444' : '#1a1a2e';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(cpX, cpY, endX, endY);
      ctx.stroke();
    }
  }

  renderTie(ctx, startPos, endPos, y, maxOctave) {
    const size = 20;

    // 弧线在音符上方，根据高音点数量自适应上移
    const offset = maxOctave > 0 ? maxOctave * 10 + 3 : 0;
    const arcY = y - size * 0.6 - offset;
    const startX = startPos.x;
    const endX = endPos.x;
    const midX = (startX + endX) / 2;
    const controlY = arcY - 8; // 弧线高度

    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(startX, arcY);
    ctx.quadraticCurveTo(midX, controlY, endX, arcY);
    ctx.stroke();
  }

  renderTupletBracket(ctx, startPos, endPos, y, number, maxOctave = 0) {
    const size = 20;
    const startX = startPos.x - size * 0.3;
    const endX = endPos.x + size * 0.3;
    const midX = (startX + endX) / 2;
    const offset = maxOctave > 0 ? maxOctave * 10 + 3 : 0;
    const baseY = y - size * 0.9 - offset; // 在音符上方，根据高音点自适应上移

    // 画弧线
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(startX, baseY + 4);
    ctx.quadraticCurveTo(midX, baseY - 5, endX, baseY + 4);
    ctx.stroke();

    // 画数字
    ctx.fillStyle = '#1a1a2e';
    ctx.font = `bold ${size * 0.75}px "Segoe UI", "PingFang SC", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(number.toString(), midX, baseY - 2);
  }

  renderGroupBeams(ctx, notes, notePositions, group, y) {
    const size = 20;
    const underlineHeight = 1;
    const lineSpacing = 5;

    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = underlineHeight;

    // 获取组内第一个和最后一个音符的位置
    const firstIdx = group.indices[0];
    const lastIdx = group.indices[group.indices.length - 1];
    const firstPos = notePositions[firstIdx];
    const lastPos = notePositions[lastIdx];
    const firstNote = notes[firstIdx];

    // 下划线统一基线，不随高低音偏移
    const baseLineY = y + size * 0.4 + 4;

    // 画第一条下划线（所有音符都连）
    // 使用音符宽度，让线覆盖音符宽度的70%
    const firstLeft = firstPos.x - size * 0.2835;
    const lastRight = lastPos.x + size * 0.2835;
    ctx.beginPath();
    ctx.moveTo(firstLeft, baseLineY);
    ctx.lineTo(lastRight, baseLineY);
    ctx.stroke();

    // 画第二条下划线
    // 找到所有 underlines >= 2 的音符
    const sixteenthIndices = [];
    for (let i = 0; i < group.indices.length; i++) {
      const idx = group.indices[i];
      if (notes[idx].underlines >= 2) {
        sixteenthIndices.push(i);
      }
    }

    // 相邻的十六分音符连起来，不相邻的各自单独画
    const lineY = baseLineY + lineSpacing;
    let i = 0;
    while (i < sixteenthIndices.length) {
      // 找一段连续的十六分音符
      let j = i;
      while (j + 1 < sixteenthIndices.length && sixteenthIndices[j + 1] === sixteenthIndices[j] + 1) {
        j++;
      }

      const startIdx = group.indices[sixteenthIndices[i]];
      const startPos = notePositions[startIdx];

      if (i === j) {
        // 单个孤立的十六分音符，单独画一条短线
        const lineWidth = size * 0.567;
        ctx.beginPath();
        ctx.moveTo(startPos.x - lineWidth / 2, lineY);
        ctx.lineTo(startPos.x + lineWidth / 2, lineY);
        ctx.stroke();
      } else {
        // 一段连续的十六分音符，连起来画
        const endIdx = group.indices[sixteenthIndices[j]];
        const endPos = notePositions[endIdx];
        ctx.beginPath();
        ctx.moveTo(startPos.x - size * 0.2835, lineY);
        ctx.lineTo(endPos.x + size * 0.2835, lineY);
        ctx.stroke();
      }

      i = j + 1;
    }

    // 画第三条下划线（三十二分音符）
    const thirtySecondIndices = [];
    for (let k = 0; k < group.indices.length; k++) {
      const idx = group.indices[k];
      if (notes[idx].underlines >= 3) {
        thirtySecondIndices.push(k);
      }
    }

    const lineY3 = baseLineY + lineSpacing * 2;
    let k = 0;
    while (k < thirtySecondIndices.length) {
      let m = k;
      while (m + 1 < thirtySecondIndices.length && thirtySecondIndices[m + 1] === thirtySecondIndices[m] + 1) {
        m++;
      }

      const startIdx = group.indices[thirtySecondIndices[k]];
      const startPos = notePositions[startIdx];

      if (k === m) {
        const lineWidth = size * 0.567;
        ctx.beginPath();
        ctx.moveTo(startPos.x - lineWidth / 2, lineY3);
        ctx.lineTo(startPos.x + lineWidth / 2, lineY3);
        ctx.stroke();
      } else {
        const endIdx = group.indices[thirtySecondIndices[m]];
        const endPos = notePositions[endIdx];
        ctx.beginPath();
        ctx.moveTo(startPos.x - size * 0.2835, lineY3);
        ctx.lineTo(endPos.x + size * 0.2835, lineY3);
        ctx.stroke();
      }

      k = m + 1;
    }
  }

  renderRest(ctx, note, x, y, noteWidth, group = null) {
    const size = 20;

    const isActive = this.isNoteActive(note);
    const color = isActive ? '#ef4444' : '#1a1a2e';

    ctx.fillStyle = color;
    ctx.font = `${size}px "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 休止符用特殊符号或横线表示
    if (note.digit === '0') {
      // 休止符 0
      ctx.font = `bold ${size}px "Segoe UI", "PingFang SC", sans-serif`;
      ctx.fillText('0', x, y);
    } else if (note.duration >= 1) {
      // 全休止符/二分休止符/增时线 - 用横线表示
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      // 横线宽度适配音符宽度，最大不超过 size * 0.8
      const lineWidth = Math.min(size * 0.8, (noteWidth || size) * 0.7);
      ctx.beginPath();
      ctx.moveTo(x - lineWidth / 2, y);
      ctx.lineTo(x + lineWidth / 2, y);
      ctx.stroke();
    } else {
      // 短休止符 - 用点或特殊标记
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 单音符的下划线（不在组内的，或组内只有一个音符的）
    if (note.underlines > 0 && (!group || group.indices.length === 1)) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      const lineY = y + size * 0.4 + 4;
      const lineWidth = size * 0.486;

      for (let i = 0; i < note.underlines; i++) {
        ctx.beginPath();
        ctx.moveTo(x - lineWidth / 2, lineY + i * 5);
        ctx.lineTo(x + lineWidth / 2, lineY + i * 5);
        ctx.stroke();
      }
    }

    // 标注
    if (note.note) {
      const labelSize = 13;
      let labelY = y + size * 0.5 + 3;
      if (note.underlines > 0) {
        labelY = Math.max(labelY, y + size * 0.4 + 4 + (note.underlines - 1) * 5 + 5);
      }
      ctx.fillStyle = '#64748b';
      ctx.font = `${labelSize}px "Segoe UI", "PingFang SC", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(note.note, x, labelY);
    }
  }

  renderEmpty(options: RenderOptions = {}) {
    let canvas = this.canvas;
    let ctx = this.ctx;
    const A4_WIDTH = 720;
    const renderScale = options.scale || 1.5;

    canvas.width = Math.round(A4_WIDTH * renderScale);
    canvas.height = Math.round(400 * renderScale);
    canvas.style.width = '100%';
    canvas.style.maxWidth = A4_WIDTH + 'px';
    canvas.style.height = 'auto';
    // 设置 width/height 会重置 canvas 上下文，必须重新获取 ctx
    ctx = canvas.getContext('2d');
    ctx.scale(renderScale, renderScale);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, A4_WIDTH, 400);

    ctx.fillStyle = '#ccc';
    ctx.font = '18px "Segoe UI", "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🎵 在左侧编辑器输入简谱，此处将实时预览', A4_WIDTH / 2, 200 - 20);
    ctx.font = '14px "Segoe UI", sans-serif';
    ctx.fillText('例如: 1 2 3 4 | 5 6 5 3 | 2 - - - ||', A4_WIDTH / 2, 200 + 20);
  }

  drawRepeatStart(ctx, x, y) {
    const dotRadius = 1.5;
    const dotOffsetX = 5;
    const dotY1 = y - 6;
    const dotY2 = y + 6;

    // 粗线（最左侧）
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y - 20);
    ctx.lineTo(x, y + 23);
    ctx.stroke();

    // 细线（粗线右侧）
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + 5, y - 20);
    ctx.lineTo(x + 5, y + 23);
    ctx.stroke();

    // 两个圆点（细线右侧）
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath();
    ctx.arc(x + 5 + dotOffsetX, dotY1, dotRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 5 + dotOffsetX, dotY2, dotRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  drawRepeatEnd(ctx, x, y, isDouble) {
    const dotRadius = 1.5;
    const dotOffsetX = 6;
    const dotY1 = y - 6;
    const dotY2 = y + 6;

    // 两个圆点（最左侧）
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath();
    ctx.arc(x - dotOffsetX, dotY1, dotRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - dotOffsetX, dotY2, dotRadius, 0, Math.PI * 2);
    ctx.fill();

    // 细线（圆点右侧）
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - 20);
    ctx.lineTo(x, y + 23);
    ctx.stroke();

    // 粗线（最右侧）
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 5, y - 20);
    ctx.lineTo(x + 5, y + 23);
    ctx.stroke();

    if (isDouble) {
      // 第三条终止线
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + 10, y - 20);
      ctx.lineTo(x + 10, y + 23);
      ctx.stroke();
    }
  }

  drawRepeatBoth(ctx, x, y, isDouble) {
    const dotRadius = 1.5;
    const dotOffsetX = 5;
    const dotY1 = y - 6;
    const dotY2 = y + 6;

    // 左侧两点（后反复号）
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath();
    ctx.arc(x - 6, dotY1, dotRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - 6, dotY2, dotRadius, 0, Math.PI * 2);
    ctx.fill();

    // 细线
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - 20);
    ctx.lineTo(x, y + 23);
    ctx.stroke();

    // 粗线
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 5, y - 20);
    ctx.lineTo(x + 5, y + 23);
    ctx.stroke();

    if (isDouble) {
      // 第三条终止线
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + 10, y - 20);
      ctx.lineTo(x + 10, y + 23);
      ctx.stroke();
    }

    // 右侧两点（前反复号）
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath();
    ctx.arc(x + 5 + dotOffsetX, dotY1, dotRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 5 + dotOffsetX, dotY2, dotRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  drawVoltaBracket(ctx, startX, endX, y, number) {
    const bracketY = y - 32;
    const bracketHeight = 10;

    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 1.5;

    // 横线
    ctx.beginPath();
    ctx.moveTo(startX + 4, bracketY);
    ctx.lineTo(endX, bracketY);
    ctx.stroke();

    // 右侧竖线
    ctx.beginPath();
    ctx.moveTo(endX, bracketY);
    ctx.lineTo(endX, bracketY + bracketHeight);
    ctx.stroke();

    // 编号文字
    ctx.fillStyle = '#1a1a2e';
    ctx.font = `bold 12px "Segoe UI", "PingFang SC", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(number + '.', startX + 2, bracketY - 1);
  }

  drawFlowMark(ctx, measure, x, y, measureWidth) {
    const markY = y + 38;
    const items = [];

    if (measure.segno) items.push('𝄋');
    if (measure.coda) items.push('𝆌');
    if (measure.dc) items.push('D.C.');
    if (measure.ds) items.push('D.S.');
    if (measure.fine) items.push('Fine');
    if (measure.toCoda) items.push('To 𝆌');

    if (items.length === 0) return;

    ctx.fillStyle = '#555';
    ctx.font = `italic 11px "Segoe UI", "PingFang SC", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // 特殊符号用稍大字号
    const hasSymbols = measure.segno || measure.coda;
    if (hasSymbols) {
      ctx.font = `14px "Segoe UI", sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText(items.join('  '), x + measureWidth / 2, markY);
    } else {
      ctx.fillText(items.join('  '), x + measureWidth / 2, markY);
    }
  }

  collectPlaybackNotes(measures, settings) {
    // 清除之前的时间标记
    for (const measure of measures) {
      for (const note of measure.notes) {
        delete note._playbackTimes;
      }
    }

    const notes = [];
    let time = 0;
    const quarterDuration = 60 / settings.bpm;
    let graceOffset = 0; // 连续倚音在主音前占用的累计偏移

    function addPlaybackTime(note, startTime, duration) {
      note._playbackTimes = note._playbackTimes || [];
      note._playbackTimes.push({ startTime, duration });
    }

    function extendLastPlaybackTime(note, extraDuration) {
      if (note._playbackTimes && note._playbackTimes.length > 0) {
        note._playbackTimes[note._playbackTimes.length - 1].duration += extraDuration;
      }
    }

    for (const measure of measures) {
      for (let i = 0; i < measure.notes.length; i++) {
        const note = measure.notes[i];
        const duration = note.duration * quarterDuration;

        if (note.type === 'grace') {
          const freq = this.getFrequency(note, settings.key);
          const graceDur = duration;
          notes.push({
            frequency: freq,
            startTime: time + graceOffset,
            duration: graceDur,
            digit: note.digit,
            octave: note.octave,
            isGrace: true,
          });
          addPlaybackTime(note, time + graceOffset, graceDur);
          graceOffset += graceDur;
          continue;
        }

        if (note.type === 'note' || note.type === 'beat') {
          const freq = note.type === 'beat' ? 0 : this.getFrequency(note, settings.key);

          // 检查当前音符是否被前面的音符 tie 了
          const prevNote = i > 0 ? measure.notes[i - 1] : null;
          const isTied =
            prevNote &&
            (prevNote.type === 'note' || prevNote.type === 'beat') &&
            prevNote.isTie &&
            prevNote.digit === note.digit &&
            prevNote.octave === note.octave;

          // 倚音时值从主音中扣除
          let actualDuration = duration;
          if (graceOffset > 0) {
            actualDuration = Math.max(duration - graceOffset, duration * 0.5);
          }

          addPlaybackTime(note, time + graceOffset, actualDuration);

          if (isTied) {
            // 找到最后一个非倚音的实际音符来延长
            let k = notes.length - 1;
            while (k >= 0 && notes[k].isGrace) k--;
            if (k >= 0 && notes[k].digit === note.digit && notes[k].octave === note.octave) {
              notes[k].duration += actualDuration;
              // 同时延长原始前一个音符的播放时长
              let j = i - 1;
              while (j >= 0 && measure.notes[j].type === 'grace') j--;
              if (j >= 0) {
                extendLastPlaybackTime(measure.notes[j], actualDuration);
              }
            } else {
              const noteData: any = {
                frequency: freq,
                startTime: time + graceOffset,
                duration: actualDuration,
                digit: note.digit,
                octave: note.octave,
                isBeat: note.type === 'beat',
              };
              if (note.slideFrom) {
                noteData.slideFrom = {
                  frequency: this.getFrequency(note.slideFrom, settings.key),
                };
                const sixteenthDur = 0.25 * quarterDuration;
                noteData.slideDuration = Math.min(sixteenthDur, actualDuration * 0.5);
              }
              notes.push(noteData);
            }
          } else {
            const noteData: any = {
              frequency: freq,
              startTime: time + graceOffset,
              duration: actualDuration,
              digit: note.digit,
              octave: note.octave,
              isBeat: note.type === 'beat',
            };
            if (note.slideFrom) {
              noteData.slideFrom = {
                frequency: this.getFrequency(note.slideFrom, settings.key),
              };
              const sixteenthDur = 0.25 * quarterDuration;
              noteData.slideDuration = Math.min(sixteenthDur, actualDuration * 0.5);
            }
            notes.push(noteData);
          }
        } else if (note.type === 'rest') {
          addPlaybackTime(note, time, duration);
          // 增时线：延长前一个实际音符或节拍符的时值
          if (note.isExtension) {
            let j = i - 1;
            while (j >= 0 && measure.notes[j].type === 'grace') j--;
            if (j >= 0 && (measure.notes[j].type === 'note' || measure.notes[j].type === 'beat')) {
              let k = notes.length - 1;
              while (k >= 0 && notes[k].isGrace) k--;
              if (k >= 0) {
                notes[k].duration += duration;
              }
              // 延长原始前一个音符的播放时长
              extendLastPlaybackTime(measure.notes[j], duration);
            }
          }
        }
        time += duration;
        graceOffset = 0;
      }
    }

    state.playbackNotes = notes;
    state.totalDuration = time;
  }

  getFrequency(note, key) {
    const baseFreqs = NOTE_FREQUENCIES[key] || NOTE_FREQUENCIES['C'];
    let freq = baseFreqs[note.digit] || 440;

    // 八度调整
    if (note.octave > 0) {
      freq *= Math.pow(2, note.octave);
    } else if (note.octave < 0) {
      freq /= Math.pow(2, Math.abs(note.octave));
    }

    // 升降号
    if (note.accidental === '#') {
      freq *= Math.pow(2, 1 / 12);
    } else if (note.accidental === 'b') {
      freq /= Math.pow(2, 1 / 12);
    }

    return freq;
  }

  renderBoxes(ctx, measure, notePositions, y) {
    if (!notePositions || notePositions.length === 0) return;

    // 按 boxId 分组
    const boxGroups = {};
    for (let i = 0; i < measure.notes.length; i++) {
      const note = measure.notes[i];
      if (note.boxId) {
        if (!boxGroups[note.boxId]) boxGroups[note.boxId] = [];
        boxGroups[note.boxId].push({ note, pos: notePositions[i], index: i });
      }
    }

    for (const boxId in boxGroups) {
      const group = boxGroups[boxId];
      if (group.length === 0) continue;

      const firstPos = group[0].pos;
      const lastPos = group[group.length - 1].pos;

      // 计算框内音符的垂直范围
      const size = 20;
      let topY = y - size * 0.7 - 10;
      let bottomY = y + size * 0.7 + 10;

      for (const item of group) {
        const note = item.note;
        // 高音点上移
        if (note.octave > 0) {
          topY = Math.min(topY, y - size * 0.75 - (note.octave - 1) * 10 - 14);
        }
        // 演奏技法上移
        if (note.technique) {
          topY = Math.min(topY, y - size * 0.65 - 18);
        }
        // 低音点/下划线下移
        if (note.octave < 0) {
          const dotBase = note.underlines > 0 ? y + size * 0.4 + 4 + (note.underlines - 1) * 5 + 8 : y + size * 0.75;
          bottomY = Math.max(bottomY, dotBase + (Math.abs(note.octave) - 1) * 10 + 6);
        } else if (note.underlines > 0) {
          bottomY = Math.max(bottomY, y + size * 0.4 + 4 + (note.underlines - 1) * 5 + 6);
        }
        // 标注文字下移
        if (note.note) {
          let labelY = y + size * 0.5 + 3;
          if (note.underlines > 0) {
            labelY = Math.max(labelY, y + size * 0.4 + 4 + (note.underlines - 1) * 5 + 5);
          }
          if (note.octave < 0) {
            const dotBase = note.underlines > 0 ? y + size * 0.4 + 4 + (note.underlines - 1) * 5 + 8 : y + size * 0.75;
            labelY = Math.max(labelY, dotBase + (Math.abs(note.octave) - 1) * 10 + 8);
          }
          bottomY = Math.max(bottomY, labelY + 14);
        }
        // 滑音上移
        if (note.slideFrom) {
          topY = Math.min(topY, y - 28);
        }
      }

      // 精确计算框的水平范围，基于音符真实视觉边界，并在密集时避免覆盖相邻非框音符
      const getNoteLeftExtent = note => {
        let ext = size * 0.35; // 数字半宽（20px bold 数字实际渲染宽约 11–14px）
        if (note.accidental) {
          // 升降号中心在 x - size*0.5，字体 size*0.7，半宽约 size*0.25
          ext = Math.max(ext, size * 0.5 + size * 0.25);
        }
        if (note.slideFrom) {
          const slideSize = 13;
          let slideExt = slideSize * 0.35;
          if (note.slideFrom.accidental) {
            slideExt = Math.max(slideExt, slideSize * 0.5 + slideSize * 0.25);
          }
          const xOffset = note.accidental ? size * 0.2 : 0;
          // 滑音中心在 x + xOffset - 6
          ext = Math.max(ext, 6 - xOffset + slideExt);
        }
        return ext;
      };

      const getNoteRightExtent = note => {
        let ext = size * 0.35;
        if (note.hasDot) {
          const xOffset = note.accidental ? size * 0.2 : 0;
          // 附点中心在 x + size*0.5 + xOffset，半径 2
          ext = Math.max(ext, size * 0.5 + xOffset + 2);
        }
        return ext;
      };

      const firstNote = group[0].note;
      const lastNote = group[group.length - 1].note;
      const firstIdx = group[0].index;
      const lastIdx = group[group.length - 1].index;
      const gap = 2; // 框与相邻非框音符之间的最小留白
      const padX = 3;

      let boxLeft = firstPos.x - getNoteLeftExtent(firstNote) - padX;
      // 如果前面有非框音符，框左边界不侵入它的视觉区域
      if (firstIdx > 0) {
        const prevNote = measure.notes[firstIdx - 1];
        const prevPos = notePositions[firstIdx - 1];
        boxLeft = Math.max(boxLeft, prevPos.x + getNoteRightExtent(prevNote) + gap);
      }

      let boxRight = lastPos.x + getNoteRightExtent(lastNote) + padX;
      // 如果后面有非框音符，框右边界不侵入它的视觉区域
      if (lastIdx < measure.notes.length - 1) {
        const nextNote = measure.notes[lastIdx + 1];
        const nextPos = notePositions[lastIdx + 1];
        boxRight = Math.min(boxRight, nextPos.x - getNoteLeftExtent(nextNote) - gap);
      }

      let boxX = boxLeft;
      let boxW = boxRight - boxLeft;
      if (boxW < 4) {
        // 极端密集导致空间不足，以框内音符跨度中心为基准画最小框
        const center = (firstPos.x + lastPos.x) / 2;
        boxW = 6;
        boxX = center - boxW / 2;
      }

      const padY = 4;
      const boxY = topY - padY;
      const boxH = bottomY - topY + padY * 2;

      this.drawHandDrawnBox(ctx, boxX, boxY, boxW, boxH, boxId);
    }
  }

  drawHandDrawnBox(ctx, x, y, w, h, seedStr) {
    // 将 boxId 字符串转为确定性数字种子
    let seed = 0;
    for (let i = 0; i < (seedStr || '').length; i++) {
      seed = (seed << 5) - seed + seedStr.charCodeAt(i);
      seed |= 0;
    }
    seed = Math.abs(seed) || 1;

    const roughness = 1.3;
    const segments = 18;

    function rand(i) {
      const v = Math.sin(seed * 9301 + i * 49297 + seed * 0.37) * 43758.5453;
      return (v - Math.floor(v)) * roughness - roughness / 2;
    }

    ctx.save();
    ctx.strokeStyle = '#2563eb';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 收集边框点
    const points = [];

    // 上边（从左到右）
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      points.push({
        x: x + w * t + rand(i),
        y: y + rand(i + 100),
      });
    }

    // 右边（从上到下）
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      points.push({
        x: x + w + rand(i + 200),
        y: y + h * t + rand(i + 300),
      });
    }

    // 下边（从右到左）
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      points.push({
        x: x + w * (1 - t) + rand(i + 400),
        y: y + h + rand(i + 500),
      });
    }

    // 左边（从下到上）
    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      points.push({
        x: x + rand(i + 600),
        y: y + h * (1 - t) + rand(i + 700),
      });
    }

    // 画两遍，产生手绘墨水感
    for (let pass = 0; pass < 2; pass++) {
      ctx.globalAlpha = pass === 0 ? 0.25 : 0.9;
      ctx.lineWidth = pass === 0 ? 2.6 : 1.6;

      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.closePath();
      ctx.stroke();
    }

    ctx.restore();
  }

  renderSVG(data: ParseResult, options: RenderOptions = {}) {
    const { measures, settings } = data;
    if (measures.length === 0) {
      return this.renderEmptySVG(options);
    }

    const layout = this.computeLayout(data);
    if (!layout) return this.renderEmptySVG(options);
    const { lines, lineHasLabel } = layout;

    const A4_WIDTH = 720;
    const A4_HEIGHT = 1050;
    const MARGIN_X = 40;
    const MARGIN_Y = 50;

    const lineHeight = (this.config.lineHeight as number) || 81;
    const labelExtraHeight = 18;
    const titleHeight = settings.title ? 40 : 0;
    let totalHeight = MARGIN_Y * 2 + titleHeight + 20;
    for (let i = 0; i < lines.length; i++) {
      totalHeight += lineHeight + ((lineHasLabel[i] as any) ? labelExtraHeight : 0);
    }

    const renderScale = options.scale || 1.5;
    const pageInfo = options.pageInfo || null;

    const pageHeight =
      pageInfo && pageInfo.actualHeight ? pageInfo.actualHeight : pageInfo ? A4_HEIGHT : Math.max(totalHeight, 400);
    const svgCtx = new SVGContext(A4_WIDTH, pageHeight);

    svgCtx.fillStyle = '#ffffff';
    svgCtx.fillRect(0, 0, A4_WIDTH, pageHeight);

    let y = MARGIN_Y;
    if (settings.title && (!pageInfo || pageInfo.pageIndex === 0)) {
      svgCtx.fillStyle = '#1a1a2e';
      svgCtx.font = `bold 22px "Segoe UI", "PingFang SC", sans-serif`;
      svgCtx.textAlign = 'center';
      svgCtx.fillText(settings.title, A4_WIDTH / 2, y);
      y += 35;
    }

    if (!pageInfo || pageInfo.pageIndex === 0) {
      svgCtx.fillStyle = '#555';
      this.renderKeyHeader(svgCtx, settings, MARGIN_X, y);
      y += lineHeight * 0.75;
    } else {
      y = MARGIN_Y;
    }

    let avgMeasureWidth = null;
    if (lines.length > 1) {
      let totalWidth = 0;
      let totalCount = 0;
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        const lineAvailableWidth = A4_WIDTH - MARGIN_X * 2;
        const perMeasureWidth = lineAvailableWidth / line.length;
        totalWidth += perMeasureWidth;
        totalCount += 1;
      }
      avgMeasureWidth = totalWidth / totalCount;
    }

    for (let i = 0; i < lines.length; i++) {
      if (pageInfo && !pageInfo.lineIndices.includes(i)) continue;
      const line = lines[i];
      const isLastLine = i === lines.length - 1;
      const useMaxWidth =
        isLastLine && avgMeasureWidth !== null && line.length < lines[0].length ? avgMeasureWidth * 1.2 : null;
      this.renderLine(svgCtx, line, MARGIN_X, y, A4_WIDTH - MARGIN_X * 2, useMaxWidth, settings.timeSignature);
      y += lineHeight + ((lineHasLabel[i] as any) ? labelExtraHeight : 0);
    }

    if (pageInfo && pageInfo.totalPages > 1) {
      svgCtx.fillStyle = '#999';
      svgCtx.font = `11px "Segoe UI", "PingFang SC", sans-serif`;
      svgCtx.textAlign = 'center';
      svgCtx.fillText(`— ${pageInfo.pageIndex + 1} / ${pageInfo.totalPages} —`, A4_WIDTH / 2, pageHeight - 20);
    }

    return svgCtx.getSVG();
  }

  renderEmptySVG(options: RenderOptions = {}) {
    const A4_WIDTH = 720;
    const renderScale = options.scale || 1.5;

    const svgCtx = new SVGContext(A4_WIDTH, 400);

    svgCtx.fillStyle = '#ffffff';
    svgCtx.fillRect(0, 0, A4_WIDTH, 400);

    svgCtx.fillStyle = '#ccc';
    svgCtx.font = '18px "Segoe UI", "PingFang SC", sans-serif';
    svgCtx.textAlign = 'center';
    svgCtx.fillText('🎵 在左侧编辑器输入简谱，此处将实时预览', A4_WIDTH / 2, 200 - 20);
    svgCtx.font = '14px "Segoe UI", sans-serif';
    svgCtx.fillText('例如: 1 2 3 4 | 5 6 5 3 | 2 - - - ||', A4_WIDTH / 2, 200 + 20);

    return svgCtx.getSVG();
  }
}

// ===== 音频播放器 =====
