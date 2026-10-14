// Asistente del panel: conversación sin recargar la página. Sin JavaScript, el formulario se envía de
// forma normal y el servidor devuelve la respuesta en la misma página. La conversación se guarda solo
// en esta pestaña (sessionStorage) y se borra con "Nueva conversación" o al cerrar la pestaña.
(() => {
  const caja = document.querySelector('[data-asistente]');
  const form = caja?.querySelector('[data-asistente-form]');
  if (!caja || !form) return;
  const registro = caja.querySelector('[data-registro]');
  const vacio = caja.querySelector('[data-vacio]');
  const campo = form.querySelector('textarea[name="pregunta"]');
  const historialCampo = form.querySelector('[data-historial]');
  const modelo = form.querySelector('[data-modelo]');
  const nueva = form.querySelector('[data-nueva]');
  const boton = form.querySelector('button[type="submit"]');
  const errorCaja = caja.querySelector('[data-error]');
  const restantes = form.querySelector('[data-restantes]');
  const CLAVE = 'copol-asistente';
  let conversacion = [];
  let ocupado = false;

  // ── Texto con formato mínimo y seguro (sin innerHTML): **negrita**, `código`, listas y rutas del sitio ──
  const enlinea = (padre, texto) => {
    const re = /\*\*([^*]+)\*\*|\*([^*\s][^*]*?)\*|`([^`]+)`|(https:\/\/[^\s)]+|(?<![\w/])\/[a-z0-9][a-z0-9\-/]*\/?)/gi;
    let ultimo = 0;
    for (const m of texto.matchAll(re)) {
      padre.append(texto.slice(ultimo, m.index));
      if (m[1]) { const b = document.createElement('strong'); b.textContent = m[1]; padre.append(b); }
      else if (m[2]) { const i = document.createElement('em'); i.textContent = m[2]; padre.append(i); }
      else if (m[3]) { const k = document.createElement('code'); k.textContent = m[3]; padre.append(k); }
      else {
        const url = m[4].replace(/[.,;:]+$/, '');
        const a = document.createElement('a');
        a.href = url;
        a.textContent = url;
        if (url.startsWith('http') || !url.startsWith('/panel')) { a.target = '_blank'; a.rel = 'noopener'; }
        padre.append(a, m[4].slice(url.length));
      }
      ultimo = m.index + m[0].length;
    }
    padre.append(texto.slice(ultimo));
  };
  const formatear = (texto) => {
    const frag = document.createDocumentFragment();
    let lista = null;
    for (const linea of texto.split('\n')) {
      const item = linea.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
      if (item) {
        if (!lista) { lista = document.createElement(/^\s*\d/.test(linea) ? 'ol' : 'ul'); frag.append(lista); }
        const li = document.createElement('li');
        enlinea(li, item[1]);
        lista.append(li);
        continue;
      }
      lista = null;
      if (!linea.trim()) continue;
      const titulo = linea.match(/^#{1,4}\s+(.*)$/);
      const p = document.createElement('p');
      if (titulo) { const b = document.createElement('strong'); b.textContent = titulo[1]; p.append(b); } else enlinea(p, linea);
      frag.append(p);
    }
    return frag;
  };

  const burbuja = (rol, texto, pendiente = false) => {
    vacio?.remove();
    const div = document.createElement('div');
    div.className = `msj msj--${rol}${pendiente ? ' msj--pendiente' : ''}`;
    const autor = document.createElement('span');
    autor.className = 'msj__autor';
    autor.textContent = rol === 'usuario' ? 'Vos' : 'Asistente';
    const cuerpo = document.createElement('div');
    cuerpo.className = 'msj__texto';
    if (pendiente) cuerpo.textContent = 'Consultando…';
    else if (rol === 'asistente') cuerpo.append(formatear(texto));
    else cuerpo.textContent = texto;
    div.append(autor, cuerpo);
    registro.append(div);
    div.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    return div;
  };
  const guardar = () => {
    try { sessionStorage.setItem(CLAVE, JSON.stringify({ conversacion, modelo: modelo?.value })); } catch { /* sin almacenamiento */ }
    if (nueva) nueva.hidden = conversacion.length === 0;
  };
  const error = (texto) => {
    errorCaja.textContent = texto ?? '';
    errorCaja.hidden = !texto;
  };

  // Conversación previa de esta pestaña (las respuestas del servidor sin JS ya vienen en la página).
  try {
    const previo = JSON.parse(sessionStorage.getItem(CLAVE) ?? 'null');
    if (previo && !registro.querySelector('.msj')) {
      conversacion = Array.isArray(previo.conversacion) ? previo.conversacion : [];
      conversacion.forEach((m) => burbuja(m.rol, m.texto));
      if (modelo && previo.modelo) modelo.value = previo.modelo;
    }
  } catch { /* sin almacenamiento */ }
  if (!conversacion.length) {
    try { conversacion = JSON.parse(historialCampo?.value || '[]'); } catch { conversacion = []; }
  }
  if (nueva) nueva.hidden = conversacion.length === 0;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pregunta = campo.value.trim();
    if (!pregunta || ocupado) return;
    ocupado = true;
    error('');
    const datos = new FormData(form);
    datos.set('historial', JSON.stringify(conversacion));
    burbuja('usuario', pregunta);
    const espera = burbuja('asistente', '', true);
    campo.value = '';
    boton.setAttribute('aria-busy', 'true');
    boton.disabled = true;
    try {
      const res = await fetch(form.action, { method: 'POST', body: datos, headers: { Accept: 'application/json' }, credentials: 'same-origin' });
      if (res.redirected) { location.href = '/panel/ingresar?aviso=sesion-vencida'; return; }
      const r = await res.json().catch(() => ({ ok: false, error: 'Respuesta inesperada del servidor.' }));
      if (!r.ok) throw new Error(r.error || 'No se pudo responder.');
      espera.remove();
      burbuja('asistente', r.respuesta);
      conversacion.push({ rol: 'usuario', texto: pregunta }, { rol: 'asistente', texto: r.respuesta });
      if (restantes && typeof r.restantes === 'number') restantes.textContent = r.restantes > 0 ? `Te quedan ${r.restantes} consultas hoy.` : 'Llegaste al límite de consultas de hoy.';
      guardar();
    } catch (err) {
      espera.remove();
      registro.lastElementChild?.remove(); // la pregunta sin respuesta vuelve al campo
      campo.value = pregunta;
      error(err instanceof TypeError ? 'Sin conexión. Probá de nuevo.' : err.message);
    } finally {
      ocupado = false;
      boton.removeAttribute('aria-busy');
      boton.disabled = false;
      campo.focus();
    }
  });

  campo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  caja.addEventListener('click', (e) => {
    const s = e.target.closest?.('[data-sugerencia]');
    if (!s || campo.disabled) return;
    campo.value = s.textContent.trim();
    form.requestSubmit();
  });
  modelo?.addEventListener('change', guardar);
  nueva?.addEventListener('click', () => {
    conversacion = [];
    guardar();
    location.href = form.action; // vuelve a la pantalla inicial con las sugerencias
  });
})();
