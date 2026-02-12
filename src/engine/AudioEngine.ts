export interface NoteEvent {
  id: string;
  pitch: number;      // MIDI note number (0-127)
  startTime: number;  // in beats
  duration: number;   // in beats
  velocity: number;   // 0-127
  trackId: string;
}

export interface AudioClip {
  id: string;
  trackId: string;
  startBeat: number;
  durationBeats: number;
  notes: NoteEvent[];
  color: string;
  name: string;
}

export interface TrackState {
  id: string;
  name: string;
  color: string;
  volume: number;    // 0.0 - 1.0
  pan: number;       // -1.0 to 1.0
  mute: boolean;
  solo: boolean;
  clips: AudioClip[];
  instrument: string;
  gainNode: GainNode | null;
  panNode: StereoPannerNode | null;
  analyserNode: AnalyserNode | null;
}

export type PlaybackState = 'stopped' | 'playing' | 'recording';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function noteToName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  const name = NOTE_NAMES[midi % 12];
  return `${name}${octave}`;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

let idCounter = 0;
export function genId(prefix = 'id'): string {
  return `${prefix}_${++idCounter}_${Date.now().toString(36)}`;
}

export class AudioEngine {
  ctx: AudioContext;
  masterGain: GainNode;
  masterAnalyser: AnalyserNode;
  tracks: TrackState[] = [];
  bpm = 120;
  timeSignature = [4, 4];
  playbackState: PlaybackState = 'stopped';
  currentBeat = 0;
  loopEnabled = false;
  loopStart = 0;
  loopEnd = 16;

  private startTime = 0;
  private startBeat = 0;
  private scheduledNodes: OscillatorNode[] = [];
  private animFrameId = 0;
  private listeners = new Map<string, Set<Function>>();

  // Built-in synth oscillator types per instrument
  private instrumentTypes: Record<string, OscillatorType> = {
    'Synth Lead': 'sawtooth',
    'Synth Pad': 'sine',
    'Synth Bass': 'square',
    'Pluck': 'triangle',
  };

