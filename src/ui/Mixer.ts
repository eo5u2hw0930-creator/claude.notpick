import { AudioEngine, type TrackState } from '../engine/AudioEngine';

export class MixerPanel {
  private engine: AudioEngine;
  private container: HTMLElement;
  private meterAnimId = 0;
  private channelEls = new Map<string, {
    fader: HTMLInputElement;
    pan: HTMLInputElement;
    meterFill: HTMLElement;
    dbLabel: HTMLElement;
    muteBtn: HTMLButtonElement;
    soloBtn: HTMLButtonElement;
  }>();

  constructor(engine: AudioEngine, container: HTMLElement) {
    this.engine = engine;
    this.container = container;
  }

  render() {
    this.container.innerHTML = '';
    this.channelEls.clear();

    for (const track of this.engine.tracks) {
      this.addChannel(track);
    }

    // Master channel
    this.addMasterChannel();
    this.startMeterAnimation();
  }

  private addChannel(track: TrackState) {
    const ch = document.createElement('div');
    ch.className = 'mixer-channel';
    ch.dataset.trackId = track.id;

    const name = document.createElement('div');
    name.className = 'mixer-channel-name';
    name.textContent = track.name;
    name.style.color = track.color;

    const faderWrapper = document.createElement('div');
    faderWrapper.className = 'mixer-fader-wrapper';

    const fader = document.createElement('input');
    fader.type = 'range';
    fader.className = 'mixer-fader';
    fader.min = '0';
    fader.max = '100';
    fader.value = String(Math.round(track.volume * 100));
    fader.addEventListener('input', () => {
      this.engine.setTrackVolume(track.id, parseInt(fader.value) / 100);
    });

    const meter = document.createElement('div');
    meter.className = 'mixer-meter';
    const meterFill = document.createElement('div');
    meterFill.className = 'mixer-meter-fill';
    meterFill.style.height = '0%';
    meter.appendChild(meterFill);

    faderWrapper.appendChild(fader);
    faderWrapper.appendChild(meter);

    const dbLabel = document.createElement('div');
    dbLabel.className = 'mixer-db';
    dbLabel.textContent = '0 dB';

    const pan = document.createElement('input');
    pan.type = 'range';
    pan.className = 'mixer-pan';
    pan.min = '-100';
    pan.max = '100';
    pan.value = String(Math.round(track.pan * 100));
    pan.addEventListener('input', () => {
      this.engine.setTrackPan(track.id, parseInt(pan.value) / 100);
    });

    const btns = document.createElement('div');
    btns.className = 'mixer-channel-btns';

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

    btns.appendChild(muteBtn);
    btns.appendChild(soloBtn);

    ch.appendChild(name);
    ch.appendChild(faderWrapper);
    ch.appendChild(dbLabel);
    ch.appendChild(pan);
    ch.appendChild(btns);

    this.container.appendChild(ch);
    this.channelEls.set(track.id, { fader, pan, meterFill, dbLabel, muteBtn, soloBtn });
  }

  private addMasterChannel() {
    const ch = document.createElement('div');
    ch.className = 'mixer-channel';
    ch.style.borderLeft = '2px solid var(--accent)';

    const name = document.createElement('div');
    name.className = 'mixer-channel-name';
    name.textContent = 'MASTER';
    name.style.color = 'var(--accent)';

    const faderWrapper = document.createElement('div');
    faderWrapper.className = 'mixer-fader-wrapper';

    const fader = document.createElement('input');
    fader.type = 'range';
    fader.className = 'mixer-fader';
    fader.min = '0';
    fader.max = '100';
    fader.value = '80';
    fader.addEventListener('input', () => {
      this.engine.masterGain.gain.value = parseInt(fader.value) / 100;
    });

    const meter = document.createElement('div');
    meter.className = 'mixer-meter';
    const meterFill = document.createElement('div');
    meterFill.className = 'mixer-meter-fill';
    meter.appendChild(meterFill);

    faderWrapper.appendChild(fader);
    faderWrapper.appendChild(meter);

    const dbLabel = document.createElement('div');
    dbLabel.className = 'mixer-db';
    dbLabel.textContent = '0 dB';

    ch.appendChild(name);
    ch.appendChild(faderWrapper);
    ch.appendChild(dbLabel);

    this.container.appendChild(ch);
    this.channelEls.set('master', { fader, pan: fader, meterFill, dbLabel, muteBtn: document.createElement('button'), soloBtn: document.createElement('button') });
  }

  private startMeterAnimation() {
    cancelAnimationFrame(this.meterAnimId);
    const update = () => {
      for (const track of this.engine.tracks) {
        const els = this.channelEls.get(track.id);
        if (!els) continue;
        const level = this.engine.getTrackMeterLevel(track.id);
        els.meterFill.style.height = `${level * 100}%`;
        const db = level > 0 ? Math.round(20 * Math.log10(level)) : -60;
        els.dbLabel.textContent = `${db} dB`;
      }

      const masterEls = this.channelEls.get('master');
      if (masterEls) {
        const level = this.engine.getMasterLevel();
        masterEls.meterFill.style.height = `${level * 100}%`;
        const db = level > 0 ? Math.round(20 * Math.log10(level)) : -60;
        masterEls.dbLabel.textContent = `${db} dB`;
      }

      this.meterAnimId = requestAnimationFrame(update);
    };
    this.meterAnimId = requestAnimationFrame(update);
  }

  dispose() {
    cancelAnimationFrame(this.meterAnimId);
  }
}
