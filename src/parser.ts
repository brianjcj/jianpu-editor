import { TECHNIQUES } from './constants';
import type { Token, Measure, GlobalSettings, ParseResult } from './types';

export class JianPuParser {
  tokens: Token[];

  constructor() {
    this.tokens = [];
  }

  parse(text: string): ParseResult {
    const lines = text.split('\n');
    const measures = [];
    let currentMeasure = this.createEmptyMeasure();
    let globalSettings: import('./types').GlobalSettings = {
      bpm: 120,
      key: 'C',
      timeSignature: [4, 4] as [number, number],
      title: '',
    };
    let globalOffset = 0;

    for (let rawLine of lines) {
      const lineStart = globalOffset;
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        globalOffset += rawLine.length + 1;
        continue;
      }

      // 全局设置
      if (line.startsWith('%')) {
        const match = line.match(/%([A-G]#?)=?(\d+)?\/?(\d+)?/);
        if (match) {
          globalSettings.key = match[1];
          if (match[2]) globalSettings.timeSignature[0] = parseInt(match[2]);
          if (match[3]) globalSettings.timeSignature[1] = parseInt(match[3]);
        }
        globalOffset += rawLine.length + 1;
        continue;
      }

      // 空弦音设置
      if (line.startsWith('$')) {
        const str = line.slice(1).trim();
        if (str) {
          const tokens = this.tokenize(str, globalOffset + 1);
          globalSettings.openStrings = (tokens.filter(t => t.type === 'note') as import('./types').NoteToken[]).map(
            t => ({
              digit: t.digit,
              octave: t.octave,
              accidental: t.accidental,
            })
          );
        }
        globalOffset += rawLine.length + 1;
        continue;
      }

      // BPM 设置
      if (line.startsWith('@')) {
        const bpm = parseInt(line.slice(1));
        if (!isNaN(bpm)) globalSettings.bpm = bpm;
        globalOffset += rawLine.length + 1;
        continue;
      }

      // 标题
      if (line.startsWith('!')) {
        globalSettings.title = line.slice(1).trim();
        globalOffset += rawLine.length + 1;
        continue;
      }

      // 解析音符和小节
      const tokens = this.tokenize(line, lineStart);
      for (const token of tokens) {
        if (token.type === 'barline') {
          if (currentMeasure.notes.length > 0 || currentMeasure.voltaStart !== null || currentMeasure.repeatStart) {
            currentMeasure.isDouble = token.isDouble;
            if (token.repeatEnd) currentMeasure.repeatEnd = true;
            measures.push(currentMeasure);
            currentMeasure = this.createEmptyMeasure();
          } else if (measures.length > 0 && token.repeatEnd) {
            // 当前小节为空，将 repeatEnd 合并到前一小节
            measures[measures.length - 1].repeatEnd = true;
            measures[measures.length - 1].isDouble = token.isDouble;
          }
          if (token.repeatStart) {
            currentMeasure.repeatStart = true;
          }
        } else if (token.type === 'voltaStart') {
          currentMeasure.voltaStart = token.number;
        } else if (token.type === 'voltaEnd') {
          if (
            currentMeasure.notes.length === 0 &&
            currentMeasure.voltaStart === null &&
            currentMeasure.repeatStart === false &&
            measures.length > 0
          ) {
            measures[measures.length - 1].voltaEnd = true;
          } else {
            currentMeasure.voltaEnd = true;
          }
        } else if (token.type === 'note' || token.type === 'rest' || token.type === 'grace' || token.type === 'beat') {
          currentMeasure.notes.push(token);
        } else if (['segno', 'coda', 'toCoda', 'dc', 'ds', 'fine'].includes(token.type)) {
          currentMeasure[token.type] = true;
        }
      }
      globalOffset += rawLine.length + 1;
    }

    // 收尾小节
    if (
      currentMeasure.notes.length > 0 ||
      currentMeasure.voltaStart !== null ||
      currentMeasure.repeatStart ||
      currentMeasure.segno ||
      currentMeasure.coda ||
      currentMeasure.toCoda ||
      currentMeasure.dc ||
      currentMeasure.ds ||
      currentMeasure.fine
    ) {
      currentMeasure.isDouble = true;
      measures.push(currentMeasure);
    }

    // 补全每个 measure 的 sourceStart / sourceEnd
    for (const measure of measures) {
      if (measure.notes.length > 0) {
        measure.sourceStart = measure.notes[0].sourceStart;
        measure.sourceEnd = measure.notes[measure.notes.length - 1].sourceEnd;
      } else {
        measure.sourceStart = 0;
        measure.sourceEnd = 0;
      }
    }

    // 展开反复标记，生成扁平演奏序列
    const flatMeasures = this.expandRepeats(measures);

    return { measures, flatMeasures, settings: globalSettings };
  }

  createEmptyMeasure(): Measure {
    return {
      notes: [],
      isDouble: false,
      repeatStart: false,
      repeatEnd: false,
      voltaStart: null,
      voltaEnd: false,
      segno: false,
      coda: false,
      toCoda: false,
      dc: false,
      ds: false,
      fine: false,
      sourceStart: 0,
      sourceEnd: 0,
    };
  }

  expandRepeats(measures: Measure[]): Measure[] {
    if (!measures || measures.length === 0) return [];

    const flatMeasures = [];
    let pointer = 0;
    const visitCount = { dc: 0, ds: 0, toCoda: 0 };
    const repeatVisits = {};
    let currentVoltaPass = 1;

    const segnoIndex = measures.findIndex(m => m.segno);
    const codaIndex = measures.findIndex(m => m.coda);

    while (pointer >= 0 && pointer < measures.length) {
      const measure = measures[pointer];

      // 跳过非当前房子的跳房子小节
      if (measure.voltaStart !== null && measure.voltaStart !== currentVoltaPass) {
        let endPtr = pointer + 1;
        let foundRepeatEnd = false;
        while (endPtr < measures.length) {
          if (measures[endPtr].repeatEnd) foundRepeatEnd = true;
          if (measures[endPtr].voltaEnd) {
            endPtr++;
            break;
          }
          if (measures[endPtr].voltaStart !== null) break;
          endPtr++;
        }

        // 如果跳过的范围内包含 repeatEnd，则执行跳回（第一房子结束后跳回）
        if (foundRepeatEnd) {
          let repeatStart = -1;
          let depth = 0;
          for (let i = pointer; i >= 0; i--) {
            if (i < pointer && measures[i].repeatEnd) depth++;
            if (measures[i].repeatStart) {
              if (depth > 0) depth--;
              else {
                repeatStart = i;
                break;
              }
            }
          }
          if (repeatStart < 0) repeatStart = 0;

          const repeatKey = 'rep_' + repeatStart;
          const hasVolta = measures.slice(repeatStart, endPtr).some(m => m.voltaStart !== null);

          if (!repeatVisits[repeatKey]) {
            repeatVisits[repeatKey] = 1;
            if (hasVolta) currentVoltaPass = 2;
            pointer = repeatStart;
            continue;
          } else if (repeatVisits[repeatKey] === 1 && hasVolta) {
            repeatVisits[repeatKey] = 2;
            currentVoltaPass = 1;
          }
        }

        pointer = endPtr;
        continue;
      }

      // 流程控制：ToCoda → 跳到 Coda
      if (measure.toCoda && visitCount.toCoda === 0 && codaIndex >= 0) {
        visitCount.toCoda = 1;
        pointer = codaIndex;
        continue;
      }

      // 流程控制：DC → 从头反复
      if (measure.dc && visitCount.dc === 0) {
        visitCount.dc = 1;
        currentVoltaPass = 1;
        pointer = 0;
        continue;
      }

      // 流程控制：DS → 从 Segno 反复
      if (measure.ds && visitCount.ds === 0 && segnoIndex >= 0) {
        visitCount.ds = 1;
        currentVoltaPass = 1;
        pointer = segnoIndex;
        continue;
      }

      // Fine → 结束
      if (measure.fine) {
        flatMeasures.push(measure);
        break;
      }

      flatMeasures.push(measure);

      // 反复结束处理
      if (measure.repeatEnd) {
        let repeatStart = -1;
        let depth = 0;
        for (let i = pointer; i >= 0; i--) {
          if (i < pointer && measures[i].repeatEnd) depth++;
          if (measures[i].repeatStart) {
            if (depth > 0) depth--;
            else {
              repeatStart = i;
              break;
            }
          }
        }
        if (repeatStart < 0) repeatStart = 0;

        // 同一反复区间（由 repeatStart 标识）只应被访问两次，
        // 不用 pointer 是因为跳房子的多个房子会有不同的 repeatEnd 位置
        const repeatKey = 'rep_' + repeatStart;
        const hasVolta = measures.slice(repeatStart, pointer + 1).some(m => m.voltaStart !== null);

        if (!repeatVisits[repeatKey]) {
          repeatVisits[repeatKey] = 1;
          if (hasVolta) currentVoltaPass = 2;
          pointer = repeatStart;
          continue;
        } else if (repeatVisits[repeatKey] === 1 && hasVolta) {
          repeatVisits[repeatKey] = 2;
          currentVoltaPass = 1;
        }
      }

      pointer++;
    }

    return flatMeasures;
  }

  tokenize(line: string, lineStart = 0): Token[] {
    const tokens = [];
    let i = 0;

    while (i < line.length) {
      const ch = line[i];

      // 小节线（支持 |: 前反复号）
      if (ch === '|') {
        if (line[i + 1] === ':' && line[i + 2] !== '|') {
          tokens.push({
            type: 'barline',
            isDouble: false,
            repeatStart: true,
            sourceStart: lineStart + i,
            sourceEnd: lineStart + i + 2,
          });
          i += 2;
        } else if (line[i + 1] === '|') {
          tokens.push({ type: 'barline', isDouble: true, sourceStart: lineStart + i, sourceEnd: lineStart + i + 2 });
          i += 2;
        } else {
          tokens.push({ type: 'barline', isDouble: false, sourceStart: lineStart + i, sourceEnd: lineStart + i + 1 });
          i++;
        }
        continue;
      }

      // 空格跳过
      if (ch === ' ' || ch === '\t') {
        i++;
        continue;
      }

      // 框选标注：框(音符序列)
      if (ch === '框') {
        if (line[i + 1] === '(') {
          const box = this.parseBox(line, i, lineStart);
          if (box) {
            tokens.push(...box.tokens);
            i = box.nextIndex;
            continue;
          }
        }
      }

      // 倚音：括号内的音符，如 (3) 或 (5^)
      if (ch === '(') {
        const grace = this.parseGraceNote(line, i, lineStart);
        if (grace) {
          tokens.push(...grace.tokens);
          i = grace.nextIndex;
          continue;
        }
      }

      // 连音（三连音/五连音等）：{N:...}，如 {3:1/ 2/ 3/}
      if (ch === '{') {
        const tuplet = this.parseTuplet(line, i, lineStart);
        if (tuplet) {
          tokens.push(...tuplet.tokens);
          i = tuplet.nextIndex;
          continue;
        }
      }

      // 跳房子 [1 [2 [3
      if (ch === '[') {
        if (line[i + 1] === '1' || line[i + 1] === '2' || line[i + 1] === '3') {
          tokens.push({
            type: 'voltaStart',
            number: parseInt(line[i + 1]),
            sourceStart: lineStart + i,
            sourceEnd: lineStart + i + 2,
          });
          i += 2;
          continue;
        }
      }

      // 跳房子结束 ]
      if (ch === ']') {
        tokens.push({ type: 'voltaEnd', sourceStart: lineStart + i, sourceEnd: lineStart + i + 1 });
        i++;
        continue;
      }

      // 音符（0-7）
      if (/[0-7]/.test(ch)) {
        const note = this.parseNote(line, i, lineStart);
        // 检测滑音：起始音 + 滑 + 目标音
        if (note.token.type === 'note' && line.slice(note.nextIndex, note.nextIndex + 1) === '滑') {
          const target = this.parseNote(line, note.nextIndex + 1, lineStart);
          if (target.token.type === 'note') {
            (target.token as import('./types').NoteToken).slideFrom = {
              digit: (note.token as import('./types').NoteToken).digit,
              octave: (note.token as import('./types').NoteToken).octave,
              accidental: (note.token as import('./types').NoteToken).accidental,
            };
            // 滑音整体范围：从起始音到目标音末尾
            target.token.sourceStart = note.token.sourceStart;
            tokens.push(target.token);
            i = target.nextIndex;
            continue;
          }
        }
        tokens.push(note.token);
        i = note.nextIndex;
        continue;
      }

      // 节拍/鼓点 X（无音高，纯节奏）
      if (ch === 'X' || ch === 'x') {
        const startIdx = i;
        let hasDot = false;
        let underlines = 0;
        let isTie = false;
        let i2 = i + 1;
        while (i2 < line.length) {
          const c2 = line[i2];
          if (c2 === '.') {
            hasDot = true;
            i2++;
          } else if (c2 === '/') {
            underlines++;
            i2++;
          } else if (c2 === '=') {
            underlines += 2;
            i2++;
          } else if (c2 === '~') {
            isTie = true;
            i2++;
          } else break;
        }
        // 检测标注 "..."
        let noteLabel = '';
        if (i2 < line.length && line[i2] === '"') {
          i2++;
          const end = line.indexOf('"', i2);
          if (end !== -1) {
            noteLabel = line.slice(i2, end);
            i2 = end + 1;
          }
        }
        // 标注后仍可跟 ~ 连音
        if (i2 < line.length && line[i2] === '~') {
          isTie = true;
          i2++;
        }
        const duration = this.calculateDuration(underlines, hasDot);
        tokens.push({
          type: 'beat',
          digit: 'X',
          duration: duration,
          underlines: underlines,
          hasDot: hasDot,
          isTie: isTie,
          note: noteLabel,
          sourceStart: lineStart + startIdx,
          sourceEnd: lineStart + i2,
        });
        i = i2;
        continue;
      }

      // 增时线（延长前一个音符时值）或休止符
      if (ch === '-') {
        const startIdx = i;
        let duration = 1;
        let hasDot = false;
        let underlines = 0;
        let i2 = i + 1;

        while (i2 < line.length && (line[i2] === '.' || line[i2] === '/' || line[i2] === '=')) {
          if (line[i2] === '.') hasDot = true;
          if (line[i2] === '/') underlines++;
          if (line[i2] === '=') underlines += 2;
          i2++;
        }

        // 检测标注 "..."
        let noteLabel = '';
        if (i2 < line.length && line[i2] === '"') {
          i2++;
          const end = line.indexOf('"', i2);
          if (end !== -1) {
            noteLabel = line.slice(i2, end);
            i2 = end + 1;
          }
        }

        // 计算时值
        duration = this.calculateDuration(underlines, hasDot);

        // 增时线始终作为独立的 rest token（占一个四分音符宽度，显示横线）
        tokens.push({
          type: 'rest',
          duration: duration,
          underlines: underlines,
          hasDot: hasDot,
          isExtension: true,
          note: noteLabel,
          sourceStart: lineStart + startIdx,
          sourceEnd: lineStart + i2,
        });
        i = i2;
        continue;
      }

      // 反复结束 :| 或 :||，以及复合反复号 :|: 或 :||:
      if (ch === ':') {
        if (line[i + 1] === '|') {
          if (line[i + 2] === ':') {
            tokens.push({
              type: 'barline',
              isDouble: false,
              repeatEnd: true,
              repeatStart: true,
              sourceStart: lineStart + i,
              sourceEnd: lineStart + i + 3,
            });
            i += 3;
          } else if (line[i + 2] === '|' && line[i + 3] === ':') {
            tokens.push({
              type: 'barline',
              isDouble: true,
              repeatEnd: true,
              repeatStart: true,
              sourceStart: lineStart + i,
              sourceEnd: lineStart + i + 4,
            });
            i += 4;
          } else if (line[i + 2] === '|') {
            tokens.push({
              type: 'barline',
              isDouble: true,
              repeatEnd: true,
              sourceStart: lineStart + i,
              sourceEnd: lineStart + i + 3,
            });
            i += 3;
          } else {
            tokens.push({
              type: 'barline',
              isDouble: false,
              repeatEnd: true,
              sourceStart: lineStart + i,
              sourceEnd: lineStart + i + 2,
            });
            i += 2;
          }
          continue;
        }
        i++;
        continue;
      }

      // 流程控制指令（按长度降序避免 ToCoda 被 Coda 截断）
      const flowWords = ['ToCoda', 'Segno', 'Coda', 'Fine', 'DC', 'DS'];
      let matchedFlow = false;
      for (const word of flowWords) {
        if (line.slice(i, i + word.length) === word) {
          const nextChar = line[i + word.length];
          if (!nextChar || /[\s|\]:]/.test(nextChar)) {
            tokens.push({
              type: word.toLowerCase(),
              sourceStart: lineStart + i,
              sourceEnd: lineStart + i + word.length,
            });
            i += word.length;
            matchedFlow = true;
            break;
          }
        }
      }
      if (matchedFlow) continue;

      // 跳过孤立的 ^ _（旧前缀写法被忽略）
      if (ch === '^' || ch === '_') {
        i++;
        continue;
      }

      i++;
    }

    return tokens;
  }

