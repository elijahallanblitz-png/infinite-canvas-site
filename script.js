// Subtle cursor follower — a dim light that follows the mouse
// Adds presence without distraction
(function () {
  const cursor = document.createElement('div');
  cursor.style.cssText = `
    position: fixed;
    width: 320px;
    height: 320px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(200,169,110,0.04) 0%, transparent 70%);
    pointer-events: none;
    z-index: 1;
    transform: translate(-50%, -50%);
    transition: left 0.8s cubic-bezier(0.16,1,0.3,1), top 0.8s cubic-bezier(0.16,1,0.3,1);
    will-change: left, top;
  `;
  document.body.appendChild(cursor);

  let x = window.innerWidth / 2;
  let y = window.innerHeight / 2;
  cursor.style.left = x + 'px';
  cursor.style.top = y + 'px';

  document.addEventListener('mousemove', (e) => {
    x = e.clientX;
    y = e.clientY;
    cursor.style.left = x + 'px';
    cursor.style.top = y + 'px';
  });

  // Touch — follow last touch
  document.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    cursor.style.left = t.clientX + 'px';
    cursor.style.top = t.clientY + 'px';
  }, { passive: true });
})();
