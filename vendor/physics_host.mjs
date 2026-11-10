/**
 * physics_host.mjs – P0 desktop-pet rigid-body physics (Matter.js).
 *
 * Scope (P0): physics EPISODES only. The pet floats exactly where placed —
 * every existing behaviour is preserved. A fast drag-release ("throw") starts
 * a gravity episode: the window arcs, bounces off the work-area floor and
 * settles; the body then falls asleep and the episode ends. Slow releases
 * (placements) never start an episode.
 *
 * Motion arbiter — a single writer of window position at any moment:
 *   user drag  >  physics episode  >  random-move tween
 * The random-move tween in renderer.mjs yields while `ownsMotion()` is true,
 * exactly like it already yields while `interactionManager.isDragging()`.
 *
 * All window movement goes through the window:move IPC (`win.move`), never a
 * direct setPosition — main repositions the toast/bubble windows inline on
 * every window:move, so they stay glued to the pet during the whole arc.
 *
 * The vendored Matter.js is the upstream release build. Runtime guards below
 * mirror the fixes proven in the layered test suite (matter-js-fixes.patch):
 *   F5 – reset() zeroes `sleepCounter` before Composite.clear so cached
 *        collision pairs are released instead of leaking forever;
 *   F3 – freezing is done by not stepping the engine, never via
 *        `body.timeScale = 0` (which NaNs velocity in the release build);
 *   L2 – throw speed is capped below the discrete-tunneling threshold.
 *
 * Kill switch: set `window.__PET_PHYSICS_DISABLED = true` before init, or any
 * init error — the host stays inert and the pet behaves exactly as before.
 */

/** Window / body footprint. Body centre maps to window centre 1:1. */
export const PET_W = 200;
export const PET_H = 200;

/** Max throw speed in px per 16.67 ms step — safely below tunneling. */
export const MAX_THROW_SPEED = 30;

/** Releases slower than this (px per ms) count as placements, not throws. */
export const THROW_MIN_SPEED = 0.45;

const WALL_THICKNESS = 140;

/**
 * Turn recent mouse samples into a capped Matter velocity (px per step).
 *
 * @param {{x:number, y:number, t:number}[]} samples – screen coords, oldest first
 * @param {{pxPerStep?:number, maxSpeed?:number, minSpeed?:number}} [opts]
 * @returns {{x:number, y:number}|null} null → treat as a placement
 */
export function computeThrowVelocity(samples, opts = {}) {
  const pxPerStep = opts.pxPerStep ?? (1000 / 60);
  const maxSpeed = opts.maxSpeed ?? MAX_THROW_SPEED;
  const minSpeed = opts.minSpeed ?? THROW_MIN_SPEED;
  if (!Array.isArray(samples) || samples.length < 2) return null;

  const b = samples[samples.length - 1];
  const a = samples[Math.max(0, samples.length - 5)];
  const dt = b.t - a.t;
  if (!(dt > 0)) return null;

  const vx = ((b.x - a.x) / dt) * pxPerStep;
  const vy = ((b.y - a.y) / dt) * pxPerStep;
  const speed = Math.hypot(vx, vy);
  if (speed < minSpeed * pxPerStep) return null;

  const scale = Math.min(speed, maxSpeed) / speed;
  return { x: vx * scale, y: vy * scale };
}

/**
 * Map a body centre to the OS window top-left corner.
 * (Body is PET_W×PET_H and rotation-free, so centre == window centre.)
 */
export function bodyCenterToWindowTopLeft(x, y, w = PET_W, h = PET_H) {
  return { x: Math.round(x - w / 2), y: Math.round(y - h / 2) };
}

export class PhysicsHost {
  /**
   * @param {object} opts
   * @param {object} opts.win – window.electronAPI.win (move/getBounds)
   * @param {object} [opts.Matter] – Matter global (injected in tests)
   * @param {object} [opts.screenOverride] – work area for headless tests
   * @param {boolean} [opts.autoRun=true] – run the rAF Runner (off in tests)
   * @param {(vel:{x:number,y:number})=>void} [opts.onEpisodeStart]
   * @param {()=>void} [opts.onSleep]
   * @param {()=>void} [opts.onWake] – fired when the pet is woken up (grab)
   */
  constructor(opts = {}) {
    this.win = opts.win || null;
    this.M = opts.Matter || (typeof window !== 'undefined' ? window.Matter : null);
    this._screenOverride = opts.screenOverride || null;
    this._autoRun = opts.autoRun !== false;
    this.onEpisodeStart = opts.onEpisodeStart || (() => {});
    this.onSleep = opts.onSleep || (() => {});
    this.onWake = opts.onWake || (() => {});

    const killed = typeof window !== 'undefined' && window.__PET_PHYSICS_DISABLED === true;
    this.enabled = Boolean(this.M && this.win) && !killed;

    /** 'idle' = pet floats where placed; 'flight' = physics owns the window. */
    this._phase = 'idle';
    /** True while the user drags — drag always wins the arbiter. */
    this._suspended = false;
    /** True while a getBounds round-trip is re-syncing the body. */
    this._syncing = false;
    /** P1 config tuning: throw speed multiplier (1 = P0 behaviour). */
    this._throwScale = 1;
    /** P1 config kill switch: physics.enabled === false in config.json. */
    this._configOff = false;

    this.engine = null;
    this.body = null;
    this._walls = [];
    this._runner = null;
    /** P3: true while the rAF Runner is parked (idle CPU ≈ 0). */
    this._paused = false;
    /** P3: timer that parks the runner once the pet has been asleep for a while. */
    this._autoPauseTimer = null;
    /** P2 ballistic hop state: { winX, winY, steps, total, friction } */
    this._hop = null;
  }

