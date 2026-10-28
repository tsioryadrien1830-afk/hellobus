(function () {
  /* Menu mobile */
  var btn = document.getElementById('menuToggleBtn');
  var nav = document.getElementById('navLinks');
  if (btn && nav) {
    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') { nav.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
    });
  }

  /* Vague au clic sur l'accueil */
  var hero = document.querySelector('.hero-click-wave');
  if (hero) {
    hero.addEventListener('click', function (e) {
      if (e.target.closest('a,button')) return;
      var r = hero.getBoundingClientRect();
      var size = Math.max(r.width, r.height) * 1.4;
      var w = document.createElement('span');
      w.className = 'hero-wave';
      w.style.left = (e.clientX - r.left) + 'px';
      w.style.top = (e.clientY - r.top) + 'px';
      w.style.width = w.style.height = size + 'px';
      hero.appendChild(w);
      setTimeout(function () { if (w.parentNode) w.parentNode.removeChild(w); }, 950);
    });
  }

  /* Barres de compétences + compteurs animés au défilement */
  var cards = document.querySelectorAll('.skill-card');
  if (!cards.length) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function animate(card) {
    var bar = card.querySelector('.progress-bar-fill');
    var cnt = card.querySelector('.counter');
    if (bar) { var target = bar.getAttribute('data-progress'); bar.style.width = '0'; requestAnimationFrame(function () { requestAnimationFrame(function () { bar.style.width = target; }); }); }
    if (cnt && !reduce) {
      var to = parseInt(cnt.getAttribute('data-target'), 10) || 0, start = null;
      (function step(ts) {
        if (start === null) start = ts;
        var p = Math.min((ts - start) / 1200, 1);
        cnt.textContent = Math.round(to * p) + '%';
        if (p < 1) requestAnimationFrame(step);
      })(performance.now());
    }
  }

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { animate(en.target); io.unobserve(en.target); } });
    }, { threshold: 0.3 });
    cards.forEach(function (c) { io.observe(c); });
  }
})();
