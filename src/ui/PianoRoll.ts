import { AudioEngine, type AudioClip, type NoteEvent, noteToName, genId } from '../engine/AudioEngine';

export class PianoRoll {
  private engine: AudioEngine;
  private container: HTMLElement;
  private keysEl: HTMLElement | null = null;
  private gridWrapper: HTMLElement | null = null;
  private gridEl: HTMLElement | null = null;

  private activeClip: AudioClip | null = null;
  private noteEls = new Map<string, HTMLElement>();

  pixelsPerBeat = 60;
  noteHeight = 16;
  minPitch = 36;  // C2
  maxPitch = 96;  // C7
  snapBeats = 0.25; // snap to 16th notes
  currentTool: 'select' | 'draw' | 'erase' = 'draw';

  private isDragging = false;
  private dragNote: NoteEvent | null = null;
  private dragMode: 'move' | 'resize' | 'velocity' = 'move';
  private dragStartX = 0;
  private dragStartY = 0;
  private dragOrigBeat = 0;
  private dragOrigPitch = 0;

  constructor(engine: AudioEngine, container: HTMLElement) {
    this.engine = engine;
    this.container = container;
    this.buildUI();
  }

  buildUI() {
    this.container.innerHTML = '';

    // Piano keys column
    this.keysEl = document.createElement('div');
    this.keysEl.className = 'piano-keys';
    this.container.appendChild(this.keysEl);

    // Grid area
    this.gridWrapper = document.createElement('div');
    this.gridWrapper.className = 'piano-roll-grid-wrapper';
    this.container.appendChild(this.gridWrapper);

    this.gridEl = document.createElement('div');
    this.gridEl.className = 'piano-roll-grid';
    this.gridWrapper.appendChild(this.gridEl);

    this.renderKeys();
    this.setupGridEvents();
  }

  private renderKeys() {
    if (!this.keysEl) return;
    this.keysEl.innerHTML = '';
    const blackNotes = new Set([1, 3, 6, 8, 10]);

    for (let pitch = this.maxPitch; pitch >= this.minPitch; pitch--) {
      const key = document.createElement('div');
      key.className = 'piano-key' + (blackNotes.has(pitch % 12) ? ' black' : '');
      key.textContent = pitch % 12 === 0 ? noteToName(pitch) : '';
      key.style.height = `${this.noteHeight}px`;
      key.style.minHeight = `${this.noteHeight}px`;

      // Play note on touch
      key.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.engine.playNote(pitch, 100, 0.3);
      });

