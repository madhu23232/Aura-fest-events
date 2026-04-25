(() => {
  const canvases = document.querySelectorAll('[data-auth-canvas]');
  if (!canvases.length) return;

  canvases.forEach((canvas) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const state = {
      width: 0,
      height: 0,
      particles: [],
      pointer: { x: null, y: null, radius: 150 }
    };

    function resize() {
      const shell = canvas.parentElement;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      state.width = shell.clientWidth;
      state.height = shell.clientHeight;
      canvas.width = Math.floor(state.width * ratio);
      canvas.height = Math.floor(state.height * ratio);
      canvas.style.width = `${state.width}px`;
      canvas.style.height = `${state.height}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      createParticles();
    }

    function createParticles() {
      const count = Math.max(32, Math.floor((state.width * state.height) / 18000));
      state.particles = Array.from({ length: count }, () => ({
        x: Math.random() * state.width,
        y: Math.random() * state.height,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        r: 1 + Math.random() * 2.2
      }));
    }

    function step() {
      ctx.clearRect(0, 0, state.width, state.height);

      for (const particle of state.particles) {
        particle.x += particle.vx;
        particle.y += particle.vy;

        if (particle.x < 0 || particle.x > state.width) particle.vx *= -1;
        if (particle.y < 0 || particle.y > state.height) particle.vy *= -1;

        if (state.pointer.x !== null) {
          const dx = particle.x - state.pointer.x;
          const dy = particle.y - state.pointer.y;
          const distance = Math.hypot(dx, dy);
          if (distance > 0 && distance < state.pointer.radius) {
            const force = (state.pointer.radius - distance) / state.pointer.radius;
            particle.x += (dx / distance) * force * 1.6;
            particle.y += (dy / distance) * force * 1.6;
          }
        }

        ctx.beginPath();
        ctx.fillStyle = 'rgba(255, 224, 154, 0.72)';
        ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
        ctx.fill();
      }

      for (let i = 0; i < state.particles.length; i += 1) {
        for (let j = i + 1; j < state.particles.length; j += 1) {
          const a = state.particles[i];
          const b = state.particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distance = Math.hypot(dx, dy);
          if (distance < 120) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(98, 210, 255, ${0.15 - distance / 900})`;
            ctx.lineWidth = 1;
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      requestAnimationFrame(step);
    }

    canvas.addEventListener('pointermove', (event) => {
      const rect = canvas.getBoundingClientRect();
      state.pointer.x = event.clientX - rect.left;
      state.pointer.y = event.clientY - rect.top;
    });

    canvas.addEventListener('pointerleave', () => {
      state.pointer.x = null;
      state.pointer.y = null;
    });

    window.addEventListener('resize', resize);
    resize();
    step();
  });
})();