  parseNote(line: string, start: number, lineStart = 0) {
    let i = start;
    let octave = 0; // 0=中音, 1=高音, -1=低音
    let accidental = ''; // '', '#', 'b'
    let hasDot = false;
    let underlines = 0;
    let isTie = false;

    // 数字
    const digit = line[i];

    // 0 是休止符
    if (digit === '0') {
      i++;
      let hasDot = false;
      let underlines = 0;
      while (i < line.length) {
        const ch = line[i];
        if (ch === '.') {
          hasDot = true;
          i++;
        } else if (ch === '/') {
          underlines++;
          i++;
        } else if (ch === '=') {
          underlines += 2;
          i++;
        } else break;
      }
      // 检测标注 "..."
      let noteLabel = '';
      if (i < line.length && line[i] === '"') {
        i++;
        const end = line.indexOf('"', i);
        if (end !== -1) {
          noteLabel = line.slice(i, end);
          i = end + 1;
        }
      }
      return {
        token: {
          type: 'rest',
          digit: '0',
          duration: this.calculateDuration(underlines, hasDot),
          underlines: underlines,
          hasDot: hasDot,
          note: noteLabel,
          sourceStart: lineStart + start,
          sourceEnd: lineStart + i,
        },
        nextIndex: i,
      };
    }

    i++;

    // 后缀（顺序：#b → ^_ → 演奏技法 → ./=）
    while (i < line.length) {
      const ch = line[i];
      if (ch === '#') {
        accidental = '#';
        i++;
      } else if (ch === 'b') {
        accidental = 'b';
        i++;
      } else if (ch === '^') {
        octave++;
        i++;
      } else if (ch === '_') {
        octave--;
        i++;
      } else if (ch === '.') {
        hasDot = true;
        i++;
      } else if (ch === '/') {
        underlines++;
        i++;
      } else if (ch === '=') {
        underlines += 2;
        i++;
      } else if (ch === '~') {
        isTie = true;
        i++;
      } else break;
    }

    // 检测演奏技法（如 1弹、1挑）
    let technique = '';
    for (const name of Object.keys(TECHNIQUES)) {
      if (line.slice(i, i + name.length) === name) {
        technique = name;
        i += name.length;
        break;
      }
    }

    // 检测标注 "..."
    let noteLabel = '';
    if (i < line.length && line[i] === '"') {
      i++;
      const end = line.indexOf('"', i);
      if (end !== -1) {
        noteLabel = line.slice(i, end);
        i = end + 1;
      }
    }

    // 标注后仍可跟 ~ 连音
    if (i < line.length && line[i] === '~') {
      isTie = true;
      i++;
    }

    const duration = this.calculateDuration(underlines, hasDot);

    return {
      token: {
        type: 'note',
        digit: digit,
        octave: octave,
        accidental: accidental,
        duration: duration,
        underlines: underlines,
        hasDot: hasDot,
        isTie: isTie,
        technique: technique,
        note: noteLabel,
        sourceStart: lineStart + start,
        sourceEnd: lineStart + i,
      },
      nextIndex: i,
    };
  }

