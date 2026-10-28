(function () {
  var cfg = window.TSIORY_ORDER;
  if (!cfg) return;

  var modal = document.getElementById('order-modal');
  var pollTimer = null;

  function $(s, c) { return (c || document).querySelector(s); }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }

  function post(action, data) {
    var fd = new FormData();
    fd.append('action', action);
    fd.append('nonce', cfg.nonce);
    Object.keys(data || {}).forEach(function (k) { fd.append(k, data[k]); });
    return fetch(cfg.ajax, { method: 'POST', body: fd, credentials: 'same-origin', keepalive: true }).then(function (r) { return r.json(); });
  }

  /* ---------- impression de la facture ---------- */
  function printInvoice() {
    var src = document.getElementById('p-invoice');
    if (!src) return;
    var root = document.createElement('div');
    root.id = 'tsiory-print-root';
    root.innerHTML = src.innerHTML;
    document.body.appendChild(root);
    document.body.classList.add('tsiory-printing');
    var done = function () {
      document.body.classList.remove('tsiory-printing');
      if (root.parentNode) root.parentNode.removeChild(root);
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 1500);
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('.js-print-invoice')) { e.preventDefault(); printInvoice(); }
  });

  /* ---------- sondage du statut ---------- */
  function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
  function poll(token, onPaid) {
    stopPoll();
    var tries = 0;
    pollTimer = setInterval(function () {
      tries++;
      if (tries > 360) { stopPoll(); return; } // ~30 min
      post('tsiory_order_status', { token: token }).then(function (r) {
        if (r && r.success && r.data.status === 'paid') { stopPoll(); onPaid(r.data.invoice); }
      }).catch(function () {});
    }, 5000);
  }

  /* ---------- page de reçu autonome ---------- */
  var rw = $('.js-receipt-wait');
  if (rw) {
    poll(rw.getAttribute('data-token'), function () { window.location.reload(); });
  }

  if (!modal) return;

  var form = $('#order-form'), waitV = $('#order-wait'), paidV = $('#order-paid');
  var item = $('#o-item'), amount = $('#o-amount'), phone = $('#o-phone'), email = $('#o-email');
  var err = $('#o-error'), submit = $('#o-submit');

  function view(v) {
    [form, waitV, paidV].forEach(function (x) { x.hidden = true; });
    v.hidden = false;
    modal.querySelector('.o-panel').scrollTop = 0;
  }

  function currentMethod() {
    var r = form.querySelector('input[name="method"]:checked');
    return r ? r.value : '';
  }

  /* Code USSD calculé côté navigateur (modèle + numéro + montant) */
  function ussdFor(m, it) {
    if (!m || m.type !== 'mm' || !m.tpl) return '';
    var c = m.tpl.replace(/\{VENDOR_NUM\}/g, m.vendor || '').replace(/\{AMOUNT\}/g, String(it.amount || ''));
    return /^[0-9*#]{3,80}$/.test(c) ? c : '';
  }

  function codeBox(code) {
    return '<div class="o-ussd"><small>Ou composez ce code USSD</small>' +
           '<code id="o-ussd-code">' + esc(code) + '</code>' +
           '<div class="o-ussd-btns">' +
           '<a id="o-ussd-btn" href="tel:' + encodeURIComponent(code) + '" class="btn-buy blink">Composer le code</a>' +
           '<button type="button" class="o-copy js-copy-ussd">Copier</button>' +
           '</div></div>';
  }

  /* Indications de l'opérateur (texte modifiable dans Commandes > Codes USSD) */
  function stepsHtml(m, it, code) {
    var vars = { OPERATEUR: m.label, NUMERO: m.number, MONTANT: it.price };
    var n = 0, html = '', placed = false;
    String(m.steps || '').split(/\r?\n/).forEach(function (l) {
      l = l.trim();
      if (!l) return;
      if (l === '[CODE]') { if (code && !placed) { html += codeBox(code); placed = true; } return; }
      n++;
      html += '<p>' + n + '. ' + esc(l).replace(/\{(OPERATEUR|NUMERO|MONTANT)\}/g, function (_, k) {
        return '<strong>' + esc(vars[k]) + '</strong>';
      }) + '</p>';
    });
    if (code && !placed) html += codeBox(code);
    return html;
  }

  var created = null; // commande déjà enregistrée dans cette fenêtre
  var lastPayHtml = '';

  function refresh() {
    if (created) return;
    var it = cfg.items[item.value] || cfg.items[Object.keys(cfg.items)[0]];
    var m = cfg.methods[currentMethod()];
    var txt = 'Montant à payer : ' + esc(it.price);
    if (m && m.type === 'paypal') txt += ' (≈ ' + esc(it.pp) + ')';
    amount.innerHTML = txt;
    var mm = m && m.type === 'mm';
    $('#o-phone-wrap').style.display = mm ? '' : 'none';
    var code = mm ? ussdFor(m, it) : '';
    $('#o-pay-box').hidden = !mm;
    if (mm) {
      // ne réécrit le bloc que s'il a changé : sinon un bouton touché pendant que le champ perd le focus serait remplacé et le clic perdu
      var h = stepsHtml(m, it, code);
      if (h !== lastPayHtml) { $('#o-pay-steps').innerHTML = h; lastPayHtml = h; }
    }
    submit.hidden = !!code; // le bouton « Composer le code » remplace « Valider la commande »
    $('#o-email-label').textContent = mm ? 'E-mail (facultatif, pour recevoir la facture)' : 'E-mail (obligatoire, pour recevoir la facture)';
  }

  /* Réglages frais à chaque ouverture (indépendant du cache de page) */
  function loadConfig() {
    post('tsiory_order_config', {}).then(function (r) {
      if (!r || !r.success) return;
      if (r.data.nonce) cfg.nonce = r.data.nonce;
      Object.keys(r.data.items || {}).forEach(function (k) { cfg.items[k] = r.data.items[k]; });
      Object.keys(r.data.methods || {}).forEach(function (k) { cfg.methods[k] = r.data.methods[k]; });
      refresh();
    }).catch(function () {});
  }

  function setLocked(on) {
    [].forEach.call(form.querySelectorAll('input:not(#o-hp), select'), function (x) { x.disabled = on; });
  }
  function resetOrder() {
    stopPoll();
    created = null;
    setLocked(false);
    $('#o-pending-box').hidden = true;
    submit.disabled = false;
    err.hidden = true;
  }

  /* ---------- ouverture / fermeture : animation de l'arrière vers l'avant ---------- */
  var lastFocus = null;
  function open(key) {
    lastFocus = document.activeElement;
    if (key && cfg.items[key]) item.value = key;
    err.hidden = true;
    if (!pollTimer) { resetOrder(); view(form); }
    refresh();
    loadConfig();
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden';
    void modal.offsetWidth; // relance l'animation
    modal.classList.add('is-visible');
    var f = $('#o-name'); if (f && !pollTimer) setTimeout(function () { f.focus(); }, 400);
  }
  function close() {
    modal.classList.remove('is-visible');
    modal.setAttribute('aria-hidden', 'true');
    setTimeout(function () {
      modal.classList.remove('is-open');
      document.documentElement.style.overflow = '';
    }, 350);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  document.addEventListener('click', function (e) {
    var o = e.target.closest('.js-open-order');
    if (o) {
      e.preventDefault();
      var nv = document.getElementById('navLinks'); if (nv) nv.classList.remove('open');
      open(o.getAttribute('data-item'));
      return;
    }
    if (e.target.closest('.js-order-close') || e.target === modal) close();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) close();
  });

  item.addEventListener('change', refresh);
  form.addEventListener('change', function (e) { if (e.target && e.target.name === 'method') refresh(); });

  /* ---------- enregistrement de la commande ---------- */
  function readOrder() {
    var name = $('#o-name').value.trim();
    var m = cfg.methods[currentMethod()];
    if (!name) { showErr('Indiquez votre nom.'); $('#o-name').focus(); return null; }
    if (m.type === 'mm' && phone.value.replace(/\D/g, '').length < 9) { showErr('Indiquez le numéro de téléphone du compte ' + m.label + '.'); phone.focus(); return null; }
    if (m.type === 'paypal' && !/^\S+@\S+\.\S+$/.test(email.value.trim())) { showErr('Indiquez un e-mail valide pour recevoir la facture.'); email.focus(); return null; }
    return { item: item.value, method: currentMethod(), name: name, phone: phone.value.trim(), email: email.value.trim(), website: $('#o-hp').value };
  }

  /* Nonce frais (si la page vient du cache, l'ancien peut être expiré : le serveur répond alors « -1 » ou « 0 ») */
  function refreshNonce() {
    return post('tsiory_order_config', {}).then(function (r) {
      if (r && r.success && r.data && r.data.nonce) cfg.nonce = r.data.nonce;
    }).catch(function () {});
  }

  var busy = false;
  function createOrder(data, done, retried) {
    if (busy && !retried) return;
    busy = true; submit.disabled = true;
    post('tsiory_order_create', data).then(function (r) {
      var bad = !r || typeof r !== 'object' || (!r.success && !(r.data && r.data.message));
      if (bad && !retried) return refreshNonce().then(function () { createOrder(data, done, true); });
      busy = false; submit.disabled = false;
      if (bad) return showErr('Impossible d\'enregistrer la commande (réponse inattendue du serveur). Rechargez la page puis réessayez.');
      if (!r.success) return showErr(r.data.message);
      done(r.data);
    }).catch(function () {
      busy = false; submit.disabled = false;
      showErr('Connexion impossible. Réessayez.');
    });
  }

  /* Copie du code (avec solution de secours si le site n'est pas en HTTPS) */
  function copyCode(btn) {
    var code = $('#o-ussd-code'); if (!code) return;
    var txt = code.textContent;
    var ok = function () { btn.textContent = 'Copié ✓'; setTimeout(function () { btn.textContent = 'Copier'; }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(ok).catch(function () { legacyCopy(txt, ok); });
    } else { legacyCopy(txt, ok); }
  }
  function legacyCopy(txt, ok) {
    var t = document.createElement('textarea');
    t.value = txt; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    try { if (document.execCommand('copy')) ok(); } catch (e) {}
    document.body.removeChild(t);
  }

  /* Mobile Money : la commande est enregistrée, la page reste la même (attente de confirmation en bas) */
  function onMMCreated(d) {
    created = d;
    setLocked(true);
    submit.hidden = true;
    $('#o-pend-ref').textContent = d.ref;
    var l = $('#o-pend-link'); l.href = d.receipt_url; l.textContent = d.receipt_url;
    $('#o-pending-box').hidden = false;
    poll(d.token, function (invoice) {
      $('#p-invoice').innerHTML = invoice;
      view(paidV);
    });
  }

  /* Bouton « Valider la commande » (PayPal, ou Mobile Money sans code USSD) */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    err.hidden = true;
    if (created) return;
    var data = readOrder(); if (!data) return;
    createOrder(data, function (d) { if (d.type === 'paypal') showWait(d); else onMMCreated(d); });
  });

  /* « Composer le code » ET « Copier » valident la commande : elle est enregistrée,
     puis le téléphone ouvre le composeur (Composer) ou le code est copié (Copier). */
  document.addEventListener('click', function (e) {
    var comp = e.target.closest('#o-ussd-btn'), cp = e.target.closest('.js-copy-ussd');
    if (!comp && !cp) return;
    err.hidden = true;
    if (created) { if (cp) copyCode(cp); return; } // déjà enregistrée : on laisse composer / copier
    var data = readOrder();
    if (!data) { if (comp) e.preventDefault(); return; }
    if (cp) copyCode(cp);
    createOrder(data, onMMCreated);
  });

  $('#order-modal').addEventListener('click', function (e) {
    if (e.target.closest('.js-new-order')) { resetOrder(); view(form); refresh(); }
  });

  function showErr(msg) { err.textContent = msg; err.hidden = false; }

  /* Écran d'attente (PayPal) */
  function showWait(d) {
    $('#w-ref').textContent = d.ref;
    $('#w-label').textContent = d.label;
    var link = $('#w-link'); link.href = d.receipt_url; link.textContent = d.receipt_url;
    $('#w-steps').innerHTML =
      '<p>1. Cliquez sur le bouton PayPal et payez <strong>' + esc(d.pp_text) + '</strong> (référence <strong>' + esc(d.ref) + '</strong>).</p>' +
      '<p>2. Confirmez le paiement dans PayPal.</p>' +
      '<p>3. Revenez ici : la facture s\'affiche dès que le paiement est reçu.</p>' +
      '<a href="' + esc(d.pay_url) + '" target="_blank" rel="noopener" class="btn-buy blink">Payer avec PayPal</a>';
    view(waitV);
    poll(d.token, function (invoice) {
      $('#p-invoice').innerHTML = invoice;
      view(paidV);
    });
  }
})();
