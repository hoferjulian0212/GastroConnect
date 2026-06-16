import { useCallback } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  w: number;
  h: number;
  opacity: number;
  shape: "rect" | "circle";
}

export type ConfettiOrigin = "top" | "center" | "bottom-center";

export function useConfetti() {
  const fire = useCallback((origin: ConfettiOrigin = "top") => {
    const canvas = document.createElement("canvas");
    canvas.style.cssText =
      "position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99999;";
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d")!;

    const colors = [
      "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6",
      "#ec4899", "#ef4444", "#6366f1", "#14b8a6",
      "#f97316", "#a855f7",
    ];

    const cx = canvas.width / 2;
    let startY: number;
    let spread: number;
    let upwardBias: number;

    if (origin === "top") {
      startY = -10;
      spread = canvas.width * 0.6;
      upwardBias = 0; // already falling down
    } else if (origin === "center") {
      startY = canvas.height * 0.35;
      spread = canvas.width * 0.4;
      upwardBias = -8; // burst upward first
    } else {
      startY = canvas.height * 0.6;
      spread = canvas.width * 0.5;
      upwardBias = -10;
    }

    const count = origin === "top" ? 140 : 100;
    const particles: Particle[] = [];

    for (let i = 0; i < count; i++) {
      particles.push({
        x: cx + (Math.random() - 0.5) * spread,
        y: startY,
        vx: (Math.random() - 0.5) * 12,
        vy: upwardBias + Math.random() * (origin === "top" ? 10 : 6) + 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.25,
        w: Math.random() * 10 + 4,
        h: Math.random() * 5 + 3,
        opacity: 1,
        shape: Math.random() > 0.7 ? "circle" : "rect",
      });
    }

    const maxFrames = 160;
    let frame = 0;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      frame++;

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.18;
        p.vx *= 0.98;
        p.rotation += p.rotationSpeed;
        p.opacity = Math.max(0, 1 - frame / maxFrames);

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;

        if (p.shape === "circle") {
          ctx.beginPath();
          ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }

        ctx.restore();
      }

      if (frame < maxFrames) {
        requestAnimationFrame(animate);
      } else {
        canvas.remove();
      }
    };

    requestAnimationFrame(animate);
  }, []);

  return fire;
}
