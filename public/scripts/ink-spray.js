const canvas = document.getElementById("ink-canvas");
const ctx = canvas?.getContext("2d");

if (canvas && ctx) {
  const dpr = Math.max(1, window.devicePixelRatio || 1);

  const resizeCanvas = () => {
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  let drawing = false;
  const stars = [];

  ctx.globalCompositeOperation = "source-over";

  class StarBurst {
    constructor(x, y, size, rotation, alpha, rays, jitter) {
      this.x = x;
      this.y = y;
      this.size = size;
      this.rotation = rotation;
      this.alpha = alpha;
      this.rays = rays;
      this.jitter = jitter;
      this.rotZ = rotation;
      this.velZ = (Math.random() - 0.5) * 0.01;
      this.lengthJitter = Array.from({ length: this.rays }, () => 0.7 + Math.random() * 0.4);
      this.dashPattern = [1 + Math.random() * 3, 2 + Math.random() * 4];
      this.angleJitter = Array.from({ length: this.rays }, () => (Math.random() - 0.5) * this.jitter);
    }

    update() {
      this.rotZ += this.velZ;
    }

    draw(context) {
      context.save();
      context.translate(this.x, this.y);
      context.rotate(this.rotZ);
      context.strokeStyle = `rgba(0, 0, 0, ${this.alpha})`;
      context.lineWidth = 0.9;
      context.lineCap = "round";
      context.setLineDash(this.dashPattern);

      // Radiating star rays with 2D spin
      context.beginPath();
      for (let i = 0; i < this.rays; i += 1) {
        const angle = (Math.PI * 2 / this.rays) * i + this.angleJitter[i];
        const length = this.size * this.lengthJitter[i] * 1.2;
        const x = Math.cos(angle) * length;
        const y = Math.sin(angle) * length;
        context.moveTo(0, 0);
        context.lineTo(x, y);
      }
      context.stroke();
      context.setLineDash([]);

      // Small center dot
      context.fillStyle = `rgba(0, 0, 0, ${Math.min(1, this.alpha + 0.2)})`;
      context.beginPath();
      context.arc(0, 0, Math.max(1, this.size * 0.12), 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
  }

  const drawStar = (x, y, pressure = 0.5) => {
    const size = 6 + pressure * 10;
    const rotation = Math.random() * Math.PI * 2;
    const alpha = 0.35 + Math.random() * 0.45;
    const rays = Math.floor(6 + Math.random() * 7);
    const jitter = 0.35 + Math.random() * 0.35;
    const star = new StarBurst(x, y, size, rotation, alpha, rays, jitter);
    stars.push(star);
  };

  const onPointerDown = (event) => {
    if (!(event.target instanceof Element)) return;
    drawing = true;
    drawStar(event.clientX, event.clientY, event.pressure || 0.5);
  };

  const onPointerUp = () => {
    drawing = false;
  };

  const render = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stars.forEach((star) => {
      star.update();
      star.draw(ctx);
    });
    requestAnimationFrame(render);
  };

  render();

  document.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("pointerup", onPointerUp);
  document.addEventListener("pointercancel", onPointerUp);
}
