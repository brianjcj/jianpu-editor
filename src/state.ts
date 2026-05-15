export const state = {
  zoom: 1.0,
  isPlaying: false,
  audioCtx: null as AudioContext | null,
  currentSource: null as AudioBufferSourceNode | null,
  playbackStartTime: 0,
  playbackCurrentTime: 0,
  playbackNotes: [] as import('./types').PlaybackNote[],
  scheduledNotes: [] as { osc: OscillatorNode; gain: GainNode; endTime: number }[],
  totalDuration: 0,
  bpm: 120,
  key: 'C',
  timeSignature: [4, 4] as [number, number],
};

export const appConfig = {
  lineHeight: 81,
  enableMaxMeasures: false,
  maxMeasuresPerLine: null as number | null,
};

export function loadSettings() {
  try {
    const saved = localStorage.getItem('jianpu_editor_settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      appConfig.lineHeight = Math.max(40, Math.min(150, parseInt(parsed.lineHeight) || 81));
      appConfig.enableMaxMeasures = !!parsed.enableMaxMeasures;
      appConfig.maxMeasuresPerLine = appConfig.enableMaxMeasures
        ? Math.max(2, Math.min(20, parseInt(parsed.maxMeasuresPerLine) || 4))
        : null;
    }
  } catch (e) {
    /* ignore */
  }
}

export const editor = document.getElementById('editor') as HTMLTextAreaElement;
export const status = document.getElementById('status') as HTMLDivElement;
export const canvasContainer = document.getElementById('canvasContainer') as HTMLDivElement;

export const cache = {
  parseResult: null as import('./types').ParseResult | null,
};
