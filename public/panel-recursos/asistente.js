// Asistente del panel: conversación sin recargar la página. Sin JavaScript, cada formulario se envía de
// forma normal y el servidor devuelve la página con la conversación actualizada. Las conversaciones se
// guardan en el servidor (Historial); cada respuesta que aplicó cambios tiene una flecha para deshacerlos.
(() => {
  const caja = document.querySelector('[data-asistente]');
  const form = caja?.querySelector('[data-asistente-form]');
  if (!caja || !form) return;
  const registro = caja.querySelector('[data-registro]');
  const campo = form.querySelector('textarea[name="pregunta"]');
  const idCampo = form.querySelector('[data-conversacion-id]');
  const boton = form.querySelector('button[type="submit"]');
  const errorCaja = caja.querySelector('[data-error]');
  const restantes = form.querySelector('[data-restantes]');
  const titulo = caja.querySelector('[data-titulo]');
  const historial = document.querySelector('[data-historial]');
  const lista = historial?.querySelector('[data-historial-lista]');
  const BASE = document.documentElement.dataset.base || '';
  const csrf = form.querySelector('[name="_csrf"]')?.value ?? '';
  const reducir = matchMedia('(prefers-reduced-motion: reduce)');
  let ocupado = false;

  // En pantallas angostas el historial arranca plegado (en escritorio es una columna fija).
  const angosta = matchMedia('(max-width: 1199px)');
  if (historial && angosta.matches) historial.open = false;
  historial?.addEventListener('toggle', () => { if (!angosta.matches && !historial.open) historial.open = true; });

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
      const t = linea.match(/^#{1,4}\s+(.*)$/);
      const p = document.createElement('p');
      if (t) { const b = document.createElement('strong'); b.textContent = t[1]; p.append(b); } else enlinea(p, linea);
      frag.append(p);
    }
    return frag;
  };
  // Las respuestas que vienen del servidor (historial) llegan como texto plano: se les da formato.
  registro.querySelectorAll('[data-formato]').forEach((el) => { el.replaceChildren(formatear(el.textContent)); });

  const crear = (tag, clase, texto) => {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto != null) n.textContent = texto;
    return n;
  };
  const SVG = {
    deshacer: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    editar: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  };
  const icono = (nombre, tam = 16) => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [k, v] of Object.entries({ class: 'i', width: tam, height: tam, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) s.setAttribute(k, v);
    s.innerHTML = SVG[nombre]; // trazos fijos de este archivo
    return s;
  };
  const ocultos = (pares) => pares.map(([k, v]) => { const i = crear('input'); i.type = 'hidden'; i.name = k; i.value = v; return i; });
  const conversacion = () => idCampo?.value ?? '';
  const desplazar = (el) => el.scrollIntoView({ block: 'nearest', behavior: reducir.matches ? 'auto' : 'smooth' });

  const formDeshacer = (id) => {
    const f = crear('form', 'msj__deshacer-form');
    f.method = 'post';
    f.action = `${BASE}/asistente/propuestas/${encodeURIComponent(id)}/deshacer`;
    f.dataset.deshacer = id;
    f.append(...ocultos([['_csrf', csrf], ['conversacion', conversacion()]]));
    const b = crear('button', 'msj__deshacer');
    b.type = 'submit';
    b.title = 'Deshacer estos cambios';
    b.append(icono('deshacer'), crear('span', '', 'Deshacer'), crear('span', 'sr', ' estos cambios'));
    f.append(b);
    return f;
  };

  const burbuja = (rol, texto, { pendiente = false, deshacer = null } = {}) => {
    registro.querySelector('[data-vacio]')?.remove();
    const div = crear('div', `msj msj--${rol}${pendiente ? ' msj--pendiente' : ''}`);
    const cuerpo = crear('div', 'msj__texto');
    if (pendiente) cuerpo.textContent = 'Consultando…';
    else if (rol === 'asistente') cuerpo.append(formatear(texto));
    else cuerpo.textContent = texto;
    div.append(crear('span', 'msj__autor', rol === 'usuario' ? 'Vos' : 'Asistente'), cuerpo);
    if (deshacer) { div.dataset.deshacerDe = deshacer; div.append(formDeshacer(deshacer)); }
    registro.append(div);
    desplazar(div);
    return div;
  };

  // ── Tarjeta de cambios propuestos (misma estructura que la del servidor) ──
  const formAccion = (id, accion, etiqueta, clase, conIcono) => {
    const f = crear('form');
    f.method = 'post';
    f.action = `${BASE}/asistente/propuestas/${encodeURIComponent(id)}`;
    f.append(...ocultos([['_csrf', csrf], ['conversacion', conversacion()], ['accion', accion]]));
    const b = crear('button', clase);
    b.type = 'submit';
    if (conIcono) b.append(icono(conIcono));
    b.append(etiqueta);
    f.append(b);
    return f;
  };
  const tarjeta = (p, revierte = false) => {
    registro.querySelectorAll('[data-propuesta]:not([class*="propuesta--"])').forEach((t) => marcarTarjeta(t, 'reemplazada'));
    const s = crear('section', 'propuesta');
    s.dataset.propuesta = '';
    s.setAttribute('aria-label', revierte ? 'Vuelta atrás para confirmar' : 'Cambios para confirmar');
    const h = crear('h2', 'propuesta__titulo');
    h.append(icono(revierte ? 'deshacer' : 'editar'), `${revierte ? 'Deshacer' : 'Cambios para confirmar'} (${p.items.length})`);
    s.append(h);
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
    acciones.append(formAccion(p.id, 'cancelar', 'Cancelar', 'btn btn--ghost btn--sm'), formAccion(p.id, 'confirmar', 'Confirmar cambios', 'btn btn--sm', 'check'));
    s.append(acciones, crear('p', 'muted propuesta__nota', 'Nada se modifica hasta que confirmes. La propuesta vence en 15 minutos.'));
    registro.append(s);
    desplazar(s);
  };
  const ETIQUETAS = { aplicada: 'Aplicados', cancelada: 'Cancelados', reemplazada: 'Sin efecto' };
  function marcarTarjeta(card, estado) {
    card.querySelector('.propuesta__acciones')?.remove();
    card.querySelector('.propuesta__nota')?.remove();
    card.classList.add(`propuesta--${estado}`);
    const h = card.querySelector('.propuesta__titulo');
    if (h && !h.querySelector('.propuesta__estado')) h.append(crear('span', 'propuesta__estado', ETIQUETAS[estado]));
  }

  // ── Historial: la conversación actual sube arriba de la lista ──
  const cuando = (iso) => {
    const d = new Date(iso);
    return `hoy ${d.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })}`;
  };
  const actualizarConversacion = (cv) => {
    if (!cv) return;
    const nueva = !conversacion();
    if (idCampo) idCampo.value = cv.id;
    // Los formularios ya dibujados (tarjetas, flechas) se envían con la conversación.
    caja.querySelectorAll('input[name="conversacion"]').forEach((i) => { i.value = cv.id; });
    if (nueva) {
      history.replaceState(null, '', `${BASE}/asistente?c=${encodeURIComponent(cv.id)}`);
      if (titulo) titulo.textContent = cv.titulo;
      document.querySelector('.historial__nueva')?.removeAttribute('aria-current');
    }
    if (!lista) return;
    let a = lista.querySelector(`[data-conversacion="${CSS.escape(cv.id)}"]`);
    if (!a) {
      const li = crear('li');
      a = crear('a', 'historial__item');
      a.href = `${BASE}/asistente?c=${encodeURIComponent(cv.id)}`;
      a.dataset.conversacion = cv.id;
      a.append(crear('span', 'historial__titulo', cv.titulo), crear('span', 'historial__meta'));
      li.append(a);
    }
    lista.querySelectorAll('[aria-current]').forEach((x) => x.removeAttribute('aria-current'));
    a.setAttribute('aria-current', 'page');
    const meta = a.querySelector('.historial__meta');
    meta.replaceChildren(crear('span', '', cuando(cv.actualizada_en)));
    if (cv.cambios) {
      const c = crear('span', 'historial__cambios');
      c.append(icono('check', 12), cv.cambios === 1 ? '1 cambio' : `${cv.cambios} cambios`);
      meta.append(c);
    }
    lista.prepend(a.closest('li'));
    const n = document.querySelector('[data-historial-n]');
    if (n) n.textContent = String(lista.children.length);
    document.querySelector('[data-historial-vacio]')?.setAttribute('hidden', '');
  };

  const error = (texto) => {
    errorCaja.textContent = texto ?? '';
    errorCaja.hidden = !texto;
  };
  const enviar = async (f) => {
    const res = await fetch(f.action, { method: 'POST', body: new FormData(f), headers: { Accept: 'application/json' }, credentials: 'same-origin' });
    if (res.redirected) { location.href = `${BASE}/ingresar?aviso=sesion-vencida`; return null; }
    return res.json().catch(() => ({ ok: false, mensaje: 'Respuesta inesperada del servidor.' }));
  };

  // Confirmar / cancelar una tarjeta y la flecha "Deshacer" de una respuesta.
  caja.addEventListener('submit', async (e) => {
    const f = e.target.closest?.('[data-propuesta] form, form[data-deshacer]');
    if (!f) return;
    e.preventDefault();
    if (ocupado) return;
    ocupado = true;
    const card = f.closest('[data-propuesta]');
    const botones = (card ?? f).querySelectorAll('button');
    botones.forEach((b) => { b.disabled = true; });
    f.querySelector('button')?.setAttribute('aria-busy', 'true');
    error('');
    try {
      const r = await enviar(f);
      if (!r) return;
      if (!r.ok) throw new Error(r.mensaje || 'No se pudo completar.');
      actualizarConversacion(r.conversacion);
      if (f.dataset.deshacer) {
        burbuja('usuario', 'Deshacer estos cambios');
        burbuja('asistente', r.mensaje);
        if (r.propuesta) tarjeta(r.propuesta, true);
        botones.forEach((b) => { b.disabled = false; });
      } else {
        marcarTarjeta(card, new FormData(f).get('accion') === 'confirmar' ? 'aplicada' : 'cancelada');
        burbuja('asistente', r.mensaje, { deshacer: r.deshacer ?? null });
        // Se aplicó una vuelta atrás: la respuesta original queda marcada como deshecha.
        if (r.deshecho) {
          const original = registro.querySelector(`[data-deshacer-de="${CSS.escape(r.deshecho)}"]`);
          const fo = original?.querySelector('form[data-deshacer]');
          if (fo) {
            const marca = crear('span', 'msj__deshecho');
            marca.append(icono('deshacer', 14), 'Cambios deshechos');
            fo.replaceWith(marca);
          }
        }
      }
    } catch (err) {
      botones.forEach((b) => { b.disabled = false; });
      error(err instanceof TypeError ? 'Sin conexión. Probá de nuevo.' : err.message);
    } finally {
      ocupado = false;
      f.querySelector('button')?.removeAttribute('aria-busy');
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pregunta = campo.value.trim();
    if (!pregunta || ocupado) return;
    ocupado = true;
    error('');
    const datos = new FormData(form);
    burbuja('usuario', pregunta);
    const espera = burbuja('asistente', '', { pendiente: true });
    campo.value = '';
    boton.setAttribute('aria-busy', 'true');
    boton.disabled = true;
    try {
      const res = await fetch(form.action, { method: 'POST', body: datos, headers: { Accept: 'application/json' }, credentials: 'same-origin' });
      if (res.redirected) { location.href = `${BASE}/ingresar?aviso=sesion-vencida`; return; }
      const r = await res.json().catch(() => ({ ok: false, error: 'Respuesta inesperada del servidor.' }));
      if (!r.ok) throw new Error(r.error || 'No se pudo responder.');
      espera.remove();
      actualizarConversacion(r.conversacion);
      burbuja('asistente', r.respuesta);
      if (r.propuesta) tarjeta(r.propuesta);
      if (restantes && typeof r.restantes === 'number') restantes.textContent = r.restantes > 0 ? `Te quedan ${r.restantes} consultas hoy.` : 'Llegaste al límite de consultas de hoy.';
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
  caja.querySelector('form[data-eliminar]')?.addEventListener('submit', (e) => {
    if (!confirm('¿Eliminar esta conversación del historial? Los cambios aplicados no se deshacen.')) e.preventDefault();
  });
  // El registro arranca mostrando lo último de la conversación.
  registro.scrollTop = registro.scrollHeight;
})();
