// Canvas renderer — portrait mode, mobile-first
// Logical resolution 160x288 (portrait ~5:9), rendered at dynamic scale

const PALETTES = {
  gbc: ['#081820', '#346856', '#88c070', '#e0f8d0'],
  warm: ['#1b0326', '#7a2048', '#d35e2e', '#e8c170'],
  cool: ['#0d1b2a', '#1b4965', '#5fa8d3', '#bee9e8'],
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 160;  // logical width
    this.height = 288; // logical height (portrait)
    this.scale = 3;    // will be recalculated
    this.palette = PALETTES.gbc;

    this.shakeTimer = 0;
    this.shakeIntensity = 0;
    this.flashTimer = 0;
    this.flashColor = null;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const sw = window.innerWidth;
    const sh = window.innerHeight;
    const aspect = this.width / this.height;
    const screenAspect = sw / sh;

    // Compute scale to fill screen
    if (screenAspect > aspect) {
      // Screen wider than canvas — fit to height
      this.scale = Math.max(1, Math.floor(sh / this.height));
    } else {
      // Screen taller — fit to width
      this.scale = Math.max(1, Math.floor(sw / this.width));
    }
    // Cap scale for very large screens
    this.scale = Math.min(this.scale, 5);

    this.canvas.width = this.width * this.scale;
    this.canvas.height = this.height * this.scale;

    // CSS sizing
    const cw = this.width * this.scale;
    const ch = this.height * this.scale;
    if (cw / ch > sw / sh) {
      this.canvas.style.width = sw + 'px';
      this.canvas.style.height = Math.floor(sw / (cw / ch)) + 'px';
    } else {
      this.canvas.style.height = sh + 'px';
      this.canvas.style.width = Math.floor(sh * (cw / ch)) + 'px';
    }
  }

  px(v) { return Math.floor(v * this.scale); }

  setPalette(name) { this.palette = PALETTES[name] || PALETTES.gbc; }

  clear(colorIndex = 0) {
    this.ctx.fillStyle = this.palette[colorIndex];
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  rect(x, y, w, h, colorIndex) {
    this.ctx.fillStyle = this.palette[colorIndex];
    this.ctx.fillRect(this.px(x), this.px(y), this.px(w), this.px(h));
  }

  rectColor(x, y, w, h, color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(this.px(x), this.px(y), this.px(w), this.px(h));
  }

  strokeRect(x, y, w, h, colorIndex) {
    this.ctx.strokeStyle = this.palette[colorIndex];
    this.ctx.lineWidth = this.scale;
    this.ctx.strokeRect(this.px(x), this.px(y), this.px(w), this.px(h));
  }

  circle(cx, cy, r, colorIndex) {
    this.ctx.fillStyle = this.palette[colorIndex];
    this.ctx.beginPath();
    this.ctx.arc(this.px(cx), this.px(cy), this.px(r), 0, Math.PI * 2);
    this.ctx.fill();
  }

  circleColor(cx, cy, r, color) {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(this.px(cx), this.px(cy), this.px(r), 0, Math.PI * 2);
    this.ctx.fill();
  }

  strokeCircle(cx, cy, r, color, lineWidth = 2) {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth * this.scale;
    this.ctx.beginPath();
    this.ctx.arc(this.px(cx), this.px(cy), this.px(r), 0, Math.PI * 2);
    this.ctx.stroke();
  }

  text(str, x, y, colorIndex = 3, size = 8, align = 'left') {
    this.ctx.fillStyle = this.palette[colorIndex];
    this.ctx.font = `${size * this.scale}px "Press Start 2P", monospace`;
    this.ctx.textAlign = align;
    this.ctx.textBaseline = 'top';
    const lines = str.split('\n');
    lines.forEach((line, i) => {
      this.ctx.fillText(line, this.px(x), this.px(y) + i * (size + 2) * this.scale);
    });
  }

  textColor(str, x, y, color, size = 8, align = 'left') {
    this.ctx.fillStyle = color;
    this.ctx.font = `${size * this.scale}px "Press Start 2P", monospace`;
    this.ctx.textAlign = align;
    this.ctx.textBaseline = 'top';
    const lines = str.split('\n');
    lines.forEach((line, i) => {
      this.ctx.fillText(line, this.px(x), this.px(y) + i * (size + 2) * this.scale);
    });
  }

  // Width of a string in logical units — for laying out next to centered text
  measureText(str, size = 8) {
    this.ctx.font = `${size * this.scale}px "Press Start 2P", monospace`;
    return this.ctx.measureText(str).width / this.scale;
  }

  // Pixel-art flame. Replaces the 🔥 emoji, which fell back to the system emoji
  // font — different metrics and baseline from "Press Start 2P", so it never
  // lined up with the text it sat beside.
  // px must stay an integer: cells are floored onto the pixel grid, so a
  // fractional size makes neighbouring cells overlap and the shape turns to mush.
  flame(x, y, px = 1, flicker = 0) {
    const FLAME = [
      '...2...',
      '..22...',
      '..212..',
      '.2212..',
      '.21012.',
      '2210122',
      '2100012',
      '2100012',
      '.21012.',
      '..222..',
    ];
    const COLORS = { '0': '#f8e070', '1': '#e8a020', '2': '#e05050' };
    const s = Math.max(1, Math.round(px));
    const ox = Math.round(x), oy = Math.round(y);
    // Flicker nudges the top rows sideways so the tip dances a little
    for (let row = 0; row < FLAME.length; row++) {
      const wobble = row < 3 ? flicker : 0;
      for (let col = 0; col < FLAME[row].length; col++) {
        const c = FLAME[row][col];
        if (c === '.') continue;
        this.rectColor(ox + (col + wobble) * s, oy + row * s, s, s, COLORS[c]);
      }
    }
  }

  get flameWidth() { return 7; }
  get flameHeight() { return 10; }

  // Speaker icon for the music toggle — waves when on, a cross when muted.
  // Same integer-cell rule as flame(): fractional px turns it to mush.
  speakerIcon(x, y, px, muted, color) {
    const s = Math.max(1, Math.round(px));
    const ox = Math.round(x), oy = Math.round(y);
    const BODY = ['..2', '.22', '222', '222', '222', '.22', '..2'];
    for (let r = 0; r < BODY.length; r++) {
      for (let c = 0; c < BODY[r].length; c++) {
        if (BODY[r][c] === '2') this.rectColor(ox + c * s, oy + r * s, s, s, color);
      }
    }
    const gx = ox + 4 * s;
    if (muted) {
      for (let i = 0; i < 3; i++) {
        this.rectColor(gx + i * s, oy + (2 + i) * s, s, s, color);
        this.rectColor(gx + (2 - i) * s, oy + (2 + i) * s, s, s, color);
      }
    } else {
      this.rectColor(gx, oy + 2 * s, s, s, color);
      this.rectColor(gx, oy + 4 * s, s, s, color);
      this.rectColor(gx + s, oy + s, s, s, color);
      this.rectColor(gx + s, oy + 5 * s, s, s, color);
    }
  }

  // Draw an image in logical coords
  drawImage(img, x, y, w, h) {
    if (!img || !img.complete) return;
    this.ctx.drawImage(img, this.px(x), this.px(y), this.px(w), this.px(h));
  }

  drawImageAlpha(img, x, y, w, h, alpha) {
    if (!img || !img.complete) return;
    this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(img, this.px(x), this.px(y), this.px(w), this.px(h));
    this.ctx.globalAlpha = 1;
  }

  // Draw image flipped horizontally (mirror) — for matching selfie camera view
  drawImageFlipped(img, x, y, w, h) {
    if (!img || !img.complete) return;
    this.ctx.save();
    this.ctx.translate(this.px(x) + this.px(w), this.px(y));
    this.ctx.scale(-1, 1);
    this.ctx.drawImage(img, 0, 0, this.px(w), this.px(h));
    this.ctx.restore();
  }

  drawImageFlippedAlpha(img, x, y, w, h, alpha) {
    if (!img || !img.complete) return;
    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    this.ctx.translate(this.px(x) + this.px(w), this.px(y));
    this.ctx.scale(-1, 1);
    this.ctx.drawImage(img, 0, 0, this.px(w), this.px(h));
    this.ctx.restore();
  }

  // Draw video/image mirrored within a specific region (for webcam selfie mode)
  drawMirrored(img, x, y, w, h) {
    this.ctx.save();
    this.ctx.translate(this.px(x) + this.px(w), this.px(y));
    this.ctx.scale(-1, 1);
    this.ctx.drawImage(img, 0, 0, this.px(w), this.px(h));
    this.ctx.restore();
  }

  progressBar(x, y, w, h, progress, bgColor = 0, fillColor = 2) {
    this.rect(x, y, w, h, bgColor);
    const fill = Math.floor((w - 2) * Math.min(progress, 1));
    if (fill > 0) this.rect(x + 1, y + 1, fill, h - 2, fillColor);
  }

  progressBarColor(x, y, w, h, progress, bgColor, fillColor) {
    this.rectColor(x, y, w, h, bgColor);
    const fill = Math.floor((w - 2) * Math.min(progress, 1));
    if (fill > 0) this.rectColor(x + 1, y + 1, fill, h - 2, fillColor);
  }

  hearts(x, y, current, max) {
    for (let i = 0; i < max; i++) {
      this.textColor('♥', x + i * 12, y, i < current ? '#e05050' : '#333333', 10);
    }
  }

  // Screen effects
  shake(intensity = 3, duration = 300) {
    this.shakeIntensity = intensity;
    this.shakeTimer = duration;
  }

  flash(color = '#ffffff', duration = 150) {
    this.flashColor = color;
    this.flashTimer = duration;
  }

  applyEffects(dt) {
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
      const ox = (Math.random() - 0.5) * this.shakeIntensity * 2 * this.scale;
      const oy = (Math.random() - 0.5) * this.shakeIntensity * 2 * this.scale;
      this.ctx.translate(ox, oy);
    }
    if (this.flashTimer > 0) this.flashTimer -= dt;
  }

  drawFlash() {
    if (this.flashTimer > 0 && this.flashColor) {
      this.ctx.fillStyle = this.flashColor;
      this.ctx.globalAlpha = this.flashTimer / 300;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.globalAlpha = 1;
    }
  }

  irisWipe(progress) {
    const p = Math.max(0, Math.min(1, progress));
    if (p <= 0) return;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    if (p >= 1) { this.ctx.fillStyle = '#000'; this.ctx.fillRect(0, 0, cw, ch); return; }
    const cx = cw / 2, cy = ch / 2;
    const maxR = Math.hypot(cx, cy);
    const r = maxR * (1 - p);
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(0, 0, cw, ch);
    this.ctx.arc(cx, cy, r, 0, Math.PI * 2, true);
    this.ctx.fillStyle = '#000';
    this.ctx.fill('evenodd');
    this.ctx.restore();
  }

  drawHandLandmarks(landmarks, ox, oy, w, h, color = '#88c070') {
    if (!landmarks) return;
    const s = this.scale;
    const connections = [
      [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],
      [0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],
      [0,17],[17,18],[18,19],[19,20],[5,9],[9,13],[13,17]
    ];
    const lx = v => this.px(ox) + v * this.px(w);
    const ly = v => this.px(oy) + v * this.px(h);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = s;
    connections.forEach(([a, b]) => {
      this.ctx.beginPath();
      this.ctx.moveTo(lx(landmarks[a].x), ly(landmarks[a].y));
      this.ctx.lineTo(lx(landmarks[b].x), ly(landmarks[b].y));
      this.ctx.stroke();
    });
    this.ctx.fillStyle = color;
    landmarks.forEach(lm => {
      this.ctx.fillRect(lx(lm.x) - s, ly(lm.y) - s, s * 2, s * 2);
    });
  }

  // Convert screen tap to logical coordinates
  screenToLogical(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / rect.width * this.width,
      y: (clientY - rect.top) / rect.height * this.height,
    };
  }
}
