import { AudioEngine } from './engine/AudioEngine';
import { StylusInput } from './input/StylusInput';
import { TimelineRenderer } from './ui/TimelineRenderer';
import { PianoRoll } from './ui/PianoRoll';
import { MixerPanel } from './ui/Mixer';
import { EffectsPanel } from './ui/EffectsPanel';

class DAWApp {
  engine: AudioEngine;
  stylus: StylusInput;
  timeline: TimelineRenderer;
  pianoRoll: PianoRoll;
  mixer: MixerPanel;
  effects: EffectsPanel;

  currentTool: 'select' | 'draw' | 'erase' | 'slice' = 'select';

  constructor() {
    this.engine = new AudioEngine();

    // Create default tracks with demo content
    const track1 = this.engine.addTrack('Synth Lead', 'Synth Lead');
    const track2 = this.engine.addTrack('Bass', 'Synth Bass');
    const track3 = this.engine.addTrack('Pad', 'Synth Pad');
    const track4 = this.engine.addTrack('Pluck', 'Pluck');

    // Add demo clips with notes
    const clip1 = this.engine.addClip(track1.id, 0, 8);
    clip1.name = 'Melody';
    const melodyNotes = [
      { pitch: 72, start: 0, dur: 0.5 },
      { pitch: 74, start: 0.5, dur: 0.5 },
      { pitch: 76, start: 1, dur: 1 },
      { pitch: 79, start: 2, dur: 0.5 },
      { pitch: 77, start: 2.5, dur: 0.5 },
      { pitch: 76, start: 3, dur: 1 },
      { pitch: 72, start: 4, dur: 1 },
      { pitch: 74, start: 5, dur: 0.5 },
      { pitch: 76, start: 5.5, dur: 0.5 },
      { pitch: 79, start: 6, dur: 2 },
    ];
    for (const n of melodyNotes) {
      this.engine.addNoteToClip(clip1.id, n.pitch, n.start, n.dur, 90);
    }

    const clip2 = this.engine.addClip(track2.id, 0, 8);
    clip2.name = 'Bass Line';
    const bassNotes = [
      { pitch: 48, start: 0, dur: 1 },
      { pitch: 48, start: 1, dur: 1 },
      { pitch: 53, start: 2, dur: 1 },
      { pitch: 53, start: 3, dur: 1 },
      { pitch: 55, start: 4, dur: 1 },
      { pitch: 55, start: 5, dur: 1 },
      { pitch: 53, start: 6, dur: 2 },
    ];
    for (const n of bassNotes) {
      this.engine.addNoteToClip(clip2.id, n.pitch, n.start, n.dur, 100);
    }

    const clip3 = this.engine.addClip(track3.id, 0, 8);
    clip3.name = 'Pad Chords';
    const padNotes = [
      { pitch: 60, start: 0, dur: 4 }, { pitch: 64, start: 0, dur: 4 }, { pitch: 67, start: 0, dur: 4 },
      { pitch: 65, start: 4, dur: 4 }, { pitch: 69, start: 4, dur: 4 }, { pitch: 72, start: 4, dur: 4 },
    ];
    for (const n of padNotes) {
      this.engine.addNoteToClip(clip3.id, n.pitch, n.start, n.dur, 70);
    }

    const clip4 = this.engine.addClip(track4.id, 4, 4);
    clip4.name = 'Pluck Arp';
    const pluckNotes = [
      { pitch: 72, start: 0, dur: 0.25 },
      { pitch: 76, start: 0.25, dur: 0.25 },
      { pitch: 79, start: 0.5, dur: 0.25 },
      { pitch: 84, start: 0.75, dur: 0.25 },
      { pitch: 79, start: 1, dur: 0.25 },
      { pitch: 76, start: 1.25, dur: 0.25 },
      { pitch: 72, start: 1.5, dur: 0.25 },
      { pitch: 76, start: 1.75, dur: 0.25 },
      { pitch: 79, start: 2, dur: 0.5 },
      { pitch: 84, start: 2.5, dur: 0.5 },
      { pitch: 79, start: 3, dur: 0.5 },
      { pitch: 76, start: 3.5, dur: 0.5 },
    ];
    for (const n of pluckNotes) {
      this.engine.addNoteToClip(clip4.id, n.pitch, n.start, n.dur, 80);
    }

    // Initialize UI components
    const canvas = document.getElementById('timeline-canvas') as HTMLCanvasElement;
    this.timeline = new TimelineRenderer(canvas, this.engine);

    this.pianoRoll = new PianoRoll(
      this.engine,
      document.getElementById('piano-roll-panel')!
    );

    this.mixer = new MixerPanel(
      this.engine,
      document.getElementById('mixer-panel')!
    );

    this.effects = new EffectsPanel(
      this.engine,
      document.getElementById('effects-panel')!
    );

    // Set up stylus input on canvas
    this.stylus = new StylusInput(canvas);

    this.setupToolbar();
    this.setupTransport();
    this.setupTrackList();
    this.setupPanelTabs();
    this.setupStylusInteraction();

    // Initial render
    this.renderTrackHeaders();
    this.timeline.renderRuler();
    this.mixer.render();
    this.effects.render();

    // Callbacks
    this.timeline.onClipSelected = (clip) => {
      if (clip) {
        this.pianoRoll.setClip(clip);
      }
    };

    this.timeline.onClipCreated = (trackId, startBeat) => {
      const newClip = this.engine.addClip(trackId, startBeat, 4);
      this.pianoRoll.setClip(newClip);
      this.timeline.resize();
    };

    // Listen to engine events
    this.engine.on('trackAdded', () => {
      this.renderTrackHeaders();
      this.mixer.render();
      this.timeline.resize();
    });

    this.engine.on('beatChanged', (beat: number) => {
      this.updateTimeDisplay(beat);
    });

    this.engine.on('playbackStateChanged', () => {
      this.updateTransportButtons();
    });
  }

