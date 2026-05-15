// ===== 解析器类型 =====

export interface BaseToken {
  type: string;
  sourceStart: number;
  sourceEnd: number;
  note?: string;
  boxId?: string;
}

export interface NoteToken extends BaseToken {
  type: 'note';
  digit: string;
  octave: number;
  accidental: string;
  duration: number;
  underlines: number;
  hasDot: boolean;
  isTie: boolean;
  technique?: string;
  slideFrom?: {
    digit: string;
    octave: number;
    accidental: string;
  };
}

export interface RestToken extends BaseToken {
  type: 'rest';
  duration: number;
  underlines: number;
  hasDot: boolean;
  isExtension?: boolean;
}

export interface BeatToken extends BaseToken {
  type: 'beat';
  digit: 'X';
  duration: number;
  underlines: number;
  hasDot: boolean;
  isTie: boolean;
}

export interface GraceToken extends BaseToken {
  type: 'grace';
  digit: string;
  octave: number;
  accidental: string;
  underlines: number;
  duration: number;
  technique?: string;
}

export interface BarlineToken extends BaseToken {
  type: 'barline';
  isDouble: boolean;
  repeatStart?: boolean;
  repeatEnd?: boolean;
}

export interface VoltaStartToken extends BaseToken {
  type: 'voltaStart';
  number: number;
}

export interface VoltaEndToken extends BaseToken {
  type: 'voltaEnd';
}

export type FlowToken = BaseToken & { type: 'segno' | 'coda' | 'toCoda' | 'dc' | 'ds' | 'fine' };

export type Token =
  | NoteToken
  | RestToken
  | BeatToken
  | GraceToken
  | BarlineToken
  | VoltaStartToken
  | VoltaEndToken
  | FlowToken;

export interface Measure {
  notes: Token[];
  isDouble: boolean;
  repeatStart: boolean;
  repeatEnd: boolean;
  voltaStart: number | null;
  voltaEnd: boolean;
  segno: boolean;
  coda: boolean;
  toCoda: boolean;
  dc: boolean;
  ds: boolean;
  fine: boolean;
  sourceStart: number;
  sourceEnd: number;
}

export interface OpenString {
  digit: string;
  octave: number;
  accidental: string;
}

export interface GlobalSettings {
  bpm: number;
  key: string;
  timeSignature: [number, number];
  title: string;
  openStrings?: OpenString[];
}

export interface ParseResult {
  measures: Measure[];
  flatMeasures: Measure[];
  settings: GlobalSettings;
}

// ===== 播放类型 =====

export interface PlaybackNote {
  frequency: number;
  startTime: number;
  duration: number;
  digit: string;
  octave: number;
  accidental: string;
  noteLabel?: string;
  isBeat?: boolean;
  isGrace?: boolean;
  slideFrom?: {
    digit: string;
    octave: number;
    accidental: string;
    frequency: number;
  };
  slideDuration?: number;
}

// ===== 渲染类型 =====

export interface RenderOptions {
  scale?: number;
  pageInfo?: PageInfo | null;
}

export interface PageInfo {
  pageIndex: number;
  actualHeight: number;
  lineIndices?: number[];
  totalPages?: number;
}

export interface ClickMapItem {
  type: 'note' | 'measure';
  x: number;
  y: number;
  width: number;
  height: number;
  sourceStart: number;
  sourceEnd: number;
}

export interface NotePosition {
  x: number;
  left: number;
  width: number;
}

export interface NoteGroup {
  indices: number[];
  underlines: number;
  isTuplet: boolean;
}

export interface RendererConfig {
  noteSize: number;
  lineHeight: number;
  measureGap: number;
  noteGap: number;
  marginX: number;
  marginY: number;
  titleSize: number;
  subtitleSize: number;
  dotRadius: number;
  underlineHeight: number;
  barlineWidth: number;
  maxMeasuresPerLine: number | null;
}

// ===== SVG 辅助类型 =====

export interface ParsedFont {
  weight: string;
  style: string;
  size: string;
  family: string;
}

export interface SVGState {
  fillStyle: string;
  strokeStyle: string;
  font: string;
  textAlign: string;
  textBaseline: string;
  lineWidth: number;
}
