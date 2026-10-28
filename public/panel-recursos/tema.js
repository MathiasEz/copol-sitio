// Tema del panel (claro u oscuro) y estilo visual (Afiche · Folleto · Estándar). Se carga en <head> sin "defer"
// para aplicar ambos antes de pintar y evitar destellos.
// - Tema: sin elección guardada sigue el modo del sistema; el botón [data-tema-boton] alterna y lo recuerda.
// - Estilo: el mismo que eligió la persona en el sitio público (clave copol-estilo, mismo origen); los botones
//   [data-estilo-opcion] lo cambian. El modo oscuro tiene una sola paleta para los tres estilos.
(() => {
  const CLAVE = 'copol-panel-tema';
  const CLAVE_ESTILO = 'copol-estilo';
  const ESTILOS = ['afiche', 'folleto', 'estandar'];
  const raiz = document.documentElement;
  const sistema = matchMedia('(prefers-color-scheme: dark)');
  const leer = (clave) => { try { return localStorage.getItem(clave); } catch { return null; } };
  const guardar = (clave, valor) => { try { localStorage.setItem(clave, valor); } catch { /* vale solo para esta página */ } };
  const actual = () => leer(CLAVE) || (sistema.matches ? 'oscuro' : 'claro');
  const pintarBotones = () => {
    const oscuro = raiz.dataset.tema === 'oscuro';
    document.querySelectorAll('[data-tema-boton]').forEach((b) => {
      b.hidden = false;
      b.setAttribute('aria-pressed', String(oscuro));
      const texto = b.querySelector('[data-tema-texto]');
      if (texto) texto.textContent = oscuro ? 'Modo claro' : 'Modo oscuro';
      b.title = oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
    });
    document.querySelectorAll('[data-estilo-grupo]').forEach((g) => { g.hidden = false; });
    document.querySelectorAll('[data-estilo-opcion]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.estiloOpcion === raiz.dataset.estilo)));
  };
  const aplicar = (tema) => { raiz.dataset.tema = tema; pintarBotones(); };
  const estilo = leer(CLAVE_ESTILO);
  if (ESTILOS.includes(estilo)) raiz.dataset.estilo = estilo;
  aplicar(actual());
  sistema.addEventListener('change', () => { if (!leer(CLAVE)) aplicar(actual()); });
  document.addEventListener('DOMContentLoaded', pintarBotones);
  document.addEventListener('click', (e) => {
    if (!(e.target instanceof Element)) return;
    const opcion = e.target.closest('[data-estilo-opcion]');
    if (opcion && ESTILOS.includes(opcion.dataset.estiloOpcion)) {
      raiz.dataset.estilo = opcion.dataset.estiloOpcion;
      guardar(CLAVE_ESTILO, opcion.dataset.estiloOpcion);
      pintarBotones();
      return;
    }
    if (!e.target.closest('[data-tema-boton]')) return;
    const nuevo = raiz.dataset.tema === 'oscuro' ? 'claro' : 'oscuro';
    guardar(CLAVE, nuevo);
    aplicar(nuevo);
  });
})();
