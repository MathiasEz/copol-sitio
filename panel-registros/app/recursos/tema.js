// Tema del panel (claro u oscuro). Se carga en <head> sin "defer" para aplicar el tema antes de pintar
// y evitar el destello blanco. Sin elección guardada, sigue el modo del sistema; el botón
// [data-tema-boton] alterna y recuerda la elección en este navegador.
(() => {
  const CLAVE = 'copol-registros-tema';
  const raiz = document.documentElement;
  const sistema = matchMedia('(prefers-color-scheme: dark)');
  const guardado = () => { try { return localStorage.getItem(CLAVE); } catch { return null; } };
  const actual = () => guardado() || (sistema.matches ? 'oscuro' : 'claro');
  const pintarBotones = () => {
    const oscuro = raiz.dataset.tema === 'oscuro';
    document.querySelectorAll('[data-tema-boton]').forEach((b) => {
      b.hidden = false;
      b.setAttribute('aria-pressed', String(oscuro));
      const texto = b.querySelector('[data-tema-texto]');
      if (texto) texto.textContent = oscuro ? 'Modo claro' : 'Modo oscuro';
      b.title = oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
    });
  };
  const aplicar = (tema) => { raiz.dataset.tema = tema; pintarBotones(); };
  aplicar(actual());
  sistema.addEventListener('change', () => { if (!guardado()) aplicar(actual()); });
  document.addEventListener('DOMContentLoaded', pintarBotones);
  document.addEventListener('click', (e) => {
    if (!(e.target instanceof Element) || !e.target.closest('[data-tema-boton]')) return;
    const nuevo = raiz.dataset.tema === 'oscuro' ? 'claro' : 'oscuro';
    try { localStorage.setItem(CLAVE, nuevo); } catch { /* sin almacenamiento: vale solo para esta página */ }
    aplicar(nuevo);
  });
})();
