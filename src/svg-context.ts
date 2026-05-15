import type { ParsedFont, SVGState } from './types';

export function parseFont(fontStr: string): ParsedFont {
  let s = fontStr.trim();
  let weight = 'normal';
  let style = 'normal';

  if (/^italic\s+/i.test(s)) {
    style = 'italic';
    s = s.replace(/^italic\s+/i, '');
  }

  const wMatch = s.match(/^(bold|bolder|lighter|\d{3})\s+/i);
  if (wMatch) {
    weight = wMatch[1].toLowerCase();
    s = s.replace(/^(bold|bolder|lighter|\d{3})\s+/i, '');
  }

  const sizeMatch = s.match(/^(\d+(?:\.\d+)?)\s*px\s+/i);
  const size = sizeMatch ? sizeMatch[1] : '10';
  if (sizeMatch) s = s.slice(sizeMatch[0].length);

  let family = s.trim().replace(/["']/g, '');
  return { weight, style, size, family };
}

export function escAttr(str: string): string {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

export function escXml(str: string): string {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function fmt(n: number): string {
  return String(parseFloat(n.toFixed(3)));
}

export class SVGContext {
  viewBoxW: number;
  viewBoxH: number;
  elements: string[];
  private _fillStyle = '#000';
  private _strokeStyle = '#000';
  private _font = '10px sans-serif';
  private _textAlign = 'start';
  private _textBaseline = 'alphabetic';
  private _lineWidth = 1;
  private _globalAlpha = 1;
  private _currentPath: string | null = null;
  private _stateStack: SVGState[] = [];

  constructor(viewBoxW: number, viewBoxH: number) {
    this.viewBoxW = viewBoxW;
    this.viewBoxH = viewBoxH;
    this.elements = [];
  }

  set fillStyle(v: string) {
    this._fillStyle = v;
  }
  get fillStyle(): string {
    return this._fillStyle;
  }
  set strokeStyle(v: string) {
    this._strokeStyle = v;
  }
  get strokeStyle(): string {
    return this._strokeStyle;
  }
  set font(v: string) {
    this._font = v;
  }
  get font(): string {
    return this._font;
  }
  set textAlign(v: string) {
    this._textAlign = v;
  }
  get textAlign(): string {
    return this._textAlign;
  }
  set textBaseline(v: string) {
    this._textBaseline = v;
  }
  get textBaseline(): string {
    return this._textBaseline;
  }
  set lineWidth(v: number) {
    this._lineWidth = v;
  }
  get lineWidth(): number {
    return this._lineWidth;
  }
  set globalAlpha(v: number) {
    this._globalAlpha = v;
  }
  get globalAlpha(): number {
    return this._globalAlpha;
  }

  save() {
    this._stateStack.push({
      fillStyle: this._fillStyle,
      strokeStyle: this._strokeStyle,
      font: this._font,
      textAlign: this._textAlign,
      textBaseline: this._textBaseline,
      lineWidth: this._lineWidth,
    });
  }

  restore() {
    const s = this._stateStack.pop();
    if (s) {
      this._fillStyle = s.fillStyle;
      this._strokeStyle = s.strokeStyle;
      this._font = s.font;
      this._textAlign = s.textAlign;
      this._textBaseline = s.textBaseline;
      this._lineWidth = s.lineWidth;
    }
  }

  beginPath() {
    this._currentPath = '';
  }
  moveTo(x: number, y: number) {
    this._currentPath += `M ${fmt(x)} ${fmt(y)} `;
  }
  lineTo(x: number, y: number) {
    this._currentPath += `L ${fmt(x)} ${fmt(y)} `;
  }
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number) {
    this._currentPath += `Q ${fmt(cpx)} ${fmt(cpy)} ${fmt(x)} ${fmt(y)} `;
  }
  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) {
    this._currentPath += `C ${fmt(cp1x)} ${fmt(cp1y)} ${fmt(cp2x)} ${fmt(cp2y)} ${fmt(x)} ${fmt(y)} `;
  }
  arc(x: number, y: number, r: number, sAngle: number, eAngle: number) {
    const delta = Math.abs(eAngle - sAngle);
    // 完整圆：SVG 的 A 命令在起点终点重合时无法渲染，需拆成两个半圆
    if (delta >= Math.PI * 2 - 0.0001) {
      const x1 = x + r * Math.cos(sAngle);
      const y1 = y + r * Math.sin(sAngle);
      const xm = x + r * Math.cos(sAngle + Math.PI);
      const ym = y + r * Math.sin(sAngle + Math.PI);
      const x2 = x + r * Math.cos(eAngle);
      const y2 = y + r * Math.sin(eAngle);
      this._currentPath += `M ${fmt(x1)} ${fmt(y1)} A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(xm)} ${fmt(ym)} A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(x2)} ${fmt(y2)} `;
      return;
    }
    const largeArc = delta > Math.PI ? 1 : 0;
    const sweep = eAngle > sAngle ? 1 : 0;
    const x1 = x + r * Math.cos(sAngle);
    const y1 = y + r * Math.sin(sAngle);
    const x2 = x + r * Math.cos(eAngle);
    const y2 = y + r * Math.sin(eAngle);
    this._currentPath += `M ${fmt(x1)} ${fmt(y1)} A ${fmt(r)} ${fmt(r)} 0 ${largeArc} ${sweep} ${fmt(x2)} ${fmt(y2)} `;
  }
  closePath() {
    this._currentPath += 'Z ';
  }

  fill() {
    if (!this._currentPath) return;
    this.elements.push(
      `<path d="${this._currentPath.trim()}" fill="${escAttr(this._fillStyle)}" opacity="${this._globalAlpha}"/>`
    );
    this._currentPath = null;
  }

  stroke() {
    if (!this._currentPath) return;
    this.elements.push(
      `<path d="${this._currentPath.trim()}" fill="none" stroke="${escAttr(this._strokeStyle)}" stroke-width="${fmt(this._lineWidth)}" opacity="${this._globalAlpha}" stroke-linecap="round" stroke-linejoin="round"/>`
    );
    this._currentPath = null;
  }

  fillRect(x: number, y: number, w: number, h: number) {
    this.elements.push(
      `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" fill="${escAttr(this._fillStyle)}" opacity="${this._globalAlpha}"/>`
    );
  }

  strokeRect(x: number, y: number, w: number, h: number) {
    this.elements.push(
      `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" fill="none" stroke="${escAttr(this._strokeStyle)}" stroke-width="${fmt(this._lineWidth)}" opacity="${this._globalAlpha}"/>`
    );
  }

  clearRect(_x: number, _y: number, _w: number, _h: number) {}

  fillText(text: string, x: number, y: number) {
    const f = parseFont(this._font);
    const anchor = this._textAlign === 'center' ? 'middle' : this._textAlign === 'right' ? 'end' : 'start';
    const baseline =
      this._textBaseline === 'middle' ? 'central' : this._textBaseline === 'bottom' ? 'text-bottom' : 'hanging';
    this.elements.push(
      `<text x="${fmt(x)}" y="${fmt(y)}" fill="${escAttr(this._fillStyle)}" font-family="${escAttr(f.family)}" font-size="${f.size}" font-weight="${f.weight}" font-style="${f.style}" text-anchor="${anchor}" dominant-baseline="${baseline}" opacity="${this._globalAlpha}">${escXml(text)}</text>`
    );
  }

  strokeText(text: string, x: number, y: number) {
    const f = parseFont(this._font);
    const anchor = this._textAlign === 'center' ? 'middle' : this._textAlign === 'right' ? 'end' : 'start';
    const baseline =
      this._textBaseline === 'middle' ? 'central' : this._textBaseline === 'bottom' ? 'text-bottom' : 'hanging';
    this.elements.push(
      `<text x="${fmt(x)}" y="${fmt(y)}" fill="none" stroke="${escAttr(this._strokeStyle)}" stroke-width="${fmt(this._lineWidth)}" font-family="${escAttr(f.family)}" font-size="${f.size}" font-weight="${f.weight}" font-style="${f.style}" text-anchor="${anchor}" dominant-baseline="${baseline}" opacity="${this._globalAlpha}">${escXml(text)}</text>`
    );
  }

  measureText(text: string) {
    const f = parseFont(this._font);
    const em = parseFloat(f.size) || 10;
    return { width: text.length * em * 0.6 };
  }

  getSVG(): string {
    const vb = `0 0 ${this.viewBoxW} ${this.viewBoxH}`;
    const content = this.elements.join('\n  ');
    const widthMm = 210;
    const heightMm = (this.viewBoxH / this.viewBoxW) * widthMm;
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}mm" height="${heightMm}mm" viewBox="${vb}">\n  ${content}\n</svg>`;
  }
}