  private setupToolbar() {
    const tools = ['select', 'draw', 'erase', 'slice'] as const;
    for (const tool of tools) {
      const btn = document.getElementById(`tool-${tool}`);
      btn?.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.currentTool = tool;
        document.querySelectorAll('.tool-selector .tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.pianoRoll.setTool(tool === 'slice' ? 'select' : tool);
      });
    }

    // Piano Roll button
    document.getElementById('btn-piano-roll')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.switchPanel('piano-roll');
    });

    // BPM input
    const bpmInput = document.getElementById('bpm-input') as HTMLInputElement;
    bpmInput?.addEventListener('change', () => {
      const val = parseInt(bpmInput.value);
      if (val >= 20 && val <= 300) {
        this.engine.bpm = val;
      }
    });

    // Time signature
    const timeSig = document.getElementById('time-sig') as HTMLSelectElement;
    timeSig?.addEventListener('change', () => {
      const [num, den] = timeSig.value.split('/').map(Number);
      this.engine.timeSignature = [num, den];
      this.timeline.renderRuler();
    });
  }

  private setupTransport() {
    document.getElementById('btn-play')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.engine.playbackState === 'playing') {
        this.engine.pause();
      } else {
        this.engine.play();
      }
    });

    document.getElementById('btn-stop')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.engine.stop();
    });

    document.getElementById('btn-rewind')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.engine.stop();
      this.engine.currentBeat = 0;
    });

    document.getElementById('btn-record')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.engine.toggleRecord();
    });

    document.getElementById('btn-loop')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.engine.toggleLoop();
      document.getElementById('btn-loop')?.classList.toggle('active', this.engine.loopEnabled);
    });
  }

  private updateTransportButtons() {
    const playBtn = document.getElementById('btn-play');
    const recBtn = document.getElementById('btn-record');

    if (playBtn) {
      playBtn.textContent = this.engine.playbackState === 'playing' ? '⏸' : '▶';
      playBtn.classList.toggle('active', this.engine.playbackState === 'playing');
    }

    if (recBtn) {
      recBtn.classList.toggle('active', this.engine.playbackState === 'recording');
    }
  }

  private updateTimeDisplay(beat: number) {
    const seconds = this.engine.beatsToSeconds(beat);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const display = document.getElementById('time-display');
    if (display) {
      display.textContent = `${mins}:${secs.toFixed(3).padStart(6, '0')}`;
    }
  }

  private setupTrackList() {
    document.getElementById('btn-add-track')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const instruments = ['Synth Lead', 'Synth Bass', 'Synth Pad', 'Pluck'];
      const inst = instruments[this.engine.tracks.length % instruments.length];
      this.engine.addTrack(undefined, inst);
    });
  }

  renderTrackHeaders() {
    const container = document.getElementById('track-headers')!;
    container.innerHTML = '';

    for (const track of this.engine.tracks) {
      const header = document.createElement('div');
      header.className = 'track-header';

      const top = document.createElement('div');
      top.className = 'track-header-top';

      const colorBar = document.createElement('div');
      colorBar.className = 'track-color-bar';
      colorBar.style.background = track.color;

      const nameEl = document.createElement('span');
      nameEl.className = 'track-name';
      nameEl.textContent = track.name;

      const controls = document.createElement('div');
      controls.className = 'track-controls';

      const muteBtn = document.createElement('button');
      muteBtn.className = 'track-btn mute-btn' + (track.mute ? ' active' : '');
      muteBtn.textContent = 'M';
      muteBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.engine.toggleMute(track.id);
        muteBtn.classList.toggle('active', track.mute);
      });

      const soloBtn = document.createElement('button');
      soloBtn.className = 'track-btn solo-btn' + (track.solo ? ' active' : '');
      soloBtn.textContent = 'S';
      soloBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.engine.toggleSolo(track.id);
        soloBtn.classList.toggle('active', track.solo);
      });

      controls.appendChild(muteBtn);
      controls.appendChild(soloBtn);

      top.appendChild(colorBar);
      top.appendChild(nameEl);
      top.appendChild(controls);

      const volume = document.createElement('input');
      volume.type = 'range';
      volume.className = 'track-volume';
      volume.min = '0';
      volume.max = '100';
      volume.value = String(Math.round(track.volume * 100));
      volume.addEventListener('input', () => {
        this.engine.setTrackVolume(track.id, parseInt(volume.value) / 100);
      });

      header.appendChild(top);
      header.appendChild(volume);
      container.appendChild(header);
    }
  }

  private setupPanelTabs() {
    const tabs = document.querySelectorAll('.panel-tab');
    tabs.forEach(tab => {
      tab.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const panel = (tab as HTMLElement).dataset.panel;
        if (panel) this.switchPanel(panel);
      });
    });
  }

  private switchPanel(panel: string) {
    document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel-view').forEach(v => v.classList.remove('active'));

    document.querySelector(`.panel-tab[data-panel="${panel}"]`)?.classList.add('active');
    document.getElementById(`${panel}-panel`)?.classList.add('active');

    if (panel === 'piano-roll') {
      this.pianoRoll.renderGrid();
      this.pianoRoll.renderNotes();
    }
  }

  private setupStylusInteraction() {
    this.stylus.on('down', (e) => {
      this.timeline.handlePointerDown(e.state.x, e.state.y, this.currentTool);
    });

    this.stylus.on('move', (e) => {
      if (e.state.isDown) {
        this.timeline.handlePointerMove(e.state.x, e.state.y);
      }
    });

    this.stylus.on('up', () => {
      this.timeline.handlePointerUp();
    });
  }
}

// Boot
document.addEventListener('DOMContentLoaded', () => {
  new DAWApp();
});
