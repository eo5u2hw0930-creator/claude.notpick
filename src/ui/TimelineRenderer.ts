import { AudioEngine, type TrackState, type AudioClip } from '../engine/AudioEngine';

export class TimelineRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private engine: AudioEngine;
  private rulerEl: HTMLElement;
  private playheadEl: HTMLElement;
  private wrapperEl: HTMLElement;

  pixelsPerBeat = 40;
  scrollX = 0;
  scrollY = 0;
  totalBeats = 128;

  private animId = 0;
  private isDragging = false;
  private dragClip: AudioClip | null = null;
  private dragOffsetX = 0;
  private selectedClipId: string | null = null;

  onClipSelected: ((clip: AudioClip | null) => void) | null = null;
  onClipCreated: ((trackId: string, startBeat: number) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, engine: AudioEngine) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.engine = engine;
    this.rulerEl = document.getElementById('timeline-ruler')!;
    this.playheadEl = document.getElementById('playhead')!;
    this.wrapperEl = document.getElementById('timeline-canvas-wrapper')!;

    this.resize();
    this.setupEvents();
    this.startRender();
  }

  resize() {
    const rect = this.wrapperEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const totalWidth = Math.max(this.totalBeats * this.pixelsPerBeat, rect.width);
    const trackHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--track-height')) || 80;
    const totalHeight = Math.max(this.engine.tracks.length * trackHeight, rect.height);

    this.canvas.width = totalWidth * dpr;
    this.canvas.height = totalHeight * dpr;
    this.canvas.style.width = `${totalWidth}px`;
    this.canvas.style.height = `${totalHeight}px`;
    this.ctx.scale(dpr, dpr);
  }

  private setupEvents() {
    // Scroll sync
    this.wrapperEl.addEventListener('scroll', () => {
      this.scrollX = this.wrapperEl.scrollLeft;
      this.scrollY = this.wrapperEl.scrollTop;
      this.renderRuler();
      // Sync track list scroll
      const trackList = document.getElementById('track-headers');
      if (trackList) {
        trackList.style.transform = `translateY(${-this.scrollY}px)`;
      }
    });

    // Pinch zoom for stylus/touch
    let lastPinchDist = 0;
    this.wrapperEl.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastPinchDist = Math.hypot(dx, dy);
      }
    }, { passive: true });

    this.wrapperEl.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const scale = dist / lastPinchDist;
        this.pixelsPerBeat = Math.max(10, Math.min(200, this.pixelsPerBeat * scale));
        lastPinchDist = dist;
        this.resize();
      }
    }, { passive: true });

    // Mouse wheel zoom
    this.wrapperEl.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        this.pixelsPerBeat = Math.max(10, Math.min(200, this.pixelsPerBeat * zoomFactor));
        this.resize();
      }
    }, { passive: false });

    window.addEventListener('resize', () => this.resize());
  }

  handlePointerDown(x: number, y: number, tool: string) {
    const rect = this.canvas.getBoundingClientRect();
    const localX = x - rect.left + this.scrollX;
    const localY = y - rect.top;
    const trackHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--track-height')) || 80;

    const beat = localX / this.pixelsPerBeat;
    const trackIndex = Math.floor(localY / trackHeight);
    const track = this.engine.tracks[trackIndex];

    if (!track) return;

    if (tool === 'draw') {
      // Snap to nearest beat
      const snappedBeat = Math.floor(beat);
      this.onClipCreated?.(track.id, snappedBeat);
    } else if (tool === 'select') {
      // Check if we hit a clip
      const clip = this.findClipAt(track, beat);
      if (clip) {
        this.selectedClipId = clip.id;
        this.dragClip = clip;
        this.dragOffsetX = beat - clip.startBeat;
        this.isDragging = true;
        this.onClipSelected?.(clip);
      } else {
        this.selectedClipId = null;
        this.onClipSelected?.(null);
      }
    } else if (tool === 'erase') {
      const clip = this.findClipAt(track, beat);
      if (clip) {
        const idx = track.clips.indexOf(clip);
        if (idx !== -1) track.clips.splice(idx, 1);
      }
    } else if (tool === 'slice') {
      const clip = this.findClipAt(track, beat);
      if (clip) {
        const splitBeat = Math.floor(beat) - clip.startBeat;
        if (splitBeat > 0 && splitBeat < clip.durationBeats) {
          const newClip = this.engine.addClip(track.id, clip.startBeat + splitBeat, clip.durationBeats - splitBeat);
          // Move notes to new clip
          const movedNotes = clip.notes.filter(n => n.startTime >= splitBeat);
          for (const n of movedNotes) {
            newClip.notes.push({ ...n, startTime: n.startTime - splitBeat });
          }
          clip.notes = clip.notes.filter(n => n.startTime < splitBeat);
          clip.durationBeats = splitBeat;
        }
      }
    }
  }

  handlePointerMove(x: number, y: number) {
    if (!this.isDragging || !this.dragClip) return;
    const rect = this.canvas.getBoundingClientRect();
    const localX = x - rect.left + this.scrollX;
    const beat = localX / this.pixelsPerBeat - this.dragOffsetX;
    this.dragClip.startBeat = Math.max(0, Math.round(beat));
  }

  handlePointerUp() {
    this.isDragging = false;
    this.dragClip = null;
  }

  private findClipAt(track: TrackState, beat: number): AudioClip | null {
    for (const clip of track.clips) {
      if (beat >= clip.startBeat && beat < clip.startBeat + clip.durationBeats) {
        return clip;
      }
    }
    return null;
  }

  private startRender() {
    const render = () => {
      this.renderGrid();
      this.renderClips();
      this.renderPlayhead();
      this.animId = requestAnimationFrame(render);
    };
    this.animId = requestAnimationFrame(render);
  }

  private renderGrid() {
    const ctx = this.ctx;
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    const trackHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--track-height')) || 80;

    ctx.clearRect(0, 0, w, h);

    // Track rows
    for (let i = 0; i < this.engine.tracks.length; i++) {
      const y = i * trackHeight;
      ctx.fillStyle = i % 2 === 0 ? '#1a1a2e' : '#1e1e36';
      ctx.fillRect(0, y, w, trackHeight);
      ctx.strokeStyle = '#2a3456';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + trackHeight);
      ctx.lineTo(w, y + trackHeight);
      ctx.stroke();
    }

    // Beat lines
    const beatsPerBar = this.engine.timeSignature[0];
    const startBeat = Math.floor(this.scrollX / this.pixelsPerBeat);
    const endBeat = Math.ceil((this.scrollX + w) / this.pixelsPerBeat);

    for (let beat = startBeat; beat <= endBeat; beat++) {
      const x = beat * this.pixelsPerBeat;
      const isBar = beat % beatsPerBar === 0;
      ctx.strokeStyle = isBar ? '#3a4476' : '#252a42';
      ctx.lineWidth = isBar ? 1.5 : 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Loop region
    if (this.engine.loopEnabled) {
      const loopStartX = this.engine.loopStart * this.pixelsPerBeat;
      const loopEndX = this.engine.loopEnd * this.pixelsPerBeat;
      ctx.fillStyle = 'rgba(233, 69, 96, 0.08)';
      ctx.fillRect(loopStartX, 0, loopEndX - loopStartX, h);
      ctx.strokeStyle = 'rgba(233, 69, 96, 0.3)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(loopStartX, 0);
      ctx.lineTo(loopStartX, h);
      ctx.moveTo(loopEndX, 0);
      ctx.lineTo(loopEndX, h);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  private renderClips() {
    const ctx = this.ctx;
    const trackHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--track-height')) || 80;

    for (let i = 0; i < this.engine.tracks.length; i++) {
      const track = this.engine.tracks[i];
      const y = i * trackHeight;

      for (const clip of track.clips) {
        const x = clip.startBeat * this.pixelsPerBeat;
        const w = clip.durationBeats * this.pixelsPerBeat;
        const clipH = trackHeight - 4;
        const isSelected = clip.id === this.selectedClipId;

        // Clip background
        ctx.fillStyle = clip.color + '40';
        ctx.strokeStyle = isSelected ? '#fff' : clip.color + '80';
        ctx.lineWidth = isSelected ? 2 : 1;

        const radius = 6;
        ctx.beginPath();
        ctx.moveTo(x + radius, y + 2);
        ctx.lineTo(x + w - radius, y + 2);
        ctx.quadraticCurveTo(x + w, y + 2, x + w, y + 2 + radius);
        ctx.lineTo(x + w, y + 2 + clipH - radius);
        ctx.quadraticCurveTo(x + w, y + 2 + clipH, x + w - radius, y + 2 + clipH);
        ctx.lineTo(x + radius, y + 2 + clipH);
        ctx.quadraticCurveTo(x, y + 2 + clipH, x, y + 2 + clipH - radius);
        ctx.lineTo(x, y + 2 + radius);
        ctx.quadraticCurveTo(x, y + 2, x + radius, y + 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Clip name
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.font = '11px -apple-system, sans-serif';
        ctx.fillText(clip.name, x + 6, y + 16);

        // Mini note visualization
        if (clip.notes.length > 0) {
          const noteAreaY = y + 22;
          const noteAreaH = clipH - 24;
          const pitches = clip.notes.map(n => n.pitch);
          const minPitch = Math.min(...pitches);
          const maxPitch = Math.max(...pitches);
          const pitchRange = Math.max(maxPitch - minPitch, 12);

          for (const note of clip.notes) {
            const nx = x + (note.startTime / clip.durationBeats) * w;
            const nw = Math.max(2, (note.duration / clip.durationBeats) * w);
            const ny = noteAreaY + noteAreaH - ((note.pitch - minPitch) / pitchRange) * noteAreaH;
            const nh = Math.max(2, noteAreaH / pitchRange);

            ctx.fillStyle = clip.color + 'aa';
            ctx.fillRect(nx, ny, nw, nh);
          }
        }
      }
    }
  }

  renderRuler() {
    const ruler = this.rulerEl;
    const w = ruler.clientWidth;
    const beatsPerBar = this.engine.timeSignature[0];

    let html = '';
    const startBeat = Math.floor(this.scrollX / this.pixelsPerBeat);
    const endBeat = Math.ceil((this.scrollX + w) / this.pixelsPerBeat) + 1;

    for (let beat = startBeat; beat <= endBeat; beat++) {
      const x = beat * this.pixelsPerBeat - this.scrollX;
      const isBar = beat % beatsPerBar === 0;
      if (isBar) {
        const bar = Math.floor(beat / beatsPerBar) + 1;
        html += `<div style="position:absolute;left:${x}px;top:0;height:100%;border-left:1px solid #3a4476;padding-left:4px;font-size:10px;color:#8892b0;line-height:32px;">${bar}</div>`;
      } else {
        html += `<div style="position:absolute;left:${x}px;top:60%;height:40%;border-left:1px solid #252a42;"></div>`;
      }
    }
    ruler.innerHTML = html;
  }

  private renderPlayhead() {
    if (this.engine.playbackState === 'stopped' && this.engine.currentBeat === 0) {
      this.playheadEl.style.display = 'none';
      return;
    }
    this.playheadEl.style.display = '';
    const beat = this.engine.getCurrentBeat();
    const x = beat * this.pixelsPerBeat;
    this.playheadEl.style.left = `${x}px`;
  }

  getSelectedClipId(): string | null {
    return this.selectedClipId;
  }

  dispose() {
    cancelAnimationFrame(this.animId);
  }
}
