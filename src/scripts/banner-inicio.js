// Comportamiento del banner de Inicio (<copol-banner>, HTML de panel/src/banner.ts).
// Es un elemento personalizado: se activa solo cuando su HTML aparece en la página, aunque llegue después
// (en Inicio el banner es una "server island" que se carga aparte). Lo usan la web y la vista previa del
// panel (copia en public/panel-recursos/, generada en cada build por scripts/copiar-recursos.mjs).
// - Avance automático cada N segundos (data-bi-segundos), en bucle; la barra del indicador activo muestra
//   el tiempo. Se pausa con el puntero o el foco encima y con la pestaña oculta. Con "reducir movimiento"
//   no avanza solo.
// - Flechas, indicadores, flechas ←/→ del teclado con el banner enfocado y deslizar sobre la imagen.
// - Sin JS las diapositivas se muestran una debajo de otra.
(() => {
  if (typeof customElements === 'undefined' || customElements.get('copol-banner')) return;
  const reducido = matchMedia('(prefers-reduced-motion: reduce)');

  class CopolBanner extends HTMLElement {
    connectedCallback() {
      if (this.dataset.biListo) return;
      this.dataset.biListo = '1';
      const diapos = [...this.querySelectorAll('[data-bi-diapo]')];
      const n = diapos.length;
      this.classList.add('bi--js');
      this.style.setProperty('--bi-segundos', `${Number(this.dataset.biSegundos) || 6}s`);
      if (n < 2) {
        diapos.forEach((d) => d.classList.add('activa'));
        return;
      }
      const indicadores = [...this.querySelectorAll('[data-bi-indicador]')];
      const pista = this.querySelector('[data-bi-pista]');
      const controles = this.querySelector('[data-bi-controles]');
      if (controles) controles.hidden = false;
      this.tabIndex = 0;
      let actual = 0;

      const mostrar = (i, porUsuario = false) => {
        actual = (i + n) % n;
        diapos.forEach((d, k) => {
          const activa = k === actual;
          d.classList.toggle('activa', activa);
          d.toggleAttribute('inert', !activa);
          if (activa) d.removeAttribute('aria-hidden');
          else d.setAttribute('aria-hidden', 'true');
        });
        // Precarga la siguiente para que nunca aparezca en blanco.
        diapos[(actual + 1) % n].querySelectorAll('img[loading="lazy"]').forEach((img) => { img.loading = 'eager'; });
        indicadores.forEach((b, k) => {
          if (k === actual) b.setAttribute('aria-current', 'true');
          else b.removeAttribute('aria-current');
          // Reinicia la barra de progreso (y con ella la cuenta del avance automático).
          const barra = b.firstElementChild;
          if (barra) {
            barra.style.animation = 'none';
            void barra.offsetWidth;
            barra.style.animation = '';
          }
        });
        pista?.setAttribute('aria-live', porUsuario ? 'polite' : 'off');
      };

      // La barra del indicador activo es una animación CSS de N segundos: al terminar, avanza.
      const automatico = !reducido.matches;
      if (automatico) this.classList.add('bi--auto');
      indicadores.forEach((b, k) => {
        b.addEventListener('click', () => mostrar(k, true));
        b.firstElementChild?.addEventListener('animationend', () => { if (automatico) mostrar(actual + 1); });
      });
      this.querySelector('[data-bi-anterior]')?.addEventListener('click', () => mostrar(actual - 1, true));
      this.querySelector('[data-bi-siguiente]')?.addEventListener('click', () => mostrar(actual + 1, true));
      this.addEventListener('keydown', (e) => {
        if (e.target.closest?.('a, input, textarea')) return;
        if (e.key === 'ArrowLeft') { e.preventDefault(); mostrar(actual - 1, true); }
        if (e.key === 'ArrowRight') { e.preventDefault(); mostrar(actual + 1, true); }
      });

      // Deslizar en horizontal (dedo o mouse) sobre las diapositivas; el desplazamiento vertical sigue libre.
      let x0 = 0, y0 = 0, arrastrando = false;
      pista?.addEventListener('pointerdown', (e) => {
        if (e.target.closest('a, button')) return;
        arrastrando = true; x0 = e.clientX; y0 = e.clientY;
      });
      pista?.addEventListener('pointerup', (e) => {
        if (!arrastrando) return;
        arrastrando = false;
        const dx = e.clientX - x0, dy = e.clientY - y0;
        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.2) mostrar(actual + (dx < 0 ? 1 : -1), true);
      });
      pista?.addEventListener('pointercancel', () => { arrastrando = false; });

      // Pausa con el puntero o el foco dentro, y con la pestaña oculta.
      let encima = false, foco = false;
      const pintarPausa = () => this.classList.toggle('bi--pausado', encima || foco || document.hidden);
      this.addEventListener('mouseenter', () => { encima = true; pintarPausa(); });
      this.addEventListener('mouseleave', () => { encima = false; pintarPausa(); });
      this.addEventListener('focusin', () => { foco = true; pintarPausa(); });
      this.addEventListener('focusout', (e) => { if (!this.contains(e.relatedTarget)) { foco = false; pintarPausa(); } });
      document.addEventListener('visibilitychange', pintarPausa);

      mostrar(0);
    }
  }
  customElements.define('copol-banner', CopolBanner);
})();