  /** Boot the engine, walls and pet body. Returns true when physics is live. */
  start() {
    if (!this.enabled) return false;
    try {
      const M = this.M;
      this.engine = M.Engine.create({
        enableSleeping: true,
        positionIterations: 8,
        velocityIterations: 6,
      });
      this.engine.gravity.y = 1;
      this.engine.gravity.scale = 0.0009;

      M.Events.on(this.engine, 'afterUpdate', () => this._afterUpdate());

      this._rebuildScene();

      if (this._autoRun && typeof requestAnimationFrame === 'function') {
        this._runner = M.Runner.create();
        M.Runner.run(this._runner, this.engine);
      }
      return true;
    } catch (err) {
      console.warn('[PhysicsHost] start failed, physics disabled:', err);
      this.enabled = false;
      return false;
    }
  }

  destroy() {
    if (this._runner && this.M) {
      try { this.M.Runner.stop(this._runner); } catch (_) { /* noop */ }
    }
    this._runner = null;
    this.engine = null;
    this.body = null;
  }

  // -------------------------------------------------------------------------
  // Scene lifecycle (F5-guarded)
  // -------------------------------------------------------------------------

  /** Tear down and rebuild walls + pet body at the work-area centre. */
  reset() {
    if (!this.engine) return;
    const M = this.M;
    const world = this.engine.world;

    // F5 guard (mirrors the patched Composite.clear): reset sleepCounter so
    // cached collision pairs are released on the next update instead of
    // being retained forever.
    for (const b of world.bodies) b.sleepCounter = 0;
    // Full clear (keepStatic=false): walls are rebuilt below from the current
    // work area, so keeping the old ones would leave duplicates.
    M.Composite.clear(world, false);

    this._walls = [];
    this.body = null;
    this._phase = 'idle';
    this._rebuildScene();
  }

  _rebuildScene() {
    const M = this.M;
    const wa = this._workArea();
    const T = WALL_THICKNESS;
    const cx = wa.left + wa.width / 2;
    const cy = wa.top + wa.height / 2;

    const wall = (x, y, w, h) => M.Bodies.rectangle(x, y, w, h, {
      isStatic: true,
      friction: 0.4,
      restitution: 0.25,
      render: { visible: false },
    });

    this._walls = [
      wall(cx, wa.top + wa.height + T / 2, wa.width + 4 * T, T), // floor
      wall(cx, wa.top - T / 2, wa.width + 4 * T, T),             // ceiling
      wall(wa.left - T / 2, cy, T, wa.height + 4 * T),           // left
      wall(wa.left + wa.width + T / 2, cy, T, wa.height + 4 * T) // right
    ];

    this.body = M.Bodies.rectangle(cx, cy, PET_W, PET_H, {
      label: 'pet',
      chamfer: { radius: 46 },
      friction: 0.35,
      frictionAir: 0.014,
      restitution: 0.42,
      sleepThreshold: 45,
      render: { visible: false },
    });
    // The OS window cannot rotate — pin the body's rotation.
    M.Body.setInertia(this.body, Infinity);

    M.Events.on(this.body, 'sleepStart', () => {
      if (this._phase === 'flight') {
        this._phase = 'idle';
        try { this.onSleep(); } catch (_) { /* listener error is not ours */ }
      }
      // P3: park the runner once the pet has been asleep for a moment — an
      // idle pet must cost (almost) nothing.
      this._scheduleAutoPause();
    });

    M.Composite.add(this.engine.world, [this._walls, this.body].flat());
  }

  _workArea() {
    const s = this._screenOverride
      || (typeof window !== 'undefined' ? window.screen : null)
      || {};
    return {
      left: s.availLeft ?? 0,
      top: s.availTop ?? 0,
      width: s.availWidth ?? 1920,
      height: s.availHeight ?? 1040,
    };
  }