  constructor() {
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.8;
    this.masterAnalyser = this.ctx.createAnalyser();
    this.masterAnalyser.fftSize = 256;
    this.masterGain.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.ctx.destination);
  }

  on(event: string, fn: Function) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
  }

  off(event: string, fn: Function) {
    this.listeners.get(event)?.delete(fn);
  }

  private emit(event: string, ...args: any[]) {
    this.listeners.get(event)?.forEach(fn => fn(...args));
  }

  beatsToSeconds(beats: number): number {
    return (beats / this.bpm) * 60;
  }

  secondsToBeats(seconds: number): number {
    return (seconds / 60) * this.bpm;
  }

  getCurrentBeat(): number {
    if (this.playbackState === 'stopped') return this.currentBeat;
    const elapsed = this.ctx.currentTime - this.startTime;
    let beat = this.startBeat + this.secondsToBeats(elapsed);
    if (this.loopEnabled && beat >= this.loopEnd) {
      const loopLen = this.loopEnd - this.loopStart;
      beat = this.loopStart + ((beat - this.loopStart) % loopLen);
    }
    return beat;
  }

  addTrack(name?: string, instrument = 'Synth Lead'): TrackState {
    const colors = ['#e94560', '#f39c12', '#2ecc71', '#3498db', '#9b59b6', '#1abc9c', '#e67e22', '#e74c3c'];
    const gainNode = this.ctx.createGain();
    const panNode = this.ctx.createStereoPanner();
    const analyserNode = this.ctx.createAnalyser();
    analyserNode.fftSize = 128;

    gainNode.connect(panNode);
    panNode.connect(analyserNode);
    analyserNode.connect(this.masterGain);

    const track: TrackState = {
      id: genId('trk'),
      name: name || `Track ${this.tracks.length + 1}`,
      color: colors[this.tracks.length % colors.length],
      volume: 0.75,
      pan: 0,
      mute: false,
      solo: false,
      clips: [],
      instrument,
      gainNode,
      panNode,
      analyserNode,
    };

    this.tracks.push(track);
    this.emit('trackAdded', track);
    return track;
  }

  removeTrack(trackId: string) {
    const idx = this.tracks.findIndex(t => t.id === trackId);
    if (idx === -1) return;
    const track = this.tracks[idx];
    track.gainNode?.disconnect();
    track.panNode?.disconnect();
    track.analyserNode?.disconnect();
    this.tracks.splice(idx, 1);
    this.emit('trackRemoved', trackId);
  }

  setTrackVolume(trackId: string, volume: number) {
    const track = this.tracks.find(t => t.id === trackId);
    if (!track) return;
    track.volume = Math.max(0, Math.min(1, volume));
    if (track.gainNode) {
      track.gainNode.gain.value = track.mute ? 0 : track.volume;
    }
  }

  setTrackPan(trackId: string, pan: number) {
    const track = this.tracks.find(t => t.id === trackId);
    if (!track) return;
    track.pan = Math.max(-1, Math.min(1, pan));
    if (track.panNode) {
      track.panNode.pan.value = track.pan;
    }
  }

  toggleMute(trackId: string) {
    const track = this.tracks.find(t => t.id === trackId);
    if (!track) return;
    track.mute = !track.mute;
    if (track.gainNode) {
      track.gainNode.gain.value = track.mute ? 0 : track.volume;
    }
    this.emit('trackUpdated', track);
  }

  toggleSolo(trackId: string) {
    const track = this.tracks.find(t => t.id === trackId);
    if (!track) return;
    track.solo = !track.solo;

    const hasSolo = this.tracks.some(t => t.solo);
    for (const t of this.tracks) {
      if (t.gainNode) {
        if (hasSolo) {
          t.gainNode.gain.value = t.solo ? t.volume : 0;
        } else {
          t.gainNode.gain.value = t.mute ? 0 : t.volume;
        }
      }
    }
    this.emit('trackUpdated', track);
  }

  addClip(trackId: string, startBeat: number, durationBeats = 4): AudioClip {
    const track = this.tracks.find(t => t.id === trackId);
    if (!track) throw new Error('Track not found');

    const clip: AudioClip = {
      id: genId('clip'),
      trackId,
      startBeat,
      durationBeats,
      notes: [],
      color: track.color,
      name: `Clip ${track.clips.length + 1}`,
    };

    track.clips.push(clip);
    this.emit('clipAdded', clip);
    return clip;
  }

  addNoteToClip(clipId: string, pitch: number, startBeat: number, duration: number, velocity = 100): NoteEvent {
    for (const track of this.tracks) {
      const clip = track.clips.find(c => c.id === clipId);
      if (clip) {
        const note: NoteEvent = {
          id: genId('note'),
          pitch,
          startTime: startBeat,
          duration,
          velocity,
          trackId: track.id,
        };
        clip.notes.push(note);
        this.emit('noteAdded', note, clip);
        return note;
      }
    }
    throw new Error('Clip not found');
  }

  removeNoteFromClip(clipId: string, noteId: string) {
    for (const track of this.tracks) {
      const clip = track.clips.find(c => c.id === clipId);
      if (clip) {
        const idx = clip.notes.findIndex(n => n.id === noteId);
        if (idx !== -1) {
          clip.notes.splice(idx, 1);
          this.emit('noteRemoved', noteId, clip);
        }
        return;
      }
    }
  }

  play() {
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.playbackState === 'playing') return;

    this.playbackState = 'playing';
    this.startTime = this.ctx.currentTime;
    this.startBeat = this.currentBeat;
    this.schedulePlayback();
    this.startAnimLoop();
    this.emit('playbackStateChanged', 'playing');
  }

  stop() {
    this.playbackState = 'stopped';
    this.currentBeat = 0;
    this.stopScheduled();
    cancelAnimationFrame(this.animFrameId);
    this.emit('playbackStateChanged', 'stopped');
    this.emit('beatChanged', 0);
  }

  pause() {
    if (this.playbackState !== 'playing') return;
    this.currentBeat = this.getCurrentBeat();
    this.playbackState = 'stopped';
    this.stopScheduled();
    cancelAnimationFrame(this.animFrameId);
    this.emit('playbackStateChanged', 'stopped');
  }

  toggleRecord() {
    if (this.playbackState === 'recording') {
      this.playbackState = 'playing';
    } else {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.playbackState = 'recording';
      if (this.startTime === 0) {
        this.startTime = this.ctx.currentTime;
        this.startBeat = this.currentBeat;
        this.startAnimLoop();
      }
    }
    this.emit('playbackStateChanged', this.playbackState);
  }

  toggleLoop() {
    this.loopEnabled = !this.loopEnabled;
    this.emit('loopChanged', this.loopEnabled);
  }

  private schedulePlayback() {
    this.stopScheduled();
    const now = this.ctx.currentTime;

    for (const track of this.tracks) {
      if (track.mute) continue;
      const hasSolo = this.tracks.some(t => t.solo);
      if (hasSolo && !track.solo) continue;

      const oscType = this.instrumentTypes[track.instrument] || 'sine';

      for (const clip of track.clips) {
        for (const note of clip.notes) {
          const noteBeat = clip.startBeat + note.startTime;
          const noteTime = this.beatsToSeconds(noteBeat - this.startBeat);
          if (noteTime < 0) continue;

          const osc = this.ctx.createOscillator();
          const noteGain = this.ctx.createGain();
          osc.type = oscType;
          osc.frequency.value = midiToFreq(note.pitch);

          const vol = (note.velocity / 127) * 0.3;
          noteGain.gain.setValueAtTime(0, now + noteTime);
          noteGain.gain.linearRampToValueAtTime(vol, now + noteTime + 0.01);
          const noteDur = this.beatsToSeconds(note.duration);
          noteGain.gain.setValueAtTime(vol, now + noteTime + noteDur - 0.02);
          noteGain.gain.linearRampToValueAtTime(0, now + noteTime + noteDur);

          osc.connect(noteGain);
          noteGain.connect(track.gainNode!);

          osc.start(now + noteTime);
          osc.stop(now + noteTime + noteDur + 0.05);
          this.scheduledNodes.push(osc);
        }
      }
    }
  }

  private stopScheduled() {
    for (const osc of this.scheduledNodes) {
      try { osc.stop(); osc.disconnect(); } catch {}
    }
    this.scheduledNodes = [];
  }

  private startAnimLoop() {
    const tick = () => {
      if (this.playbackState === 'stopped') return;
      const beat = this.getCurrentBeat();
      this.emit('beatChanged', beat);
      this.animFrameId = requestAnimationFrame(tick);
    };
    this.animFrameId = requestAnimationFrame(tick);
  }

  // Play a note immediately for preview
  playNote(pitch: number, velocity = 100, duration = 0.2, trackId?: string) {
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const track = trackId ? this.tracks.find(t => t.id === trackId) : this.tracks[0];
    const oscType = track ? (this.instrumentTypes[track.instrument] || 'sine') : 'sine';

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = oscType;
    osc.frequency.value = midiToFreq(pitch);

    const vol = (velocity / 127) * 0.3;
    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.01);
    gain.gain.setValueAtTime(vol, now + duration - 0.02);
    gain.gain.linearRampToValueAtTime(0, now + duration);

    osc.connect(gain);
    gain.connect(track?.gainNode || this.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  getTrackMeterLevel(trackId: string): number {
    const track = this.tracks.find(t => t.id === trackId);
    if (!track?.analyserNode) return 0;
    const data = new Uint8Array(track.analyserNode.frequencyBinCount);
    track.analyserNode.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    return sum / data.length / 255;
  }

  getMasterLevel(): number {
    const data = new Uint8Array(this.masterAnalyser.frequencyBinCount);
    this.masterAnalyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    return sum / data.length / 255;
  }

  dispose() {
    this.stop();
    this.ctx.close();
  }
}