  parseGraceNote(line: string, start: number, lineStart = 0) {
    if (line[start] !== '(') return null;
    let i = start + 1;
    const graceTokens = [];

    while (i < line.length && line[i] !== ')') {
      // 跳过空格
      if (line[i] === ' ' || line[i] === '\t') {
        i++;
        continue;
      }

      // 必须是数字
      if (i >= line.length || !/[1-7]/.test(line[i])) return null;
      const digit = line[i];
      const noteStart = i;
      i++;

      // 后缀（顺序：#b → ^_ → 演奏技法 → / =）
      let accidental = '';
      let octave = 0;
      let underlines = 0;

      while (i < line.length) {
        const ch = line[i];
        if (ch === '#') {
          accidental = '#';
          i++;
        } else if (ch === 'b') {
          accidental = 'b';
          i++;
        } else if (ch === '^') {
          octave++;
          i++;
        } else if (ch === '_') {
          octave--;
          i++;
        } else if (ch === '/') {
          underlines++;
          i++;
        } else if (ch === '=') {
          underlines += 2;
          i++;
        } else break;
      }

      // 检测演奏技法
      let technique = '';
      for (const name of Object.keys(TECHNIQUES)) {
        if (line.slice(i, i + name.length) === name) {
          technique = name;
          i += name.length;
          break;
        }
      }

      graceTokens.push({
        type: 'grace',
        digit: digit,
        octave: octave,
        accidental: accidental,
        underlines: underlines,
        duration: 0.125, // 三十二分音符时值，用于播放
        technique: technique,
        sourceStart: lineStart + noteStart,
        sourceEnd: lineStart + i,
      });
    }

    // 必须有右括号
    if (i >= line.length || line[i] !== ')') return null;
    i++; // 跳过 )

    // 右括号后也可以有下划线，兼容 (3)/ 写法
    let trailingUnderlines = 0;
    while (i < line.length && (line[i] === '/' || line[i] === '=')) {
      if (line[i] === '/') trailingUnderlines++;
      if (line[i] === '=') trailingUnderlines += 2;
      i++;
    }
    if (trailingUnderlines > 0) {
      graceTokens.forEach(t => (t.underlines += trailingUnderlines));
    }

    if (graceTokens.length === 0) return null;

    return {
      tokens: graceTokens,
      nextIndex: i,
    };
  }

