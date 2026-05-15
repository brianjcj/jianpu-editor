import { state, status } from './state';
import { NOTE_FREQUENCIES } from './constants';
import type { PlaybackNote } from './types';

declare function render(): void;

export class JianPuPlayer {
  audioCtx: AudioContext | null;
  isPlaying: boolean;
  currentSources: { osc: OscillatorNode; gain: GainNode; endTime: number }[];
  masterGain: GainNode | null;
  volume: number;
  totalDuration: number;
  playbackOffset: number;
  _cleanupTimer: ReturnType<typeof setTimeout> | null;
  _progressTimer: ReturnType<typeof setInterval> | null;
  silentAudio: HTMLAudioElement;
  streamDest: MediaStreamAudioDestinationNode | null;
  keeperOsc: OscillatorNode | null;
  keeperGain: GainNode | null;

  constructor() {
    this.audioCtx = null;
    this.isPlaying = false;
    this.currentSources = [];
    this.masterGain = null;
    this.volume = 0.7;
    this.totalDuration = 0;
    this.playbackOffset = 0;
    this._cleanupTimer = null;
    this._progressTimer = null;
    // 隐藏音频元素，用于维持 iOS 后台媒体会话，防止熄屏后 AudioContext 被挂起
    this.silentAudio = new Audio();
    this.silentAudio.loop = true;
    (this.silentAudio as any).playsInline = true;
    this.silentAudio.setAttribute('playsinline', '');
    this.streamDest = null;
    // 用于后台保持的独立振荡器（避免与主音频混合产生杂音）
    this.keeperOsc = null;
    this.keeperGain = null;
  }

