// Canvas renderer with GameBoy Color palette and retro effects
// Uses a 3x scale factor: game logic uses 160x144, canvas renders at 480x432

const PALETTES = {
  green: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
  gbc: ['#081820', '#346856', '#88c070', '#e0f8d0'],
  warm: ['#1b0326', '#7a2048', '#d35e2e', '#e8c170'],
  cool: ['#0d1b2a', '#1b4965', '#5fa8d3', '#bee9e8'],
};

const S = 3; // scale factor

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    // Logical resolution (what game code uses)
    this.width = 160;
    this.height = 144;
    this.scale = S;
    // Physical canvas resolution
    this.canvas.width = this.width * S;
    this.canvas.height = this.height * S;
    this.palette = PALETTES.gbc;
    this.shakeTimer = 0;
    this.shakeIntensity = 0;
    this.flashTimer = 0;
    this.flashColor = null;
  }

  // Convert logical coord to physical
  px(v) { return Math.floor(v * S); }

  setPalette(name) {
    this.palette = PALETTES[name] || PALETTES.gbc;
  }

  clear(colorIndex = 0) {
    this.ctx.fillStyle = this.palette[colorIndex];
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  rect(x, y, w, h, colorIndex) {
    this.ctx.fillStyle = this.palette[colorIndex];
    this.ctx.fillRect(this.px(x), this.px(y), this.px(w), this.px(h));
  }

  strokeRect(x, y, w, h, colorIndex) {
    this.ctx.strokeStyle = this.palette[colorIndex];
    this.ctx.lineWidth = S;
    this.ctx.strokeRect(this.px(x) + 0.5, this.px(y) + 0.5, this.px(w) - 1, this.px(h) - 1);
  }

  text(str, x, y, colorIndex = 3, size = 8, align = 'left') {
    this.ctx.fillStyle = this.palette[colorIndex];
    this.ctx.font = `${size * S}px "Press Start 2P", monospace`;
    this.ctx.textAlign = align;
    this.ctx.textBaseline = 'top';
    const lines = str.split('\n');
    lines.forEach((line, i) => {
      this.ctx.fillText(line, this.px(x), this.px(y) + i * (size + 2) * S);
    });
  }

  textColor(str, x, y, color, size = 8, align = 'left') {
    this.ctx.fillStyle = color;
    this.ctx.font = `${size * S}px "Press Start 2P", monospace`;
    this.ctx.textAlign = align;
    this.ctx.textBaseline = 'top';
    const lines = str.split('\n');
    lines.forEach((line, i) => {
      this.ctx.fillText(line, this.px(x), this.px(y) + i * (size + 2) * S);
    });
  }

  sprite(data, x, y, scale = 1) {
    const ps = scale * S; // physical pixel size per sprite pixel
    for (let row = 0; row < data.length; row++) {
      for (let col = 0; col < data[row].length; col++) {
        const ci = data[row][col];
        if (ci >= 0) {
          this.ctx.fillStyle = this.palette[ci];
          this.ctx.fillRect(
            this.px(x) + col * ps,
            this.px(y) + row * ps,
            ps, ps
          );
        }
      }
    }
  }

  drawWebcamGBC(videoEl, processCanvas, opacity = 0.3) {
    if (!videoEl || videoEl.readyState < videoEl.HAVE_ENOUGH_DATA) return;
    const pw = this.canvas.width;
    const ph = this.canvas.height;
    const pCtx = processCanvas.getContext('2d');
    processCanvas.width = pw;
    processCanvas.height = ph;
    pCtx.drawImage(videoEl, 0, 0, pw, ph);
    const imgData = pCtx.getImageData(0, 0, pw, ph);
    const data = imgData.data;
    const colors = this.palette.map(hex => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return [r, g, b];
    });
    // Pixelate in 3x3 blocks for retro feel
    const block = S;
    for (let by = 0; by < ph; by += block) {
      for (let bx = 0; bx < pw; bx += block) {
        const i = (by * pw + bx) * 4;
        const gray = data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114;
        let ci;
        if (gray > 190) ci = 3;
        else if (gray > 120) ci = 2;
        else if (gray > 60) ci = 1;
        else ci = 0;
        const c = colors[ci];
        for (let dy = 0; dy < block && by+dy < ph; dy++) {
          for (let dx = 0; dx < block && bx+dx < pw; dx++) {
            const j = ((by+dy) * pw + (bx+dx)) * 4;
            data[j] = c[0]; data[j+1] = c[1]; data[j+2] = c[2];
            data[j+3] = Math.floor(opacity * 255);
          }
        }
      }
    }
    pCtx.putImageData(imgData, 0, 0);
    this.ctx.globalAlpha = opacity;
    this.ctx.drawImage(processCanvas, 0, 0);
    this.ctx.globalAlpha = 1;
  }

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
      const ox = (Math.random() - 0.5) * this.shakeIntensity * 2 * S;
      const oy = (Math.random() - 0.5) * this.shakeIntensity * 2 * S;
      this.ctx.translate(ox, oy);
    }
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
    }
  }

  drawFlash() {
    if (this.flashTimer > 0 && this.flashColor) {
      this.ctx.fillStyle = this.flashColor;
      this.ctx.globalAlpha = this.flashTimer / 300;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.globalAlpha = 1;
    }
  }

  progressBar(x, y, w, h, progress, bgColor = 0, fillColor = 2) {
    this.rect(x, y, w, h, bgColor);
    const fill = Math.floor((w - 2) * Math.min(progress, 1));
    this.rect(x + 1, y + 1, fill, h - 2, fillColor);
  }

  hearts(x, y, current, max) {
    for (let i = 0; i < max; i++) {
      if (i < current) {
        this.textColor('♥', x + i * 10, y, '#e05050', 8);
      } else {
        this.textColor('♥', x + i * 10, y, '#444444', 8);
      }
    }
  }

  irisWipe(progress) {
    const p = Math.max(0, Math.min(1, progress));
    if (p <= 0) return;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    if (p >= 1) { this.ctx.fillStyle = '#000'; this.ctx.fillRect(0, 0, cw, ch); return; }
    const cx = cw / 2;
    const cy = ch / 2;
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

  drawHandLandmarks(landmarks, color = '#88c070') {
    if (!landmarks) return;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const connections = [
      [0,1],[1,2],[2,3],[3,4],
      [0,5],[5,6],[6,7],[7,8],
      [0,9],[9,10],[10,11],[11,12],
      [0,13],[13,14],[14,15],[15,16],
      [0,17],[17,18],[18,19],[19,20],
      [5,9],[9,13],[13,17]
    ];
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = S;
    connections.forEach(([a, b]) => {
      const la = landmarks[a];
      const lb = landmarks[b];
      this.ctx.beginPath();
      this.ctx.moveTo(la.x * cw, la.y * ch);
      this.ctx.lineTo(lb.x * cw, lb.y * ch);
      this.ctx.stroke();
    });
    this.ctx.fillStyle = color;
    const dotR = S + 1;
    landmarks.forEach(lm => {
      this.ctx.fillRect(
        Math.floor(lm.x * cw) - dotR,
        Math.floor(lm.y * ch) - dotR,
        dotR * 2, dotR * 2
      );
    });
  }
}
