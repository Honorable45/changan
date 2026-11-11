/** Sons de synthèse : aucun fichier à télécharger. Le moteur est générique, ce n'est pas le son d'un véhicule réel. */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private osc: OscillatorNode[] = [];
  private filter: BiquadFilterNode | null = null;
  private hornNodes: OscillatorNode[] = [];
  muted = false;

  start() {
    if (this.ctx) { void this.ctx.resume(); return; }
    const Ctor = window.AudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(ctx.destination);
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 500;
    this.filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    for (const [type, gain] of [['sawtooth', 0.35], ['triangle', 0.6]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g).connect(this.filter);
      o.start();
      this.osc.push(o);
    }
  }

  /** Régime fictif à quatre rapports, pour que le son monte et redescende en accélérant. */
  engine(on: boolean, speed: number, throttle: number) {
    if (!this.ctx || !this.engineGain || !this.filter) return;
    const v = Math.abs(speed);
    let gear = v < 7 ? v / 7 : v < 13 ? 0.45 + (v - 7) / 12 : v < 19 ? 0.5 + (v - 13) / 14 : 0.55 + (v - 19) / 18;
    // Au-delà, une vitesse passe tous les 12 m/s : le régime remonte puis retombe jusqu'à 300 km/h.
    if (v > 25) { const k = (v - 25) / 12; gear = 0.6 + (k - Math.floor(k)) * 0.55 + Math.min(k, 5) * 0.06; }
    const hz = 42 + gear * 95 + throttle * 12;
    const t = this.ctx.currentTime;
    this.osc[0]?.frequency.setTargetAtTime(hz, t, 0.08);
    this.osc[1]?.frequency.setTargetAtTime(hz * 2.01, t, 0.08);
    this.filter.frequency.setTargetAtTime(350 + throttle * 700 + gear * 300, t, 0.1);
    this.engineGain.gain.setTargetAtTime(on ? 0.1 + throttle * 0.12 : 0, t, 0.12);
  }

  horn(on: boolean) {
    if (!this.ctx || !this.master) return;
    if (!on) { this.hornNodes.forEach((o) => o.stop()); this.hornNodes = []; return; }
    if (this.hornNodes.length) return;
    const g = this.ctx.createGain();
    g.gain.value = 0.16;
    g.connect(this.master);
    this.hornNodes = [392, 494].map((hz) => {
      const o = this.ctx!.createOscillator();
      o.type = 'square';
      o.frequency.value = hz;
      o.connect(g);
      o.start();
      return o;
    });
  }

  private blip(hz: number, duration: number, gain: number, type: OscillatorType = 'sine', at = 0) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = hz;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + duration);
  }

  tick() { this.blip(1500, 0.03, 0.12, 'square'); }
  hit() { this.blip(70, 0.35, 0.8, 'sawtooth'); this.blip(180, 0.2, 0.4, 'square'); }
  success() { this.blip(660, 0.14, 0.2); this.blip(880, 0.2, 0.2, 'sine', 0.1); }
  warning() { this.blip(300, 0.18, 0.2, 'square'); }

  setMuted(muted: boolean) { this.muted = muted; if (this.master) this.master.gain.value = muted ? 0 : 0.6; }
  pause() { void this.ctx?.suspend(); }
  resume() { void this.ctx?.resume(); }
  dispose() { this.hornNodes = []; void this.ctx?.close(); this.ctx = null; }
}
