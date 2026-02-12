import { AudioEngine } from '../engine/AudioEngine';

interface EffectConfig {
  name: string;
  enabled: boolean;
  params: { name: string; value: number; min: number; max: number }[];
  node: AudioNode | null;
}

export class EffectsPanel {
  private engine: AudioEngine;
  private container: HTMLElement;
  private effects: EffectConfig[] = [];

  constructor(engine: AudioEngine, container: HTMLElement) {
    this.engine = engine;
    this.container = container;
    this.initEffects();
  }

  private initEffects() {
    this.effects = [
      {
        name: 'Reverb',
        enabled: false,
        params: [
          { name: 'Decay', value: 50, min: 0, max: 100 },
          { name: 'Mix', value: 30, min: 0, max: 100 },
        ],
        node: null,
      },
      {
        name: 'Delay',
        enabled: false,
        params: [
          { name: 'Time', value: 40, min: 0, max: 100 },
          { name: 'Feedback', value: 30, min: 0, max: 100 },
          { name: 'Mix', value: 25, min: 0, max: 100 },
        ],
        node: null,
      },
      {
        name: 'Filter',
        enabled: false,
        params: [
          { name: 'Cutoff', value: 70, min: 0, max: 100 },
          { name: 'Resonance', value: 20, min: 0, max: 100 },
        ],
        node: null,
      },
      {
        name: 'Distortion',
        enabled: false,
        params: [
          { name: 'Drive', value: 30, min: 0, max: 100 },
          { name: 'Tone', value: 50, min: 0, max: 100 },
        ],
        node: null,
      },
      {
        name: 'Compressor',
        enabled: false,
        params: [
          { name: 'Threshold', value: 60, min: 0, max: 100 },
          { name: 'Ratio', value: 40, min: 0, max: 100 },
          { name: 'Attack', value: 20, min: 0, max: 100 },
        ],
        node: null,
      },
    ];
  }

  render() {
    this.container.innerHTML = '';

    for (const effect of this.effects) {
      const slot = document.createElement('div');
      slot.className = 'effect-slot';

      // Header
      const header = document.createElement('div');
      header.className = 'effect-slot-header';

      const nameEl = document.createElement('span');
      nameEl.className = 'effect-name';
      nameEl.textContent = effect.name;

      const toggle = document.createElement('div');
      toggle.className = 'effect-toggle' + (effect.enabled ? ' active' : '');
      toggle.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        effect.enabled = !effect.enabled;
        toggle.classList.toggle('active', effect.enabled);
      });

      header.appendChild(nameEl);
      header.appendChild(toggle);
      slot.appendChild(header);

      // Knobs
      const knobRow = document.createElement('div');
      knobRow.className = 'effect-knob-row';

      for (const param of effect.params) {
        const knobContainer = document.createElement('div');
        knobContainer.className = 'effect-knob';

        const knob = document.createElement('div');
        knob.className = 'knob';
        knob.style.setProperty('--knob-value', `${param.value}%`);
        knob.style.setProperty('--knob-rotation', `${(param.value / 100) * 270 - 135}deg`);

        // Stylus-friendly knob interaction
        let isDragging = false;
        let startY = 0;
        let startValue = 0;

        knob.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          isDragging = true;
          startY = e.clientY;
          startValue = param.value;
          knob.setPointerCapture(e.pointerId);
        });

        knob.addEventListener('pointermove', (e) => {
          if (!isDragging) return;
          const delta = (startY - e.clientY) * 0.5;
          // Use stylus pressure for fine control
          const sensitivity = e.pointerType === 'pen' ? 0.3 : 0.5;
          param.value = Math.max(param.min, Math.min(param.max, startValue + delta * sensitivity));
          knob.style.setProperty('--knob-value', `${param.value}%`);
          knob.style.setProperty('--knob-rotation', `${(param.value / 100) * 270 - 135}deg`);
        });

        knob.addEventListener('pointerup', () => {
          isDragging = false;
        });

        const label = document.createElement('span');
        label.className = 'effect-knob-label';
        label.textContent = param.name;

        knobContainer.appendChild(knob);
        knobContainer.appendChild(label);
        knobRow.appendChild(knobContainer);
      }

      slot.appendChild(knobRow);
      this.container.appendChild(slot);
    }
  }
}
