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
  const BASE = document.documentElement.dataset.base || '';
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
        if (url.startsWith('http') || !BASE || !url.startsWith(BASE)) { a.target = '_blank'; a.rel = 'noopener'; }
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
  // ── Tarjeta de cambios propuestos (misma estructura que la del servidor) ──
  const csrf = form.querySelector('[name="_csrf"]')?.value ?? '';
  const crear = (tag, clase, texto) => {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto != null) n.textContent = texto;
    return n;
  };
  const formAccion = (id, accion, etiqueta, clase) => {
    const f = crear('form');
    f.method = 'post';
    f.action = `${BASE}/asistente/propuestas/${encodeURIComponent(id)}`;
    for (const [k, v] of [['_csrf', csrf], ['accion', accion]]) {
      const i = crear('input');
      i.type = 'hidden'; i.name = k; i.value = v;
      f.append(i);
    }
    const b = crear('button', clase, etiqueta);
    b.type = 'submit';
    f.append(b);
    return f;
  };
  const tarjeta = (p) => {
    const s = crear('section', 'propuesta');
    s.dataset.propuesta = '';
    s.setAttribute('aria-label', 'Cambios para confirmar');
    s.append(crear('h2', 'propuesta__titulo', `Cambios para confirmar (${p.items.length})`));
    const ul = crear('ul', 'propuesta__lista');
    for (const i of p.items) {
      const li = crear('li');
      li.append(crear('strong', '', i.nombre), ' ', crear('span', 'muted', `· Código interno COPOL ${i.codigo ?? '—'}`));
      const sub = crear('ul');
      for (const x of i.cambios) {
        const c = crear('li');
        c.append(`${x.campo}: `, crear('span', 'propuesta__antes', x.antes), ' → ', crear('strong', '', x.despues));
        sub.append(c);
      }
      li.append(sub);
      ul.append(li);
    }
    s.append(ul);
    if (p.errores?.length) {
      const e = crear('div', 'propuesta__errores');
      e.append(crear('strong', '', 'No incluidos:'));
      const el = crear('ul');
      p.errores.forEach((t) => el.append(crear('li', '', t)));
      e.append(el);
      s.append(e);
    }
    const acciones = crear('div', 'propuesta__acciones');
    acciones.append(formAccion(p.id, 'cancelar', 'Cancelar', 'btn btn--ghost btn--sm'), formAccion(p.id, 'confirmar', 'Confirmar cambios', 'btn btn--sm'));
    s.append(acciones, crear('p', 'muted propuesta__nota', 'Nada se modifica hasta que confirmes. La propuesta vence en 15 minutos.'));
    registro.append(s);
    s.scrollIntoView({ block: 'nearest' });
  };
  caja.addEventListener('submit', async (e) => {
    const f = e.target.closest?.('[data-propuesta] form');
    if (!f) return;
    e.preventDefault();
    const card = f.closest('[data-propuesta]');
    const botones = card.querySelectorAll('button');
    botones.forEach((b) => { b.disabled = true; });
    f.querySelector('button')?.setAttribute('aria-busy', 'true');
    error('');
    try {
      const res = await fetch(f.action, { method: 'POST', body: new FormData(f), headers: { Accept: 'application/json' }, credentials: 'same-origin' });
      if (res.redirected) { location.href = `${BASE}/ingresar?aviso=sesion-vencida`; return; }
      const r = await res.json().catch(() => ({ ok: false, mensaje: 'Respuesta inesperada del servidor.' }));
      if (!r.ok) throw new Error(r.mensaje || 'No se pudo completar.');
      card.querySelector('.propuesta__acciones')?.remove();
      card.querySelector('.propuesta__nota')?.remove();
      card.classList.add(new FormData(f).get('accion') === 'confirmar' ? 'propuesta--aplicada' : 'propuesta--cancelada');
      burbuja('asistente', r.mensaje);
      conversacion.push({ rol: 'asistente', texto: r.mensaje });
      guardar();
    } catch (err) {
      botones.forEach((b) => { b.disabled = false; });
      error(err instanceof TypeError ? 'Sin conexión. Probá de nuevo.' : err.message);
    } finally {
      f.querySelector('button')?.removeAttribute('aria-busy');
    }
  });

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
      if (res.redirected) { location.href = `${BASE}/ingresar?aviso=sesion-vencida`; return; }
      const r = await res.json().catch(() => ({ ok: false, error: 'Respuesta inesperada del servidor.' }));
      if (!r.ok) throw new Error(r.error || 'No se pudo responder.');
      espera.remove();
      burbuja('asistente', r.respuesta);
      registro.querySelectorAll('[data-propuesta] .propuesta__acciones').forEach((a) => a.closest('[data-propuesta]').classList.add('propuesta--reemplazada'));
      if (r.propuesta) tarjeta(r.propuesta);
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
    const t = s.textContent.trim();
    // Las sugerencias que terminan en "…" se completan a mano antes de enviar.
    if (t.endsWith('…')) {
      campo.value = t.slice(0, -1);
      campo.focus();
      campo.setSelectionRange(campo.value.length, campo.value.length);
      return;
    }
    campo.value = t;
    form.requestSubmit();
  });
  modelo?.addEventListener('change', guardar);
  nueva?.addEventListener('click', () => {
    conversacion = [];
    guardar();
    location.href = form.action; // vuelve a la pantalla inicial con las sugerencias
  });
})();