  initAudio() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.audioCtx!.createGain();
      this.masterGain.connect(this.audioCtx.destination);
      // 监听状态变化，自动恢复被挂起的 AudioContext
      this.audioCtx.onstatechange = () => {
        if (this.audioCtx && this.audioCtx.state !== 'running' && this.isPlaying) {
          this.audioCtx.resume().catch(() => {});
        }
      };
    }
    // 创建 MediaStreamDestination（之前被 stop 清理后需要重建）
    if (this.audioCtx && !this.streamDest && this.audioCtx.createMediaStreamDestination) {
      this.streamDest = this.audioCtx!.createMediaStreamDestination();
    }
    // 将隐藏 audio 元素绑定到媒体流（必须在用户交互后执行；audioCtx 已存在时也要重新绑定）
    if (this.streamDest && !this.silentAudio.srcObject) {
      this.silentAudio.srcObject = this.streamDest.stream;
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.volume, this.audioCtx.currentTime);
    }
  }

  play(notes: PlaybackNote[], totalDuration: number) {
    this.stop(true, false, true);
    this.initAudio();

    const now = this.audioCtx.currentTime;
    let offset = this.playbackOffset || 0;
    if (offset >= totalDuration) {
      this.playbackOffset = 0;
      offset = 0;
    }
    this.isPlaying = true;
    this.totalDuration = totalDuration;
    state.playbackStartTime = now - offset;
    state.isPlaying = true;

    // 播放进度条
    document.getElementById('playbackBar').style.display = 'block';

    for (const note of notes) {
      if (note.frequency <= 0 && !note.isBeat) continue;
      if (note.startTime < offset) continue;

      const osc = this.audioCtx!.createOscillator();
      const gain = this.audioCtx!.createGain();

      osc.connect(gain);
      gain.connect(this.masterGain || this.audioCtx.destination);

      const startTime = now + (note.startTime - offset);
      const endTime = startTime + note.duration;

      // 节点结束后自动清理引用，防止长曲堆积
      const sourceRef = { osc, gain, endTime };
      const removeSelf = () => {
        try {
          osc.disconnect();
        } catch (e) {}
        try {
          gain.disconnect();
        } catch (e) {}
        const idx = this.currentSources.indexOf(sourceRef);
        if (idx !== -1) this.currentSources.splice(idx, 1);
      };
      osc.onended = removeSelf;

      if (note.isBeat) {
        // 鼓点：用三角波模拟打击乐，短促有力
        osc.type = 'triangle';
        osc.frequency.value = 120;
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.6 * this.volume, startTime + 0.005); // 极快 Attack
        gain.gain.linearRampToValueAtTime(0, startTime + 0.08); // 快速衰减
        osc.start(startTime);
        osc.stop(startTime + 0.1);
      } else {
        osc.type = 'sine';
        if (note.slideFrom && note.slideFrom.frequency > 0) {
          const slideDur = note.slideDuration || note.duration * 0.5;
          osc.frequency.setValueAtTime(note.slideFrom.frequency, startTime);
          osc.frequency.linearRampToValueAtTime(note.frequency, startTime + slideDur);
        } else {
          osc.frequency.setValueAtTime(note.frequency, startTime);
        }

        // ADSR 包络 + 自然结束淡出
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.7 * this.volume, startTime + 0.02); // Attack
        gain.gain.setValueAtTime(0.7 * this.volume, endTime - 0.05); // Sustain
        gain.gain.linearRampToValueAtTime(0, endTime); // Release

        osc.start(startTime);
        // 让增益节点控制结束，振荡器多留一点尾巴
        osc.stop(endTime + 0.02);
      }

      this.currentSources.push(sourceRef);
    }

    // 启动一个独立且极弱的振荡器喂给 MediaStream，维持 iOS 后台媒体会话
    // 主音频图不再连接 streamDest，避免双重输出导致音质变差/杂音
    if (this.streamDest) {
      this.keeperOsc = this.audioCtx!.createOscillator();
      this.keeperGain = this.audioCtx!.createGain();
      this.keeperOsc.frequency.value = 1; // 1Hz，远低于人耳下限，基本不可闻
      this.keeperGain.gain.value = 0.0001; // -80dB，极微弱
      this.keeperOsc.connect(this.keeperGain);
      this.keeperGain.connect(this.streamDest);
      this.keeperOsc.start();
      this.silentAudio.play().catch(() => {});
    }
    // 设置锁屏媒体信息
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: '简谱播放中',
        artist: '简谱编辑器',
        album: '',
      });
    }

    // 进度更新（由 RAF 轮询驱动，自然结束时自动停止）
    this.updateProgress(totalDuration);
  }

  updateProgress(totalDuration: number) {
    const progressBar = document.getElementById('playbackProgress');
    // 100ms 间隔更新进度条和重绘，比 RAF (60fps) 减少 6 倍绘制开销
    this._progressTimer = setInterval(() => {
      if (!this.isPlaying || !this.audioCtx) {
        this._clearProgressTimer();
        return;
      }
      const elapsed = this.audioCtx.currentTime - state.playbackStartTime;
      state.playbackCurrentTime = elapsed;
      const progress = Math.min((elapsed / totalDuration) * 100, 100);
      progressBar.style.width = progress + '%';

      render(); // 重绘以更新高亮（main.ts 已挂载缓存版本）

      if (progress >= 100) {
        this._clearProgressTimer();
        this.stop(false, true, true);
        this._resetPlayButton();
      }
    }, 100);
  }

  _clearProgressTimer() {
    if (this._progressTimer) {
      clearInterval(this._progressTimer);
      this._progressTimer = null;
    }
  }

  _resetPlayButton() {
    const btnPlay = document.getElementById('btnPlay');
    if (btnPlay) {
      btnPlay.innerHTML =
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> 播放';
      btnPlay.classList.remove('btn-active');
    }
  }

  stop(immediate = false, resetOffset = true, releaseAudio = true) {
    const wasPlaying = this.isPlaying;
    this.isPlaying = false;
    state.isPlaying = false;
    state.playbackCurrentTime = -1;
    render();

    if (!immediate && wasPlaying && this.audioCtx) {
      this.playbackOffset = Math.max(0, this.audioCtx.currentTime - state.playbackStartTime);
    }
    if (resetOffset) {
      this.playbackOffset = 0;
    }

    if (this._cleanupTimer) {
      clearTimeout(this._cleanupTimer);
      this._cleanupTimer = null;
    }
    this._clearProgressTimer();

    if (immediate) {
      // 立即强制停止（play() 开头调用，清理旧资源）
      for (const source of this.currentSources) {
        try {
          source.osc.onended = null;
          source.osc.stop();
          source.osc.disconnect();
          source.gain.disconnect();
        } catch (e) {}
      }
      this.currentSources = [];
    } else {
      // 用户手动停止或自然结束：平滑淡出
      const now = this.audioCtx ? this.audioCtx.currentTime : 0;

      for (const source of this.currentSources) {
        try {
          source.osc.onended = null;
          const gain = source.gain;
          gain.gain.cancelScheduledValues(now);
          gain.gain.setValueAtTime(gain.gain.value || 0.001, now);
          gain.gain.linearRampToValueAtTime(0, now + 0.05);
          source.osc.stop(now + 0.06);
        } catch (e) {}
      }

      // 延迟清理
      this._cleanupTimer = setTimeout(() => {
        for (const source of this.currentSources) {
          try {
            source.osc.disconnect();
            source.gain.disconnect();
          } catch (e) {}
        }
        this.currentSources = [];
      }, 120);
    }

    if (releaseAudio) {
      // 停止 keeper 振荡器并清理
      if (this.keeperOsc) {
        try {
          this.keeperOsc.stop();
        } catch (e) {}
        try {
          this.keeperOsc.disconnect();
        } catch (e) {}
        this.keeperOsc = null;
      }
      if (this.keeperGain) {
        try {
          this.keeperGain.disconnect();
        } catch (e) {}
        this.keeperGain = null;
      }
      // 暂停隐藏音频并彻底断开 MediaStream，释放后台媒体会话
      this.silentAudio.pause();
      this.silentAudio.currentTime = 0;
      this.silentAudio.srcObject = null;
      try {
        this.silentAudio.load();
      } catch (e) {}
      // 停止 MediaStream 的所有轨道，确保系统媒体中心彻底移除
      if (this.streamDest && this.streamDest.stream) {
        this.streamDest.stream.getTracks().forEach(t => t.stop());
      }
      this.streamDest = null;
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = null;
        try {
          navigator.mediaSession.playbackState = 'none';
        } catch (e) {}
      }

      document.getElementById('playbackBar').style.display = 'none';
      document.getElementById('playbackProgress').style.width = '0%';
      status.textContent = '就绪';
    }
  }
}
