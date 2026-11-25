/* ============================================================
   PIXELTube — boot-cinema.js
   5 cinematic bootup FX engines + Web Audio synthesizer.
   Moved directly from test-bootup.html. Targets the DOM inside
   #loader (index.html), scoped so it never touches the app.
   Exposes window.PIXELBootCinema = { play, stop }.
   ============================================================ */
(() => {
  'use strict';

  /* ---------- logo fallback ---------- */
  function triggerLogoFallback() {
    const img = document.getElementById('logo-img');
    const fallback = document.getElementById('logo-svg-fallback');
    if (img) img.style.display = 'none';
    if (fallback) fallback.classList.add('show');
  }

  /* ---------- Web Audio sound design (5 signatures) ---------- */
  class PixelBootAudio {
    constructor() {
      this.ctx = null;
      this.isMuted = false;
      this.audioUnlocked = false;
    }

    ensureContext() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.ctx = new AudioCtx();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().then(() => {
          this.audioUnlocked = true;
          this.updateUI();
        }).catch(() => {});
      } else if (this.ctx && this.ctx.state === 'running') {
        this.audioUnlocked = true;
      }
      this.updateUI();
    }

    updateUI() {
      const icon = document.getElementById('audio-icon');
      const text = document.getElementById('audio-text');
      if (!icon || !text) return;
      if (this.isMuted) {
        icon.textContent = '🔇';
        text.textContent = 'Muted — Click to Unmute';
      } else if (!this.ctx || this.ctx.state !== 'running') {
        icon.textContent = '🔈';
        text.textContent = 'Click to Unmute / Replay with Sound';
      } else {
        icon.textContent = '🔊';
        text.textContent = 'Cinematic Audio On';
      }
    }

    playSignature(introIndex) {
      this.ensureContext();
      if (this.isMuted || !this.ctx || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      try {
        switch (introIndex) {
          case 0: this.soundCinemaRibbons(now); break;
          case 1: this.soundConsolePowerOn(now); break;
          case 2: this.soundCyberGlitch(now); break;
          case 3: this.soundWarpStarfield(now); break;
          case 4: this.soundNeonLaserEtch(now); break;
        }
      } catch (e) { console.warn('Audio playback skipped:', e); }
    }

    soundCinemaRibbons(now) {
      const subHit = (t, f0, f1, dur, amp) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f0, t);
        osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(amp, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + dur + 0.05);
      };
      subHit(now + 0.12, 115, 42, 0.45, 0.6);
      subHit(now + 0.42, 95, 30, 1.65, 0.8);
      [261.63, 329.63, 392.00, 493.88].forEach((freq) => {
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + 0.42);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(400, now + 0.42);
        filter.frequency.exponentialRampToValueAtTime(2400, now + 1.1);
        gain.gain.setValueAtTime(0.0001, now + 0.42);
        gain.gain.linearRampToValueAtTime(0.09, now + 0.75);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + 0.42);
        osc.stop(now + 2.45);
      });
    }

    soundConsolePowerOn(now) {
      const arp = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
      arp.forEach((freq, idx) => {
        const t = now + 0.1 + idx * 0.075;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.06, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.18);
      });
      [987.77, 1318.51].forEach((freq, i) => {
        const t = now + 0.85 + i * 0.11;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.075, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + (i === 0 ? 0.12 : 0.65));
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.7);
      });
    }

    soundCyberGlitch(now) {
      for (let i = 0; i < 6; i++) {
        const t = now + i * 0.09;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180 + Math.random() * 1400, t);
        osc.frequency.exponentialRampToValueAtTime(90, t + 0.07);
        gain.gain.setValueAtTime(0.06, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.08);
      }
      const bass = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      bass.type = 'sawtooth';
      bass.frequency.setValueAtTime(130.81, now + 0.55);
      bass.frequency.exponentialRampToValueAtTime(36.71, now + 2.1);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1800, now + 0.55);
      filter.frequency.exponentialRampToValueAtTime(160, now + 2.1);
      gain.gain.setValueAtTime(0.001, now + 0.55);
      gain.gain.linearRampToValueAtTime(0.28, now + 0.6);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
      bass.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      bass.start(now + 0.55);
      bass.stop(now + 2.25);
    }

    soundWarpStarfield(now) {
      const sweep = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      sweep.type = 'sawtooth';
      sweep.frequency.setValueAtTime(55, now + 0.05);
      sweep.frequency.exponentialRampToValueAtTime(660, now + 0.95);
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(220, now + 0.05);
      filter.frequency.exponentialRampToValueAtTime(3200, now + 0.95);
      filter.Q.value = 3.5;
      gain.gain.setValueAtTime(0.001, now + 0.05);
      gain.gain.linearRampToValueAtTime(0.22, now + 0.85);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.15);
      sweep.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      sweep.start(now + 0.05);
      sweep.stop(now + 1.2);
      [523.25, 783.99, 1046.50, 1567.98].forEach((freq) => {
        const osc = this.ctx.createOscillator();
        const cGain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + 0.92);
        cGain.gain.setValueAtTime(0.001, now + 0.92);
        cGain.gain.linearRampToValueAtTime(0.09, now + 0.96);
        cGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.5);
        osc.connect(cGain);
        cGain.connect(this.ctx.destination);
        osc.start(now + 0.92);
        osc.stop(now + 2.55);
      });
    }

    soundNeonLaserEtch(now) {
      const laser = this.ctx.createOscillator();
      const lGain = this.ctx.createGain();
      laser.type = 'triangle';
      laser.frequency.setValueAtTime(1480, now + 0.08);
      laser.frequency.exponentialRampToValueAtTime(420, now + 0.85);
      lGain.gain.setValueAtTime(0.001, now + 0.08);
      lGain.gain.linearRampToValueAtTime(0.08, now + 0.14);
      lGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
      laser.connect(lGain);
      lGain.connect(this.ctx.destination);
      laser.start(now + 0.08);
      laser.stop(now + 0.95);
      [130.81, 174.61, 220.00, 261.63, 329.63].forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq * (i % 2 === 0 ? 1.003 : 0.997), now + 0.5);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(300, now + 0.5);
        filter.frequency.exponentialRampToValueAtTime(2100, now + 1.35);
        gain.gain.setValueAtTime(0.0001, now + 0.5);
        gain.gain.linearRampToValueAtTime(0.065, now + 0.95);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.7);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + 0.5);
        osc.stop(now + 2.75);
      });
    }
  }

  const soundEngine = new PixelBootAudio();

  /* ---------- intro definitions ---------- */
  const INTROS = [
    { id: 0, code: '01: CINEMA RIBBONS', subtitle: 'ULTRA-HIGH DEFINITION PIXEL CINEMA', animClass: 'anim-ribbons', emblemDelay: 420, wordmarkDelay: 920, underlineDelay: 1450, flashAt: 440 },
    { id: 1, code: '02: 8-BIT CONSOLE POWER-ON', subtitle: 'INSERT CARTRIDGE // 60FPS ARCADE ENGINE', animClass: 'anim-console', emblemDelay: 480, wordmarkDelay: 950, underlineDelay: 1480, flashAt: 160 },
    { id: 2, code: '03: CYBER GLITCH MATRIX', subtitle: 'NEURAL STREAM PROTOCOL // ONLINE', animClass: 'anim-glitch', emblemDelay: 450, wordmarkDelay: 880, underlineDelay: 1420, flashAt: 460 },
    { id: 3, code: '04: WARP SPEED STARFIELD', subtitle: 'HYPERSPACE OPTICAL TRANSMISSION', animClass: 'anim-warp', emblemDelay: 880, wordmarkDelay: 1250, underlineDelay: 1700, flashAt: 900 },
    { id: 4, code: '05: NEON LASER ETCH', subtitle: 'SYNTHWAVE VECTOR PROJECTION', animClass: 'anim-laser', emblemDelay: 680, wordmarkDelay: 1120, underlineDelay: 1600, flashAt: 700 },
  ];

  /* ---------- canvas FX engines ---------- */
  const canvas = document.getElementById('fx-canvas');
  const ctx = canvas ? canvas.getContext('2d') : null;
  let rafId = null;
  let activeTimers = [];
  let lastIntroIndex = -1;
  let running = false;

  function resizeCanvas() {
    if (!canvas) return;
    canvas.width = canvas.offsetWidth || window.innerWidth;
    canvas.height = canvas.offsetHeight || window.innerHeight;
  }
  window.addEventListener('resize', resizeCanvas);

  function triggerScreenFlash(color = '#ffffff') {
    const flash = document.getElementById('screen-flash');
    if (!flash) return;
    flash.style.backgroundColor = color;
    flash.classList.add('flash-now');
    requestAnimationFrame(() => {
      setTimeout(() => flash.classList.remove('flash-now'), 45);
    });
  }

  function startCanvasEffect(introIndex) {
    if (!ctx) return;
    if (rafId) cancelAnimationFrame(rafId);
    resizeCanvas();

    const startTime = performance.now();
    const w = () => canvas.width;
    const h = () => canvas.height;

    if (introIndex === 0) {
      const ribbons = Array.from({ length: 34 }, (_, i) => ({
        xOffset: (i - 17) * (w() / 24),
        width: 4 + Math.random() * 14,
        speed: 14 + Math.random() * 18,
        y: (Math.random() - 0.5) * h() * 2,
        len: 140 + Math.random() * 260,
        color: ['#e50914', '#ff2a6d', '#00f5d4', '#ffffff'][i % 4],
      }));
      const loop = (now) => {
        const elapsed = (now - startTime) / 1000;
        ctx.clearRect(0, 0, w(), h());
        const cx = w() / 2;
        const converge = Math.min(1, elapsed / 0.85);
        ribbons.forEach((r) => {
          r.y += r.speed;
          if (r.y > h() + r.len) r.y = -r.len;
          const currentX = cx + r.xOffset * (1 - converge * 0.92);
          const alpha = elapsed < 1.2 ? 0.85 : Math.max(0, 0.85 - (elapsed - 1.2) * 0.45);
          if (alpha > 0.01) {
            ctx.save();
            ctx.globalAlpha = alpha;
            const grad = ctx.createLinearGradient(0, r.y, 0, r.y + r.len);
            grad.addColorStop(0, 'transparent');
            grad.addColorStop(0.5, r.color);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.fillRect(currentX - r.width / 2, r.y, r.width, r.len);
            ctx.restore();
          }
        });
        if (elapsed > 0.42 && elapsed < 1.8) {
          const p = (elapsed - 0.42) / 1.38;
          ctx.save();
          ctx.strokeStyle = '#e50914';
          ctx.lineWidth = Math.max(1, 6 * (1 - p));
          ctx.globalAlpha = 1 - p;
          ctx.beginPath();
          ctx.arc(w() / 2, h() / 2, p * Math.max(w(), h()) * 0.55, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        rafId = requestAnimationFrame(loop);
      };
      rafId = requestAnimationFrame(loop);

    } else if (introIndex === 1) {
      const blockSize = 14;
      const blocks = Array.from({ length: 70 }, () => ({
        x: Math.floor((Math.random() * w()) / blockSize) * blockSize,
        y: -Math.random() * h(),
        vy: 10 + Math.random() * 14,
        color: ['#00f5d4', '#ff2a6d', '#e50914', '#facc15'][Math.floor(Math.random() * 4)],
        alpha: 0.9,
      }));
      const loop = (now) => {
        const elapsed = (now - startTime) / 1000;
        ctx.clearRect(0, 0, w(), h());
        blocks.forEach((b) => {
          b.y += b.vy;
          if (b.y > h()) b.y = -blockSize;
          const fade = elapsed > 1.3 ? Math.max(0, 1 - (elapsed - 1.3) * 0.6) : 1;
          ctx.save();
          ctx.globalAlpha = b.alpha * fade * 0.65;
          ctx.fillStyle = b.color;
          ctx.fillRect(b.x, Math.floor(b.y / blockSize) * blockSize, blockSize - 2, blockSize - 2);
          ctx.restore();
        });
        rafId = requestAnimationFrame(loop);
      };
      rafId = requestAnimationFrame(loop);

    } else if (introIndex === 2) {
      const cols = Math.floor(w() / 22);
      const drops = Array.from({ length: cols }, () => Math.random() * -40);
      const loop = (now) => {
        const elapsed = (now - startTime) / 1000;
        ctx.clearRect(0, 0, w(), h());
        ctx.font = '14px Silkscreen, monospace';
        for (let i = 0; i < drops.length; i++) {
          const char = Math.random() > 0.5 ? '1' : '0';
          const x = i * 22;
          const y = drops[i] * 22;
          ctx.fillStyle = i % 5 === 0 ? 'rgba(255, 42, 109, 0.35)' : 'rgba(0, 245, 212, 0.25)';
          ctx.fillText(char, x, y);
          if (y > h() && Math.random() > 0.96) drops[i] = 0;
          drops[i] += 0.65;
        }
        if (elapsed < 1.15) {
          for (let g = 0; g < 8; g++) {
            const gy = Math.random() * h();
            const gh = 2 + Math.random() * 14;
            ctx.fillStyle = g % 2 === 0 ? 'rgba(0, 245, 212, 0.35)' : 'rgba(255, 42, 109, 0.35)';
            ctx.fillRect(0, gy, w(), gh);
          }
        }
        rafId = requestAnimationFrame(loop);
      };
      rafId = requestAnimationFrame(loop);

    } else if (introIndex === 3) {
      const stars = Array.from({ length: 180 }, () => ({
        x: (Math.random() - 0.5) * 2000,
        y: (Math.random() - 0.5) * 2000,
        z: Math.random() * 1800 + 100,
        color: ['#ffffff', '#00f5d4', '#ff2a6d', '#e50914'][Math.floor(Math.random() * 4)],
      }));
      const loop = (now) => {
        const elapsed = (now - startTime) / 1000;
        ctx.clearRect(0, 0, w(), h());
        const cx = w() / 2;
        const cy = h() / 2;
        const speed = elapsed < 0.9 ? 58 : 6;
        stars.forEach((s) => {
          const prevZ = s.z;
          s.z -= speed;
          if (s.z <= 1) {
            s.z = 1800;
            s.x = (Math.random() - 0.5) * 2000;
            s.y = (Math.random() - 0.5) * 2000;
            return;
          }
          const sx = cx + (s.x / s.z) * 420;
          const sy = cy + (s.y / s.z) * 420;
          const px = cx + (s.x / prevZ) * 420;
          const py = cy + (s.y / prevZ) * 420;
          ctx.save();
          ctx.strokeStyle = s.color;
          ctx.lineWidth = Math.max(1.5, (1 - s.z / 1800) * 4);
          ctx.globalAlpha = Math.min(1, (1 - s.z / 1800) * 1.3);
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(sx, sy);
          ctx.stroke();
          ctx.restore();
        });
        rafId = requestAnimationFrame(loop);
      };
      rafId = requestAnimationFrame(loop);

    } else if (introIndex === 4) {
      const embers = Array.from({ length: 55 }, () => ({
        x: Math.random() * w(),
        y: h() + Math.random() * 200,
        vy: 1.5 + Math.random() * 3,
        size: 3 + Math.random() * 4,
        color: Math.random() > 0.5 ? '#00f5d4' : '#ff2a6d',
      }));
      const loop = (now) => {
        const elapsed = (now - startTime) / 1000;
        ctx.clearRect(0, 0, w(), h());
        const cx = w() / 2;
        const cy = h() / 2;
        embers.forEach((e) => {
          e.y -= e.vy;
          if (e.y < -10) e.y = h() + 10;
          ctx.fillStyle = e.color;
          ctx.globalAlpha = 0.55;
          ctx.fillRect(e.x, e.y, e.size, e.size);
        });
        ctx.globalAlpha = 1;
        const progress = Math.min(1, elapsed / 0.72);
        const radius = Math.min(w(), h()) * 0.24;
        const vertices = [
          { x: cx, y: cy - radius },
          { x: cx + radius * 1.25, y: cy },
          { x: cx, y: cy + radius },
          { x: cx - radius * 1.25, y: cy },
          { x: cx, y: cy - radius },
        ];
        const frameAlpha = elapsed > 1.2 ? Math.max(0.18, 1 - (elapsed - 1.2) * 0.45) : 0.95;
        ctx.save();
        ctx.globalAlpha = frameAlpha;
        ctx.strokeStyle = '#00f5d4';
        ctx.shadowColor = '#00f5d4';
        ctx.shadowBlur = 18;
        ctx.lineWidth = 2.5;
        const totalSegs = 4;
        const scaled = progress * totalSegs;
        ctx.beginPath();
        ctx.moveTo(vertices[0].x, vertices[0].y);
        let tipX = vertices[0].x;
        let tipY = vertices[0].y;
        for (let i = 0; i < totalSegs; i++) {
          const segProg = Math.max(0, Math.min(1, scaled - i));
          if (segProg > 0) {
            tipX = vertices[i].x + (vertices[i + 1].x - vertices[i].x) * segProg;
            tipY = vertices[i].y + (vertices[i + 1].y - vertices[i].y) * segProg;
            ctx.lineTo(tipX, tipY);
          }
        }
        ctx.stroke();
        if (progress < 1) {
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = '#ff2a6d';
          ctx.shadowBlur = 24;
          ctx.beginPath();
          ctx.arc(tipX, tipY, 5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        rafId = requestAnimationFrame(loop);
      };
      rafId = requestAnimationFrame(loop);
    }
  }

  /* ---------- orchestrator ---------- */
  function clearScheduledTimers() {
    activeTimers.forEach((id) => clearTimeout(id));
    activeTimers = [];
  }

  function scrambleWordmarkDecode(chars) {
    const hexPool = '01X#%&@$*';
    chars.forEach((charEl, idx) => {
      const finalChar = charEl.dataset.target;
      charEl.classList.add('visible');
      let ticks = 0;
      const maxTicks = 5 + idx * 2;
      const interval = setInterval(() => {
        ticks++;
        if (ticks >= maxTicks) {
          charEl.textContent = finalChar;
          clearInterval(interval);
        } else {
          charEl.textContent = hexPool[Math.floor(Math.random() * hexPool.length)];
        }
      }, 42);
      activeTimers.push(setTimeout(() => clearInterval(interval), maxTicks * 42 + 200));
    });
  }

  function playBootupIntro(forcedIndex = null) {
    const emblemBox = document.getElementById('emblem-box');
    if (!emblemBox) return;

    running = true;
    clearScheduledTimers();

    let chosenIndex = forcedIndex;
    if (chosenIndex === null || chosenIndex === undefined) {
      do {
        chosenIndex = Math.floor(Math.random() * INTROS.length);
      } while (chosenIndex === lastIntroIndex && INTROS.length > 1);
    }
    lastIntroIndex = chosenIndex;

    const config = INTROS[chosenIndex];
    const emblemHalo = document.getElementById('emblem-halo');
    const badgeEl = document.getElementById('sequence-badge');
    const subtitleEl = document.getElementById('boot-subtitle');
    const underlineEl = document.getElementById('laser-underline');
    const chars = Array.from(document.querySelectorAll('#loader .wordmark-char'));

    badgeEl.textContent = `BOOT SEQUENCE // ${config.code}`;
    subtitleEl.textContent = config.subtitle;

    document.querySelectorAll('#loader .intro-pill').forEach((pill) => {
      pill.classList.toggle('current', Number(pill.dataset.intro) === chosenIndex);
    });

    /* reset */
    emblemBox.className = 'emblem-box';
    emblemBox.classList.remove('anim-ribbons', 'anim-console', 'anim-glitch', 'anim-warp', 'anim-laser');
    if (emblemHalo) emblemHalo.classList.remove('active');
    if (underlineEl) underlineEl.classList.remove('expand');
    if (subtitleEl) { subtitleEl.classList.remove('opacity-100'); }
    chars.forEach((c) => { c.classList.remove('visible'); c.textContent = c.dataset.target; });

    /* reflow so animations restart cleanly */
    void emblemBox.offsetWidth;

    startCanvasEffect(chosenIndex);
    soundEngine.playSignature(chosenIndex);

    if (config.flashAt) {
      activeTimers.push(setTimeout(() => {
        const flashColor = chosenIndex === 2 ? '#00f5d4' : chosenIndex === 0 ? '#ff2a6d' : '#ffffff';
        triggerScreenFlash(flashColor);
      }, config.flashAt));
    }

    activeTimers.push(setTimeout(() => {
      emblemBox.classList.add(config.animClass);
      if (emblemHalo) emblemHalo.classList.add('active');
    }, config.emblemDelay));

    activeTimers.push(setTimeout(() => {
      if (chosenIndex === 2) {
        scrambleWordmarkDecode(chars);
      } else {
        chars.forEach((charEl, idx) => {
          activeTimers.push(setTimeout(() => charEl.classList.add('visible'), idx * 55));
        });
      }
    }, config.wordmarkDelay));

    activeTimers.push(setTimeout(() => {
      if (underlineEl) underlineEl.classList.add('expand');
      if (subtitleEl) subtitleEl.classList.add('opacity-100');
    }, config.underlineDelay));
  }

  function stopAll() {
    running = false;
    clearScheduledTimers();
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  /* ---------- wiring ---------- */
  const randomBtn = document.getElementById('random-replay-btn');
  if (randomBtn) randomBtn.addEventListener('click', () => {
    soundEngine.ensureContext();
    playBootupIntro(null);
  });

  document.querySelectorAll('#loader .intro-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      soundEngine.ensureContext();
      playBootupIntro(Number(pill.dataset.intro));
    });
  });

  const audioBtn = document.getElementById('audio-btn');
  if (audioBtn) audioBtn.addEventListener('click', () => {
    if (!soundEngine.ctx || soundEngine.ctx.state !== 'running') {
      soundEngine.isMuted = false;
      soundEngine.ensureContext();
      setTimeout(() => playBootupIntro(lastIntroIndex >= 0 ? lastIntroIndex : null), 40);
      return;
    }
    soundEngine.isMuted = !soundEngine.isMuted;
    soundEngine.updateUI();
    if (!soundEngine.isMuted) {
      playBootupIntro(lastIntroIndex >= 0 ? lastIntroIndex : null);
    }
  });

  window.addEventListener('keydown', (e) => {
    const loader = document.getElementById('loader');
    if (!loader || loader.classList.contains('hide')) return;
    if (e.code === 'Space' && document.activeElement.tagName !== 'BUTTON' && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault();
      soundEngine.ensureContext();
      playBootupIntro(null);
    }
  });

  /* Expose for boot.js */
  window.PIXELBootCinema = {
    play: playBootupIntro,
    stop: stopAll,
    lastIntro: () => lastIntroIndex,
  };

  /* Try the real logo.png first; fall back to the pixel SVG if missing */
  const logoImg = document.getElementById('logo-img');
  if (logoImg) {
    logoImg.addEventListener('error', triggerLogoFallback);
    if (logoImg.complete && logoImg.naturalWidth === 0) triggerLogoFallback();
  }
})();
