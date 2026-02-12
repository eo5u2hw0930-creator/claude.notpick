export interface StylusState {
  x: number;
  y: number;
  pressure: number;    // 0.0 - 1.0
  tiltX: number;       // degrees
  tiltY: number;       // degrees
  pointerType: 'pen' | 'touch' | 'mouse';
  isDown: boolean;
  buttons: number;
}

export type StylusEventType = 'down' | 'move' | 'up' | 'enter' | 'leave';

export interface StylusEvent {
  type: StylusEventType;
  state: StylusState;
  target: HTMLElement;
  originalEvent: PointerEvent;
}

type StylusHandler = (e: StylusEvent) => void;

export class StylusInput {
  private handlers = new Map<StylusEventType, Set<StylusHandler>>();
  private currentState: StylusState = {
    x: 0, y: 0, pressure: 0, tiltX: 0, tiltY: 0,
    pointerType: 'mouse', isDown: false, buttons: 0,
  };
  private element: HTMLElement;
  private pressureIndicator: HTMLElement | null = null;

  constructor(element: HTMLElement) {
    this.element = element;
    this.setupPressureIndicator();
    this.bindEvents();
  }

  private setupPressureIndicator() {
    this.pressureIndicator = document.createElement('div');
    this.pressureIndicator.className = 'pressure-indicator';
    document.body.appendChild(this.pressureIndicator);
  }

  private bindEvents() {
    const el = this.element;

    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this.updateState(e, true);
      this.emit('down', e);
    });

    el.addEventListener('pointermove', (e) => {
      this.updateState(e, this.currentState.isDown);
      this.updatePressureIndicator(e);
      this.emit('move', e);

      // Coalesced events for smoother stylus input
      if ('getCoalescedEvents' in e) {
        const coalesced = e.getCoalescedEvents();
        for (const ce of coalesced) {
          this.updateState(ce, this.currentState.isDown);
        }
      }
    });

    el.addEventListener('pointerup', (e) => {
      this.updateState(e, false);
      this.hidePressureIndicator();
      this.emit('up', e);
    });

    el.addEventListener('pointerenter', (e) => {
      this.updateState(e, this.currentState.isDown);
      this.emit('enter', e);
    });

    el.addEventListener('pointerleave', (e) => {
      this.updateState(e, false);
      this.hidePressureIndicator();
      this.emit('leave', e);
    });

    el.addEventListener('pointercancel', (e) => {
      this.updateState(e, false);
      this.hidePressureIndicator();
      this.emit('up', e);
    });

    // Prevent default touch behaviors
    el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    el.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private updateState(e: PointerEvent, isDown: boolean) {
    this.currentState = {
      x: e.clientX,
      y: e.clientY,
      pressure: e.pressure,
      tiltX: e.tiltX,
      tiltY: e.tiltY,
      pointerType: e.pointerType as 'pen' | 'touch' | 'mouse',
      isDown,
      buttons: e.buttons,
    };
  }

  private updatePressureIndicator(e: PointerEvent) {
    if (!this.pressureIndicator) return;
    if (e.pointerType === 'pen' && this.currentState.isDown) {
      const size = 10 + e.pressure * 30;
      this.pressureIndicator.style.width = `${size}px`;
      this.pressureIndicator.style.height = `${size}px`;
      this.pressureIndicator.style.left = `${e.clientX}px`;
      this.pressureIndicator.style.top = `${e.clientY}px`;
      this.pressureIndicator.classList.add('visible');
    } else {
      this.hidePressureIndicator();
    }
  }

  private hidePressureIndicator() {
    this.pressureIndicator?.classList.remove('visible');
  }

  on(event: StylusEventType, handler: StylusHandler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
  }

  off(event: StylusEventType, handler: StylusHandler) {
    this.handlers.get(event)?.delete(handler);
  }

  private emit(type: StylusEventType, originalEvent: PointerEvent) {
    const evt: StylusEvent = {
      type,
      state: { ...this.currentState },
      target: originalEvent.target as HTMLElement,
      originalEvent,
    };
    this.handlers.get(type)?.forEach(h => h(evt));
  }

  getState(): Readonly<StylusState> {
    return this.currentState;
  }

  // Check if input is a stylus with pressure support
  isPenInput(): boolean {
    return this.currentState.pointerType === 'pen';
  }

  dispose() {
    this.pressureIndicator?.remove();
  }
}
