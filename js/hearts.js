/**
 * Floating Hearts & Romantic Sparkles Canvas
 * Ceylin's Love Diary
 */

class RomanticCanvas {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.sparkles = [];
    this.maxParticles = window.innerWidth < 768 ? 20 : 35;
    this.colors = [
      'rgba(244, 114, 182, 0.45)', // Rose pink
      'rgba(251, 113, 133, 0.4)',  // Soft red
      'rgba(248, 187, 208, 0.5)',  // Pastel blush
      'rgba(225, 29, 72, 0.35)',   // Deep rose
      'rgba(254, 205, 211, 0.4)'   // Whisper pink
    ];

    this.init();
  }

  init() {
    this.resize();
    window.addEventListener('resize', () => this.resize());
    
    // Seed initial particles
    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push(this.createParticle(true));
    }

    // Interactive clicks & mobile touch taps spawn heart bursts
    let lastBurstTime = 0;
    const triggerBurst = (x, y, target) => {
      if (!target) return;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (target.id === 'love-draw-canvas' || (target.closest && target.closest('#draw-canvas-wrapper'))) return;

      const now = Date.now();
      if (now - lastBurstTime < 50) return; // Debounce multi-touch / click overlap
      lastBurstTime = now;

      // Spawns vibrant floating hearts at tap position
      this.createBurst(x, y, window.innerWidth < 768 ? 12 : 9);
    };

    // 1. Pointerdown (Instant response on mobile touch & desktop clicks)
    window.addEventListener('pointerdown', (e) => {
      triggerBurst(e.clientX, e.clientY, e.target);
    }, { passive: true });

    // 2. Touchstart fallback for all mobile touchscreens
    window.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches.length > 0) {
        const touch = e.touches[0];
        triggerBurst(touch.clientX, touch.clientY, e.target);
      }
    }, { passive: true });

    this.animate();
  }

  resize() {
    this.width = this.canvas.width = window.innerWidth;
    this.height = this.canvas.height = window.innerHeight;
    this.maxParticles = window.innerWidth < 768 ? 18 : 32;
  }

  createParticle(randomY = false) {
    const size = Math.random() * 16 + 10;
    return {
      x: Math.random() * this.width,
      y: randomY ? Math.random() * this.height : this.height + size + Math.random() * 20,
      size: size,
      speedY: Math.random() * 0.9 + 0.4,
      speedX: (Math.random() - 0.5) * 0.6,
      wobbleSpeed: Math.random() * 0.03 + 0.015,
      wobbleOffset: Math.random() * Math.PI * 2,
      opacity: Math.random() * 0.5 + 0.25,
      rotation: (Math.random() - 0.5) * 0.4,
      rotationSpeed: (Math.random() - 0.5) * 0.02,
      color: this.colors[Math.floor(Math.random() * this.colors.length)]
    };
  }

  createBurst(x, y, burstCount = 10) {
    for (let i = 0; i < burstCount; i++) {
      const angle = (Math.PI * 2 / burstCount) * i + (Math.random() - 0.5) * 0.4;
      const velocity = Math.random() * 3.8 + 1.8;
      this.sparkles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - 1.8,
        size: Math.random() * 15 + 9,
        opacity: 1,
        decay: Math.random() * 0.018 + 0.012,
        rotation: Math.random() * Math.PI * 2,
        color: this.colors[Math.floor(Math.random() * this.colors.length)]
      });
    }
  }

  drawHeart(x, y, size, opacity, rotation, color) {
    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.rotate(rotation);
    this.ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
    this.ctx.fillStyle = color;

    this.ctx.beginPath();
    const topCurveHeight = size * 0.3;
    this.ctx.moveTo(0, topCurveHeight);
    // Left curve
    this.ctx.bezierCurveTo(
      -size / 2, -topCurveHeight,
      -size, size / 3,
      0, size
    );
    // Right curve
    this.ctx.bezierCurveTo(
      size, size / 3,
      size / 2, -topCurveHeight,
      0, topCurveHeight
    );
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.restore();
  }

  animate() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Update & draw background floating hearts
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.y -= p.speedY;
      p.wobbleOffset += p.wobbleSpeed;
      p.x += Math.sin(p.wobbleOffset) * 0.8 + p.speedX;
      p.rotation += p.rotationSpeed;

      this.drawHeart(p.x, p.y, p.size, p.opacity, p.rotation, p.color);

      // Reset when particle goes above screen
      if (p.y < -p.size - 20 || p.x < -40 || p.x > this.width + 40) {
        this.particles[i] = this.createParticle(false);
      }
    }

    // Update & draw burst sparkles
    for (let i = this.sparkles.length - 1; i >= 0; i--) {
      const s = this.sparkles[i];
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.05; // Gentle gravity
      s.opacity -= s.decay;
      s.rotation += 0.04;

      if (s.opacity <= 0) {
        this.sparkles.splice(i, 1);
        continue;
      }

      this.drawHeart(s.x, s.y, s.size, s.opacity, s.rotation, s.color);
    }

    requestAnimationFrame(() => this.animate());
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.romanticCanvas = new RomanticCanvas('hearts-canvas');
});