  // -------------------------------------------------------------------------
  // Arbiter API (called from interaction.mjs / renderer.mjs)
  // -------------------------------------------------------------------------

  /** True while a throw episode owns window movement (tween must yield). */
  ownsMotion() {
    return this.enabled && this._phase === 'flight' && !this._suspended;
  }

  // -------------------------------------------------------------------------
  // P3: idle parking — a sleeping pet must not burn a 60fps Runner
  // -------------------------------------------------------------------------

  /** True while the engine Runner is parked. */
  get paused() { return this._paused; }

  /** Park the Runner: the engine stops stepping entirely (idle CPU ≈ 0). */
  pause() {
    this._clearAutoPause();
    if (this._paused) return;
    this._paused = true;
    if (this._runner) {
      try { this.M.Runner.stop(this._runner); } catch (_) { /* noop */ }
    }
  }

  /** Wake the Runner back up (user interaction or a new episode). */
  resume() {
    this._clearAutoPause();
    if (!this._paused) return;
    this._paused = false;
    if (this._runner && this.engine) {
      try { this.M.Runner.run(this._runner, this.engine); } catch (_) { /* noop */ }
    }
  }

  /** Park the runner shortly after the pet falls asleep. */
  _scheduleAutoPause(delayMs = 1500) {
    this._clearAutoPause();
    if (!this._runner) return; // headless mode — nothing to park
    this._autoPauseTimer = setTimeout(() => {
      this._autoPauseTimer = null;
      if (this._phase === 'idle' && !this._suspended) this.pause();
    }, delayMs);
  }

  _clearAutoPause() {
    if (this._autoPauseTimer) {
      clearTimeout(this._autoPauseTimer);
      this._autoPauseTimer = null;
    }
  }

  /**
   * P1: apply the config.json `physics` block (boot + hot-reload).
   *   enabled: false   → end any episode and refuse new ones (config kill switch)
   *   throw_power: 0.5–2 → release-velocity multiplier (capped at MAX_THROW_SPEED)
   *   gravity: 0–3     → gravity scale multiplier (1 = P0 behaviour)
   */
  applyConfig(cfg) {
    cfg = cfg || {};
    if (typeof cfg.throw_power === 'number' && cfg.throw_power > 0) {
      this._throwScale = Math.min(cfg.throw_power, 2);
    }
    if (this.engine && typeof cfg.gravity === 'number' && cfg.gravity >= 0) {
      this.engine.gravity.scale = 0.0009 * Math.min(cfg.gravity, 3);
    }
    if (cfg.enabled === false) {
      this._configOff = true;
      this.grab(); // end any episode; grab() resets phase and suspends writes
    } else if (cfg.enabled === true) {
      this._configOff = false;
    }
  }

  /** User grabbed the pet: physics steps aside immediately (drag wins). */
  grab() {
    if (!this.enabled) return;
    this.resume();
    this._suspended = true;
    this._phase = 'idle';
    this._endHop(false); // user grabbed it — abort the hop without snapping
    if (this.body && this.engine) {
      const M = this.M;
      M.Sleeping.set(this.body, false);
      M.Body.setVelocity(this.body, { x: 0, y: 0 });
      M.Body.setAngularVelocity(this.body, 0);
      try { this.onWake(); } catch (_) { /* listener error is not ours */ }
    }
  }

  /**
   * P2: move the pet to a window position with a real ballistic hop.
   *
   * The trajectory is solved in Matter's units (velocity = px per step) so the
   * pet lands exactly on the requested window position. Air friction is
   * suspended for the hop (it would break the analytic solve) and restored
   * on landing.
   *
   * @param {number} winX – target window left
   * @param {number} winY – target window top
   * @returns {boolean} true when the hop was accepted (caller should NOT tween)
   */
  hopTo(winX, winY) {
    if (!this.enabled || this._configOff || !this.engine || !this.body) return false;
    if (this._phase === 'flight') return false; // already flying — let it land
    if (typeof winX !== 'number' || typeof winY !== 'number') return false;

    this.resume();
    this._phase = 'flight';
    this._suspended = false;

    this._syncBodyFromWindow(() => {
      if (this._phase !== 'flight') return;
      const M = this.M;
      const p0 = this.body.position;
      const dx = (winX + PET_W / 2) - p0.x;
      const dy = (winY + PET_H / 2) - p0.y;

      const dt = 1000 / 60;
      const g = Math.max(1e-4, this.engine.gravity.y * this.engine.gravity.scale * dt * dt);
      const maxRise = 140; // keep the apex clear of the ceiling wall

      let steps = Math.round(Math.sqrt(dx * dx + dy * dy) / 12);
      steps = Math.max(18, Math.min(90, steps));
      let vy = (dy - 0.5 * g * steps * steps) / steps;

      // Shorten the hop until the apex stays under the ceiling.
      for (let i = 0; i < 6 && vy < 0; i++) {
        const rise = (vy * vy) / (2 * g);
        if (rise <= maxRise) break;
        steps = Math.max(12, Math.round(steps * 0.85));
        vy = (dy - 0.5 * g * steps * steps) / steps;
      }

      const vx = dx / steps;
      M.Sleeping.set(this.body, false);
      M.Body.setVelocity(this.body, { x: vx, y: vy });

      // Air friction would decay the analytic velocity — suspend it.
      this._hop = {
        winX: Math.round(winX),
        winY: Math.round(winY),
        steps: 0,
        total: steps,
        friction: this.body.frictionAir,
      };
      this.body.frictionAir = 0;
    });

    return true;
  }

