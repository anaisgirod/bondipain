/* Bouton œil : affiche/masque le mot de passe sur tous les champs password de la page. */
(function () {
  function enhance() {
    document.querySelectorAll('input[type=password]').forEach(function (inp) {
      if (inp.dataset.eye) return;
      inp.dataset.eye = '1';
      inp.style.paddingRight = '42px';
      var w = document.createElement('span');
      w.style.cssText = 'position:relative;display:block;';
      inp.parentNode.insertBefore(w, inp);
      w.appendChild(inp);
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', 'Afficher / masquer le mot de passe');
      b.textContent = '👁';
      b.style.cssText = 'position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:16px;opacity:.55;padding:4px;line-height:1;';
      b.onmousedown = function (e) { e.preventDefault(); };
      b.onclick = function () {
        inp.type = (inp.type === 'password') ? 'text' : 'password';
        b.style.opacity = (inp.type === 'text') ? '1' : '.55';
      };
      w.appendChild(b);
    });
  }
  if (document.readyState !== 'loading') enhance();
  else document.addEventListener('DOMContentLoaded', enhance);
})();