  parseTuplet(line: string, start: number, lineStart = 0) {
    // 格式：{N:音符序列}，如 {3:1/ 2/ 3/} 或 {3:1/2/3/}
    const match = line.slice(start).match(/^\{(\d+):/);
    if (!match) return null;
    const tupletNumber = parseInt(match[1]);
    if (tupletNumber < 2) return null;
    let i = start + match[0].length;

    const tokens = [];
    while (i < line.length && line[i] !== '}') {
      const ch = line[i];

      // 空格跳过
      if (ch === ' ' || ch === '\t') {
        i++;
        continue;
      }

      // 音符
      if (/[1-7]/.test(ch) || ch === '^' || ch === '_') {
        const note = this.parseNote(line, i, lineStart);
        tokens.push(note.token);
        i = note.nextIndex;
        continue;
      }

      // 休止符 0
      if (ch === '0') {
        const noteStart = i;
        let hasDot = false;
        let underlines = 0;
        let i2 = i + 1;
        while (i2 < line.length && (line[i2] === '.' || line[i2] === '/' || line[i2] === '=')) {
          if (line[i2] === '.') hasDot = true;
          if (line[i2] === '/') underlines++;
          if (line[i2] === '=') underlines += 2;
          i2++;
        }
        tokens.push({
          type: 'rest',
          digit: '0',
          duration: this.calculateDuration(underlines, hasDot),
          underlines: underlines,
          hasDot: hasDot,
          sourceStart: lineStart + noteStart,
          sourceEnd: lineStart + i2,
        });
        i = i2;
        continue;
      }

      // 节拍/鼓点 X
      if (ch === 'X' || ch === 'x') {
        const noteStart = i;
        let hasDot = false;
        let underlines = 0;
        let isTie = false;
        let i2 = i + 1;
        while (i2 < line.length && line[i2] !== '}') {
          const c2 = line[i2];
          if (c2 === '.') {
            hasDot = true;
            i2++;
          } else if (c2 === '/') {
            underlines++;
            i2++;
          } else if (c2 === '=') {
            underlines += 2;
            i2++;
          } else if (c2 === '~') {
            isTie = true;
            i2++;
          } else break;
        }
        tokens.push({
          type: 'beat',
          digit: 'X',
          duration: this.calculateDuration(underlines, hasDot),
          underlines: underlines,
          hasDot: hasDot,
          isTie: isTie,
          sourceStart: lineStart + noteStart,
          sourceEnd: lineStart + i2,
        });
        i = i2;
        continue;
      }

      // 遇到无法解析的字符，终止解析
      break;
    }

    // 必须有右括号
    if (i >= line.length || line[i] !== '}') return null;
    i++; // 跳过 }

    if (tokens.length === 0) return null;

    // 计算标准总时值
    let standardTotal = 0;
    for (const t of tokens) {
      if (t.type === 'note' || t.type === 'rest' || t.type === 'beat') {
        standardTotal += t.duration;
      }
    }
    if (standardTotal === 0) return null;

    // N连音实际总时值 = 标准总时值 × (N-1) / N
    // 例如三连音：3个八分音符标准总时值=1.5，实际=1.0
    const actualTotal = (standardTotal * (tupletNumber - 1)) / tupletNumber;
    const ratio = actualTotal / standardTotal;

    const groupId = 'tuplet_' + tupletNumber + '_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    for (let idx = 0; idx < tokens.length; idx++) {
      const t = tokens[idx];
      if (t.type === 'note' || t.type === 'rest' || t.type === 'beat') {
        t.duration *= ratio;
        t.tuplet = {
          number: tupletNumber,
          index: idx,
          count: tokens.length,
          groupId: groupId,
        };
      }
    }

    return {
      tokens: tokens,
      nextIndex: i,
    };
  }

  calculateDuration(underlines: number, hasDot: boolean): number {
    let duration = 1;
    if (underlines >= 3) duration = 0.125;
    else if (underlines >= 2) duration = 0.25;
    else if (underlines === 1) duration = 0.5;
    if (hasDot) duration *= 1.5;
    return duration;
  }

  parseBox(line: string, start: number, lineStart = 0) {
    if (line[start] !== '框' || line[start + 1] !== '(') return null;
    let i = start + 2;
    const innerStart = i;
    let depth = 1;

    while (i < line.length && depth > 0) {
      if (line[i] === '(') depth++;
      else if (line[i] === ')') depth--;
      i++;
    }

    if (depth !== 0) return null;

    const innerText = line.slice(innerStart, i - 1);
    const innerTokens = this.tokenize(innerText, lineStart + innerStart);

    // 给所有音符/休止符/节拍符/倚音加上同一个 boxId
    const boxId = 'box_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    for (const t of innerTokens) {
      if (['note', 'rest', 'beat', 'grace'].includes(t.type)) {
        t.boxId = boxId;
      }
    }

    return {
      tokens: innerTokens,
      nextIndex: i,
    };
  }
}

// ===== SVG 渲染辅助类 =====