  /**
   * Finish a hop: restore friction, snap to the exact target, end the episode.
   * @param {boolean} [snap=true] – false aborts the hop where it is (user grab)
   */
  _endHop(snap = true) {
    if (!this._hop) return;
    const hop = this._hop;
    this._hop = null;
    if (this.body) this.body.frictionAir = hop.friction;
    if (snap && this.win && typeof this.win.move === 'function') {
      try { this.win.move(hop.winX, hop.winY); } catch (_) { /* noop */ }
    }
    if (this.body && this.engine) {
      this.M.Body.setVelocity(this.body, { x: 0, y: 0 });
    }
    this._phase = 'idle';
  }

  /**
   * Drag ended. Fast release → throw episode; slow release → placement
   * (pet floats where placed, exactly the legacy behaviour).
   *
   * @param {{x:number,y:number,t:number}[]} samples – mousemove samples
   * @returns {{x:number,y:number}|null} the applied velocity, or null
   */
  throwFromDrag(samples) {
    if (!this.enabled || this._configOff) return null;
    const vel = computeThrowVelocity(samples);
    this._suspended = false;
    if (!vel) return null;

    this.resume();
    this._phase = 'flight';
    this._syncBodyFromWindow(() => {
      if (this._phase !== 'flight') return; // user grabbed it mid-sync
      const M = this.M;
      M.Sleeping.set(this.body, false);
      // P1: apply the throw_power multiplier, but never exceed the
      // discrete-tunneling safety cap (L2 finding).
      var v = { x: vel.x * this._throwScale, y: vel.y * this._throwScale };
      var speed = Math.sqrt(v.x * v.x + v.y * v.y);
      if (speed > MAX_THROW_SPEED) {
        v.x = v.x / speed * MAX_THROW_SPEED;
        v.y = v.y / speed * MAX_THROW_SPEED;
      }
      M.Body.setVelocity(this.body, v);
      try { this.onEpisodeStart(v); } catch (_) { /* listener error is not ours */ }
    });
    return vel;
  }

  /** Diagnostics for logging / future status UI. */
  stats() {
    if (!this.engine) return { phase: 'disabled' };
    let sleeping = 0;
    for (const b of this.engine.world.bodies) if (b.isSleeping) sleeping++;
    return {
      phase: this._phase,
      bodies: this.engine.world.bodies.length,
      pairs: this.engine.pairs.list.length,
      sleeping,
    };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  _syncBodyFromWindow(onDone) {
    const finish = () => {
      this._syncing = false;
      if (onDone) onDone();
    };
    if (!this.win || typeof this.win.getBounds !== 'function' || !this.body) {
      finish();
      return;
    }
    this._syncing = true;
    this.win.getBounds().then((b) => {
      if (b && this.body && this.engine) {
        const M = this.M;
        M.Body.setPosition(this.body, { x: b.x + b.width / 2, y: b.y + b.height / 2 });
        M.Body.setVelocity(this.body, { x: 0, y: 0 });
        M.Sleeping.set(this.body, false);
      }
      finish();
    }).catch(() => {
      this._phase = 'idle';
      finish();
    });
  }

  _afterUpdate() {
    if (!this.enabled || this._phase !== 'flight') return;
    if (this._suspended || this._syncing) return;
    if (!this.body || !this.win || typeof this.win.move !== 'function') return;

    // P2 hop: count the flight and snap to the exact target on landing.
    if (this._hop) {
      this._hop.steps++;
      if (this._hop.steps >= this._hop.total) {
        this._endHop();
        return;
      }
    }

    const topLeft = bodyCenterToWindowTopLeft(this.body.position.x, this.body.position.y);
    try {
      this.win.move(topLeft.x, topLeft.y);
    } catch (err) {
      console.debug('[PhysicsHost] win.move failed, ending episode:', err);
      this._phase = 'idle';
    }
  }

  /** Headless stepping for tests (the rAF Runner is off there). */
  update(dt) {
    if (this.engine) this.M.Engine.update(this.engine, dt);
  }
}