      this.keysEl!.appendChild(key);
    }
  }

  private setupGridEvents() {
    if (!this.gridEl) return;

    this.gridEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const { beat, pitch } = this.coordsToNote(e.clientX, e.clientY);

      if (this.currentTool === 'draw') {
        this.handleDraw(beat, pitch, e.pressure);
      } else if (this.currentTool === 'erase') {
        this.handleErase(beat, pitch);
      } else if (this.currentTool === 'select') {
        this.handleSelect(beat, pitch, e);
      }
    });

    this.gridEl.addEventListener('pointermove', (e) => {
      if (!this.isDragging) return;
      e.preventDefault();

      const { beat, pitch } = this.coordsToNote(e.clientX, e.clientY);

      if (this.dragMode === 'move' && this.dragNote) {
        const deltaBeat = beat - this.dragStartX;
        const deltaPitch = pitch - this.dragStartY;
        this.dragNote.startTime = Math.max(0, this.snap(this.dragOrigBeat + deltaBeat));
        this.dragNote.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.dragOrigPitch + deltaPitch));
        this.renderNotes();
      } else if (this.dragMode === 'velocity' && this.dragNote) {
        // Use stylus pressure for velocity
        const velocity = Math.round(Math.max(1, Math.min(127, e.pressure * 127 || this.dragNote.velocity)));
        this.dragNote.velocity = velocity;
        this.renderNotes();
      }
    });

    this.gridEl.addEventListener('pointerup', () => {
      this.isDragging = false;
      this.dragNote = null;
    });

    this.gridEl.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private handleDraw(beat: number, pitch: number, pressure: number) {
    if (!this.activeClip) return;
    const snapped = this.snap(beat);
    const velocity = pressure > 0 ? Math.round(Math.max(30, Math.min(127, pressure * 127))) : 100;

    const note: NoteEvent = {
      id: genId('note'),
      pitch,
      startTime: snapped,
      duration: this.snapBeats,
      velocity,
      trackId: this.activeClip.trackId,
    };

    this.activeClip.notes.push(note);
    this.engine.playNote(pitch, velocity, 0.15);
    this.renderNotes();
  }

  private handleErase(beat: number, pitch: number) {
    if (!this.activeClip) return;
    const idx = this.activeClip.notes.findIndex(n =>
      n.pitch === pitch &&
      beat >= n.startTime &&
      beat < n.startTime + n.duration
    );
    if (idx !== -1) {
      this.activeClip.notes.splice(idx, 1);
      this.renderNotes();
    }
  }

  private handleSelect(beat: number, pitch: number, e: PointerEvent) {
    if (!this.activeClip) return;
    const note = this.activeClip.notes.find(n =>
      n.pitch === pitch &&
      beat >= n.startTime &&
      beat < n.startTime + n.duration
    );

    if (note) {
      this.isDragging = true;
      this.dragNote = note;
      this.dragMode = e.pointerType === 'pen' && e.pressure > 0.8 ? 'velocity' : 'move';
      this.dragStartX = beat;
      this.dragStartY = pitch;
      this.dragOrigBeat = note.startTime;
      this.dragOrigPitch = note.pitch;
      this.gridEl!.setPointerCapture(e.pointerId);
    }
  }

  private coordsToNote(clientX: number, clientY: number) {
    const rect = this.gridEl!.getBoundingClientRect();
    const scrollLeft = this.gridWrapper!.scrollLeft;
    const x = clientX - rect.left + scrollLeft;
    const y = clientY - rect.top;

    const beat = x / this.pixelsPerBeat;
    const noteIdx = Math.floor(y / this.noteHeight);
    const pitch = this.maxPitch - noteIdx;

    return { beat: Math.max(0, beat), pitch: Math.max(this.minPitch, Math.min(this.maxPitch, pitch)) };
  }

  private snap(beat: number): number {
    return Math.round(beat / this.snapBeats) * this.snapBeats;
  }

  setClip(clip: AudioClip | null) {
    this.activeClip = clip;
    this.renderGrid();
    this.renderNotes();
  }

  renderGrid() {
    if (!this.gridEl) return;

    const totalPitches = this.maxPitch - this.minPitch + 1;
    const clipDuration = this.activeClip?.durationBeats || 16;
    const totalBeats = Math.max(clipDuration + 4, 16);
    const width = totalBeats * this.pixelsPerBeat;
    const height = totalPitches * this.noteHeight;

    this.gridEl.style.width = `${width}px`;
    this.gridEl.style.height = `${height}px`;
    this.gridEl.style.position = 'relative';
    this.gridEl.style.background = '#0a0a0f';

    // Build grid lines using canvas-like approach with divs
    const blackNotes = new Set([1, 3, 6, 8, 10]);
    let gridHTML = '';

    // Row backgrounds (black keys darker)
    for (let i = 0; i < totalPitches; i++) {
      const pitch = this.maxPitch - i;
      const isBlack = blackNotes.has(pitch % 12);
      const isC = pitch % 12 === 0;
      const y = i * this.noteHeight;
      const bg = isBlack ? 'rgba(0,0,0,0.3)' : 'transparent';
      const border = isC ? '1px solid #2a2a55' : '1px solid #161630';
      gridHTML += `<div style="position:absolute;left:0;top:${y}px;width:100%;height:${this.noteHeight}px;background:${bg};border-bottom:${border};"></div>`;
    }

    // Beat lines
    const beatsPerBar = this.engine.timeSignature[0];
    for (let b = 0; b <= totalBeats; b += this.snapBeats) {
      const x = b * this.pixelsPerBeat;
      const isBar = b % beatsPerBar === 0;
      const isBeat = b % 1 === 0;
      const color = isBar ? '#2a2a55' : (isBeat ? '#1a1a35' : '#141428');
      const w = isBar ? 1.5 : 0.5;
      gridHTML += `<div style="position:absolute;left:${x}px;top:0;width:${w}px;height:100%;background:${color};"></div>`;
    }

    this.gridEl.innerHTML = gridHTML;
  }

  renderNotes() {
    if (!this.gridEl || !this.activeClip) return;

    // Remove old note elements
    this.noteEls.forEach(el => el.remove());
    this.noteEls.clear();

    for (const note of this.activeClip.notes) {
      const x = note.startTime * this.pixelsPerBeat;
      const y = (this.maxPitch - note.pitch) * this.noteHeight;
      const w = note.duration * this.pixelsPerBeat;

      const el = document.createElement('div');
      el.className = 'piano-roll-note';
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.width = `${w}px`;
      el.style.height = `${this.noteHeight - 1}px`;
      el.style.opacity = `${0.5 + (note.velocity / 127) * 0.5}`;

      const velBar = document.createElement('div');
      velBar.className = 'velocity-bar';
      velBar.style.width = `${(note.velocity / 127) * 100}%`;
      el.appendChild(velBar);

      this.gridEl.appendChild(el);
      this.noteEls.set(note.id, el);
    }
  }

  setTool(tool: 'select' | 'draw' | 'erase') {
    this.currentTool = tool;
  }

  dispose() {
    this.noteEls.forEach(el => el.remove());
    this.noteEls.clear();
  }
}
