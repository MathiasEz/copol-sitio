// Registros: formulario con asistente de IA (escribir, pegar, dictar o adjuntar fotos y PDF), dirección con
// ubicación y guardado en la planilla. Sin JavaScript no funciona (el asistente y el guardado hablan JSON con
// el servidor); las reglas de validación son las del servidor (panel/src/registros-campos.ts), acá solo se
// repiten para avisar antes de enviar.
(() => {
  const raiz = document.querySelector('[data-registros]');
  if (!raiz) return;
  const BASE = document.documentElement.dataset.base || '';
  const CSRF = raiz.dataset.csrf || '';
  const USUARIO = raiz.dataset.usuario || '';
  const IA = raiz.dataset.ia === '1';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const $ = (sel, el = raiz) => el.querySelector(sel);
  const $$ = (sel, el = raiz) => [...el.querySelectorAll(sel)];

  const ICONOS = {
    check: '<path d="M20 6 9 17l-5-5"/>',
    clip: '<path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
    deshacer: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    microfono: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/>',
    parar: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    externo: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  };
  const icono = (n, t = 18) => `<svg class="i" width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[n] ?? ''}</svg>`;

  // ── Servidor ──
  async function api(ruta, datos) {
    let res;
    try {
      res = await fetch(`${BASE}/registros/${ruta}`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json', 'x-csrf-token': CSRF },
        body: JSON.stringify(datos),
      });
    } catch {
      return { ok: false, status: 0, error: 'No se pudo conectar. Revisá internet y probá de nuevo.' };
    }
    // Sesión vencida: el servidor responde con la pantalla de ingreso en lugar de JSON.
    if (res.redirected || !(res.headers.get('content-type') || '').includes('json')) {
      location.href = `${BASE}/ingresar?aviso=sesion-vencida`;
      return { ok: false, status: 401, error: 'Tu sesión venció. Ingresá de nuevo.' };
    }
    return { ok: res.ok, status: res.status, ...(await res.json().catch(() => ({}))) };
  }

  // ── Formulario y asistente ──
  const form = $('[data-registro]');
  const CAMPOS = ['nombre', 'socio', 'cedula', 'direccion', 'producto', 'codigo', 'service', 'adicional'];
  const OBLIGATORIOS = new Set(['nombre', 'socio', 'cedula', 'direccion', 'producto', 'codigo']);
  const ETIQUETAS = { nombre: 'Nombre', socio: 'N° de socio', cedula: 'Cédula', direccion: 'Dirección', producto: 'Producto', codigo: 'Código interno', service: 'Service', flete: 'Flete', adicional: 'Información adicional' };
  const CLAVE_CHAT = `registros-chat-${USUARIO}`;
  const CLAVE_FORM = `registros-form-${USUARIO}`;
  const leerLocal = (k, def) => { try { return JSON.parse(sessionStorage.getItem(k)) ?? def; } catch { return def; } };
  const guardarLocal = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };

  function cedulaValida(valor) {
    const d = valor.replace(/[\s.\-_/]/g, '');
    if (!/^\d{7,8}$/.test(d)) return false;
    const base = d.slice(0, -1).padStart(7, '0');
    const suma = [2, 9, 8, 7, 6, 3, 4].reduce((s, p, i) => s + p * Number(base[i]), 0);
    return (10 - (suma % 10)) % 10 === Number(d.at(-1));
  }

  function marcar(campo, texto) {
    const input = form.elements[campo];
    if (!input || !input.setAttribute) return;
    input.setAttribute('aria-invalid', 'true');
    const caja = input.closest('.campo');
    let nota = caja && $('.error', caja);
    if (caja && texto) {
      if (!nota) {
        nota = document.createElement('span');
        nota.className = 'error';
        caja.append(nota);
      }
      nota.textContent = texto;
    }
    input.addEventListener('input', () => { input.removeAttribute('aria-invalid'); nota?.remove(); }, { once: true });
  }

  // Dirección: busca mientras se escribe (o con Enter / Buscar, en más fuentes), la persona elige la ubicación de
  // la lista y se genera el link a Google Maps. Sin elegir, se guarda solo el texto.
  let dirUI = null;
  function iniciarDireccion() {
    const B = window.BuscadorDireccion;
    const campoDir = form.elements.direccion;
    const caja = $('[data-dir-resultados]', form);
    const elegidaCaja = $('[data-dir-elegida]', form);
    let enlace = '';
    let temporizador = null;
    let control = null;
    let numero = 0;

    const mostrar = (html) => { caja.innerHTML = html; caja.hidden = !html; };
    const pintarElegida = (dir) => {
      elegidaCaja.innerHTML = enlace
        ? `<p class="dir-elegida">${icono('check', 16)}<span>Ubicación elegida${dir ? ` · <span class="badge ${dir.precision === 'exacta' ? 'badge--ok' : 'badge--aviso'}">${esc(dir.precisionTexto)}</span>` : ''}</span>
            <a href="${esc(enlace)}" target="_blank" rel="noopener noreferrer">Ver en Google Maps ${icono('externo', 14)}</a>
            <button type="button" class="btn btn--ghost btn--sm" data-quitar-dir>Quitar</button></p>`
        : '';
      $('[data-quitar-dir]', elegidaCaja)?.addEventListener('click', () => {
        enlace = '';
        pintarElegida();
        guardarLocal(CLAVE_FORM, valoresFormulario());
      });
    };

    async function buscar(completa) {
      const texto = campoDir.value.trim();
      clearTimeout(temporizador);
      control?.abort();
      $$('.error', $('[data-direccion]', form)).forEach((e) => e.remove());
      campoDir.removeAttribute('aria-invalid');
      if (!B || texto.length < 3) { mostrar(''); return; }
      const mio = ++numero;
      control = new AbortController();
      mostrar('<p class="dir-estado">Buscando…</p>');
      let r;
      try {
        r = await B.buscar(texto, { completa, signal: control.signal });
      } catch (e) {
        if (e.name === 'AbortError') return;
        mostrar('<p class="dir-estado dir-estado--error">No se pudo buscar la dirección. Podés guardar el texto igual.</p>');
        return;
      }
      if (mio !== numero) return;
      if (r.error) {
        mostrar('');
        marcar('direccion', r.error.mensaje);
        return;
      }
      if (!r.resultados.length) {
        mostrar(`<p class="dir-estado${r.fallaron && r.fallaron === r.consultas ? ' dir-estado--error' : ''}">${r.fallaron && r.fallaron === r.consultas
          ? 'El servicio de mapas no respondió. Podés guardar el texto igual, sin link.'
          : 'No encontré esa dirección. Revisá cómo está escrita (calle y número) o tocá «Buscar» para consultar más fuentes.'}</p>`);
        return;
      }
      mostrar(`<ul class="dir-lista" role="listbox" aria-label="Direcciones encontradas">${r.resultados.map((d, i) => `<li role="option">
          <button type="button" class="dir-opcion" data-i="${i}"><strong>${esc(d.titulo)}</strong><span>${esc(d.detalle)}</span>
          <em class="dir-precision dir-precision--${d.precision}">${esc(d.precisionTexto)}</em></button></li>`).join('')}</ul>
        ${completa ? '' : '<button type="button" class="btn btn--ghost btn--sm" data-mas-dir>Buscar en más fuentes</button>'}`);
      $$('[data-i]', caja).forEach((b) => b.addEventListener('click', () => elegir(r.resultados[Number(b.dataset.i)])));
      $('[data-mas-dir]', caja)?.addEventListener('click', () => buscar(true));
    }

    function elegir(d) {
      const motivo = B.validar(d);
      if (motivo) {
        $$('.error', $('[data-direccion]', form)).forEach((e) => e.remove());
        marcar('direccion', motivo);
        return;
      }
      const zona = [d.barrio && d.barrio !== d.ciudad ? d.barrio : '', d.ciudad, d.departamento];
      const texto = [...new Set([`${d.titulo}${d.unidad ? ` ${d.unidad}` : ''}`, ...zona].filter(Boolean))].join(', ');
      campoDir.value = texto;
      campoDir.classList.remove('completado');
      campoDir.removeAttribute('aria-invalid');
      enlace = B.urlGoogleMaps(d);
      mostrar('');
      pintarElegida(d);
      guardarLocal(CLAVE_FORM, valoresFormulario());
    }

    // Si se vuelve a escribir, la ubicación elegida ya no corresponde.
    campoDir.addEventListener('input', () => {
      if (enlace) { enlace = ''; pintarElegida(); }
      clearTimeout(temporizador);
      temporizador = setTimeout(() => buscar(false), 450);
    });
    campoDir.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); buscar(true); }
      if (ev.key === 'Escape') mostrar('');
      if (ev.key === 'ArrowDown') { ev.preventDefault(); $('.dir-opcion', caja)?.focus(); }
    });
    caja.addEventListener('keydown', (ev) => {
      const botones = $$('.dir-opcion', caja);
      const i = botones.indexOf(document.activeElement);
      if (ev.key === 'ArrowDown') { ev.preventDefault(); botones[Math.min(i + 1, botones.length - 1)]?.focus(); }
      if (ev.key === 'ArrowUp') { ev.preventDefault(); (i > 0 ? botones[i - 1] : campoDir).focus(); }
      if (ev.key === 'Escape') { mostrar(''); campoDir.focus(); }
    });
    $('[data-buscar-dir]', form).addEventListener('click', () => buscar(true));

    return {
      url: () => enlace,
      restaurar(url) { enlace = typeof url === 'string' ? url : ''; pintarElegida(); },
      reiniciar() { enlace = ''; clearTimeout(temporizador); control?.abort(); mostrar(''); pintarElegida(); },
      /** La dirección se cambió desde afuera (asistente o deshacer): la ubicación elegida ya no vale. */
      cambioExterno(buscarAhora) {
        enlace = '';
        pintarElegida();
        if (buscarAhora) buscar(false); else mostrar('');
      },
    };
  }

  const valoresFormulario = () => ({ ...Object.fromEntries(CAMPOS.map((c) => [c, form.elements[c].value.trim()])), flete: form.elements.flete.value || 'No', mapa: dirUI?.url() ?? '' });

  function restaurarFormulario() {
    const v = leerLocal(CLAVE_FORM, null);
    if (!v) return;
    for (const c of CAMPOS) form.elements[c].value = v[c] ?? '';
    form.elements.flete.value = v.flete || 'No';
    dirUI?.restaurar(v.mapa);
  }

  function limpiarFormulario() {
    form.reset();
    dirUI?.reiniciar();
    $$('.completado', form).forEach((el) => el.classList.remove('completado'));
    $$('[aria-invalid]', form).forEach((el) => el.removeAttribute('aria-invalid'));
    $$('.error', form).forEach((el) => el.remove());
    guardarLocal(CLAVE_FORM, null);
  }

  function aplicarCampos(campos) {
    for (const [c, v] of Object.entries(campos)) {
      if (c === 'flete') {
        form.elements.flete.value = v;
        $('[data-flete]', form).classList.add('completado');
      } else if (form.elements[c]) {
        form.elements[c].value = v;
        form.elements[c].classList.add('completado');
        form.elements[c].removeAttribute('aria-invalid');
        // El asistente escribió la dirección: se buscan las ubicaciones para que la persona elija la correcta.
        if (c === 'direccion') dirUI?.cambioExterno(true);
      }
    }
    guardarLocal(CLAVE_FORM, valoresFormulario());
  }

  function validarLocal() {
    const errores = {};
    for (const c of CAMPOS) if (OBLIGATORIOS.has(c) && !form.elements[c].value.trim()) errores[c] = 'Falta completar.';
    const socio = form.elements.socio.value.replace(/[\s.]/g, '');
    if (socio && !/^\d+$/.test(socio)) errores.socio = 'Solo números.';
    const B = window.BuscadorDireccion;
    const dir = B?.problemaNumero(B.partirDireccion(form.elements.direccion.value).numero);
    if (dir) errores.direccion = dir;
    const ced = form.elements.cedula.value.trim();
    if (ced && !cedulaValida(ced)) errores.cedula = 'Cédula no válida: tiene que tener 7 u 8 números (el último es el verificador). Revisá que estén bien.';
    return errores;
  }

  let chat = null;
  async function guardarRegistro() {
    const caja = $('[data-estado-registro]', form);
    $$('.error', form).forEach((el) => el.remove());
    const errores = validarLocal();
    if (Object.keys(errores).length) {
      for (const [k, v] of Object.entries(errores)) marcar(k, v);
      caja.innerHTML = '<p class="estado estado--error">Revisá los campos marcados.</p>';
      form.elements[Object.keys(errores)[0]].focus();
      return;
    }
    const boton = $('button[type="submit"]', form);
    boton.setAttribute('aria-busy', 'true');
    boton.disabled = true;
    caja.innerHTML = '<p class="estado" role="status">Guardando…</p>';
    const r = await api('guardar', valoresFormulario());
    boton.removeAttribute('aria-busy');
    boton.disabled = false;
    if (!r.ok) {
      if (r.errores) for (const [k, v] of Object.entries(r.errores)) marcar(k, v);
      caja.innerHTML = `<p class="estado estado--error" role="alert">${esc(r.error || 'No se pudo guardar.')}</p>`;
      return;
    }
    limpiarFormulario();
    caja.innerHTML = `<p class="estado estado--ok" role="status">Guardado: ${esc(r.registro.nombre)} · ${esc(r.registro.producto)}.</p>`;
    // Cada registro es una conversación: se empieza otra, con una nota de lo guardado.
    if (chat) chat.reiniciar(`Guardado: ${r.registro.nombre} · ${r.registro.producto}`);
    form.elements.nombre.focus();
  }

  // ── Micrófono: dictado con el reconocimiento de voz del navegador (Chrome, Edge, Safari) ──
  let reconocimiento = null;
  let escuchando = false;
  function detenerMicrofono() {
    escuchando = false;
    try { reconocimiento?.stop(); } catch { /* ya estaba detenido */ }
  }
  const ERRORES_VOZ = {
    'not-allowed': 'El navegador no dejó usar el micrófono. Tocá el candado de la barra de direcciones y permitilo.',
    'service-not-allowed': 'El navegador no dejó usar el dictado. Tocá el candado de la barra de direcciones y permitilo.',
    'audio-capture': 'No se encontró un micrófono. Conectá uno y probá de nuevo.',
    network: 'El dictado necesita internet y los servicios de voz de Google. Si usás Brave u otro navegador que los bloquea, probá con Chrome o Edge.',
    'language-not-supported': 'Este navegador no entiende el idioma español.',
  };

  // Se escucha de a frases y se reinicia solo mientras el botón siga rojo: así funciona igual en la computadora y en el celular.
  function prepararMicrofono(boton, texto, ayuda) {
    if (!boton) return;
    boton.hidden = false;
    const Reconocimiento = window.SpeechRecognition || window.webkitSpeechRecognition;
    const ayudaNormal = ayuda.textContent;
    const decir = (t, clase = '') => { ayuda.innerHTML = `<span class="${clase}">${esc(t)}</span>`; };
    const pintarBoton = (activo) => {
      boton.setAttribute('aria-pressed', String(activo));
      boton.innerHTML = icono(activo ? 'parar' : 'microfono', activo ? 16 : 18);
      boton.title = activo ? 'Dejar de escuchar' : 'Dictar los datos';
    };
    if (!Reconocimiento) {
      boton.addEventListener('click', () => decir('Este navegador no permite dictar. Usá Chrome o Edge, o el micrófono del teclado de tu celular.', 'chat__escuchando'));
      return;
    }
    let base = '';
    let acumulado = '';
    let silencios = 0;
    let tope = null;

    const terminar = (mensaje) => {
      escuchando = false;
      clearTimeout(tope);
      pintarBoton(false);
      if (mensaje) decir(mensaje, 'chat__escuchando'); else ayuda.textContent = ayudaNormal;
      reconocimiento = null;
    };

    function escuchar() {
      const r = new Reconocimiento();
      reconocimiento = r;
      r.lang = 'es-UY';
      r.continuous = false;
      r.interimResults = true;
      r.maxAlternatives = 1;
      r.onresult = (ev) => {
        silencios = 0;
        let parcial = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const t = ev.results[i][0].transcript;
          if (ev.results[i].isFinal) acumulado = `${acumulado} ${t}`.trim(); else parcial += t;
        }
        if (escuchando) texto.value = `${base} ${acumulado} ${parcial}`.replace(/\s+/g, ' ').trim();
      };
      r.onerror = (ev) => {
        if (ev.error === 'no-speech') { silencios++; return; }
        if (ev.error === 'aborted') return;
        terminar(ERRORES_VOZ[ev.error] ?? `No se pudo usar el micrófono (${ev.error}).`);
      };
      r.onend = () => {
        if (!escuchando) { if (reconocimiento === r) terminar(); texto.focus(); return; }
        if (silencios >= 3) { terminar('No se escuchó nada. Acercate al micrófono y probá de nuevo.'); return; }
        try { escuchar(); } catch { terminar('Se cortó el dictado. Tocá el micrófono para seguir.'); }
      };
      r.start();
    }

    boton.addEventListener('click', () => {
      if (escuchando) { detenerMicrofono(); return; }
      base = texto.value.trim();
      acumulado = '';
      silencios = 0;
      escuchando = true;
      pintarBoton(true);
      decir('Escuchando… hablá claro y tocá el botón rojo al terminar.', 'chat__escuchando');
      clearTimeout(tope);
      tope = setTimeout(() => detenerMicrofono(), 120_000); // corte de seguridad: 2 minutos
      try { escuchar(); } catch { terminar('No se pudo usar el micrófono. Probá de nuevo.'); }
    });
  }

  // ── Chat del asistente. Cada respuesta que cambió campos guarda cómo estaban antes, para poder deshacerla. ──
  function iniciarChat() {
    const caja = $('[data-mensajes]');
    const entrada = $('[data-chat]');
    const texto = entrada.elements.texto;
    let mensajes = leerLocal(CLAVE_CHAT, []);
    let ocupado = false;
    const adjuntos = []; // { tipo: 'imagen'|'pdf', datos (base64), nombre }
    const cajaAdjuntos = $('[data-adjuntos]');

    function pintarAdjuntos() {
      cajaAdjuntos.hidden = !adjuntos.length;
      cajaAdjuntos.innerHTML = adjuntos.map((a, i) => `<span class="adjunto">${icono('clip', 12)}<span>${esc(a.nombre)}</span><button type="button" data-quitar="${i}" aria-label="Quitar ${esc(a.nombre)}">×</button></span>`).join('');
    }
    cajaAdjuntos.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-quitar]');
      if (b) { adjuntos.splice(Number(b.dataset.quitar), 1); pintarAdjuntos(); }
    });

    /** Foto reducida (máx. 1600 px, JPEG) para que suba rápido y entre en el límite de tamaño. */
    const reducirImagen = async (archivo) => {
      const img = await createImageBitmap(archivo); // sin imágenes temporales (blob:), que la política de seguridad no permite
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k));
      c.height = Math.max(1, Math.round(img.height * k));
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      img.close?.();
      return c.toDataURL('image/jpeg', 0.82).split(',')[1];
    };
    const aBase64 = (archivo) => new Promise((ok, mal) => {
      const l = new FileReader();
      l.onload = () => ok(String(l.result).split(',')[1]);
      l.onerror = () => mal(new Error('lectura'));
      l.readAsDataURL(archivo);
    });
    const avisoChat = (t) => { mensajes.push({ rol: 'error', texto: t }); dibujar(); };

    async function agregarArchivos(lista) {
      for (const f of [...lista]) {
        if (adjuntos.length >= 3) { avisoChat('Se pueden adjuntar hasta 3 archivos por mensaje.'); break; }
        try {
          if (f.type.startsWith('image/')) {
            adjuntos.push({ tipo: 'imagen', datos: await reducirImagen(f), nombre: f.name || 'foto.jpg' });
          } else if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
            if (f.size > 2_500_000) { avisoChat(`«${f.name}» pesa demasiado (máximo 2,5 MB por PDF). Probá con una foto de la página.`); continue; }
            adjuntos.push({ tipo: 'pdf', datos: await aBase64(f), nombre: f.name });
          } else if (f.type === 'text/plain' || /\.txt$/i.test(f.name)) {
            const t = (await f.text()).trim().slice(0, 4000);
            texto.value = `${texto.value.trim()} ${t}`.trim();
            texto.focus();
          } else {
            avisoChat(`No puedo leer «${f.name}». Adjuntá una foto, un PDF o un archivo de texto (.txt).`);
          }
        } catch {
          avisoChat(`No se pudo abrir «${f.name}». Probá con otro archivo.`);
        }
      }
      pintarAdjuntos();
    }
    for (const [boton, input] of [['[data-camara]', '[data-archivo-camara]'], ['[data-clip]', '[data-archivo-clip]']]) {
      $(boton).addEventListener('click', () => $(input).click());
      $(input).addEventListener('change', async (ev) => { await agregarArchivos(ev.target.files); ev.target.value = ''; });
    }
    // También se puede pegar una captura (Ctrl+V) o arrastrar un archivo a la caja.
    texto.addEventListener('paste', (ev) => { const f = [...(ev.clipboardData?.files ?? [])]; if (f.length) { ev.preventDefault(); agregarArchivos(f); } });
    texto.addEventListener('dragover', (ev) => ev.preventDefault());
    texto.addEventListener('drop', (ev) => { if (ev.dataTransfer?.files?.length) { ev.preventDefault(); agregarArchivos(ev.dataTransfer.files); } });

    const vacio = `<div class="chat__vacio">
      <p><strong>Contame los datos como te llegaron</strong> y completo el formulario. Podés pegar un mensaje, escribirlo o dictarlo con el micrófono. Después revisás y guardás.</p>
      <p class="chat__ejemplo">«María Rodríguez, socia 48213, cédula 55605392, Bv. Artigas 1520 apto 503. Lavarropas Samsung 8 kg, código 467972. Va con flete.»</p>
      <p>También podés corregir: «el código es 467973» o «no lleva flete».</p>
    </div>`;

    const dibujar = () => {
      caja.innerHTML = mensajes.length ? mensajes.map((m, i) => {
        if (m.rol === 'nota') return `<div class="msj msj--nota"><div class="msj__texto">${icono('check', 14)} ${esc(m.texto)}</div></div>`;
        if (m.rol === 'usuario') return `<div class="msj msj--usuario"><span class="msj__autor">Vos</span><div class="msj__texto">${esc(m.texto)}</div>${m.archivos?.length ? `<ul class="msj__cambios">${m.archivos.map((a) => `<li>${icono('clip', 12)} ${esc(a)}</li>`).join('')}</ul>` : ''}</div>`;
        if (m.rol === 'error') return `<div class="msj msj--asistente msj--error"><span class="msj__autor">Asistente</span><div class="msj__texto">${esc(m.texto)}</div></div>`;
        const cambios = Object.entries(m.campos ?? {});
        return `<div class="msj msj--asistente ${m.deshecho ? 'msj--deshecho' : ''}"><span class="msj__autor">Asistente</span>
          <div class="msj__texto">${esc(m.texto)}</div>
          ${cambios.length ? `<ul class="msj__cambios" aria-label="Campos completados">${cambios.map(([c, v]) => `<li title="${esc(v)}">${esc(ETIQUETAS[c] ?? c)}: ${esc(v)}</li>`).join('')}</ul>` : ''}
          ${m.faltan?.length && !m.deshecho ? `<span class="msj__faltan">Falta: ${esc(m.faltan.join(', '))}</span>` : ''}
          ${cambios.length ? (m.deshecho
            ? `<span class="msj__deshecho">${icono('deshacer', 14)}Deshecho</span>`
            : `<button type="button" class="msj__deshacer" data-deshacer="${i}" title="Volver el formulario a como estaba antes de esta respuesta">${icono('deshacer', 16)}Deshacer</button>`) : ''}
        </div>`;
      }).join('') : vacio;
      if (ocupado) caja.insertAdjacentHTML('beforeend', '<div class="msj msj--asistente msj--pendiente"><span class="msj__autor">Asistente</span><div class="msj__texto">Completando el formulario…</div></div>');
      caja.scrollTop = caja.scrollHeight;
      guardarLocal(CLAVE_CHAT, mensajes);
    };

    caja.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-deshacer]');
      if (!b) return;
      const m = mensajes[Number(b.dataset.deshacer)];
      if (!m || m.deshecho) return;
      // Solo se devuelven los campos que cambió esta respuesta (los que cambiaste después quedan como están).
      for (const [c, v] of Object.entries(m.antes ?? {})) {
        if (c === 'flete') form.elements.flete.value = v || 'No';
        else if (form.elements[c]) form.elements[c].value = v;
        (c === 'flete' ? $('[data-flete]', form) : form.elements[c])?.classList.remove('completado');
        if (c === 'direccion') dirUI?.cambioExterno(false);
      }
      guardarLocal(CLAVE_FORM, valoresFormulario());
      m.deshecho = true;
      dibujar();
    });

    const enviar = async () => {
      const t = texto.value.trim() || (adjuntos.length ? 'Completá el formulario con los datos de lo que adjunté.' : '');
      if (!t || ocupado) return;
      detenerMicrofono();
      const enviados = adjuntos.splice(0);
      pintarAdjuntos();
      mensajes.push({ rol: 'usuario', texto: t, archivos: enviados.map((a) => a.nombre) });
      texto.value = '';
      ocupado = true;
      dibujar();
      const historial = mensajes.filter((m) => m.rol === 'usuario' || m.rol === 'asistente').map((m) => ({ rol: m.rol, texto: m.texto }));
      const r = await api('asistente', { mensajes: historial, formulario: valoresFormulario(), adjuntos: enviados.map(({ tipo, datos, nombre }) => ({ tipo, datos, nombre })) });
      ocupado = false;
      if (!r.ok) {
        mensajes.push({ rol: 'error', texto: r.error || 'El asistente no respondió.' });
        dibujar();
        return;
      }
      const actual = valoresFormulario();
      const antes = Object.fromEntries(Object.keys(r.campos ?? {}).map((c) => [c, actual[c] ?? '']));
      aplicarCampos(r.campos ?? {});
      mensajes.push({ rol: 'asistente', texto: r.respuesta, campos: r.campos ?? {}, faltan: r.faltan ?? [], antes });
      dibujar();
    };

    entrada.addEventListener('submit', (ev) => { ev.preventDefault(); enviar(); });
    texto.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); enviar(); }
    });
    $('[data-nuevo-chat]').addEventListener('click', () => {
      if (mensajes.length && !confirm('¿Empezar una conversación nueva? El formulario queda como está.')) return;
      mensajes = [];
      dibujar();
      texto.focus();
    });
    prepararMicrofono($('[data-microfono]'), texto, $('[data-ayuda-chat]'));
    chat = {
      reiniciar(nota) {
        mensajes = nota ? [{ rol: 'nota', texto: nota }] : [];
        dibujar();
      },
    };
    dibujar();
  }

  // ── Arranque ──
  dirUI = iniciarDireccion();
  restaurarFormulario();
  form.addEventListener('input', (ev) => {
    if (ev.target.name === 'cedula') ev.target.value = ev.target.value.replace(/\D/g, '').slice(0, 8); // solo números, sin puntos ni guion
    ev.target.classList?.remove('completado');
    if (ev.target.name === 'flete') $('[data-flete]', form).classList.remove('completado');
    guardarLocal(CLAVE_FORM, valoresFormulario());
  });
  form.addEventListener('change', () => guardarLocal(CLAVE_FORM, valoresFormulario()));
  $('[data-limpiar]', form).addEventListener('click', () => {
    limpiarFormulario();
    $('[data-estado-registro]', form).innerHTML = '';
    form.elements.nombre.focus();
  });
  form.addEventListener('submit', (ev) => { ev.preventDefault(); guardarRegistro(); });
  if (IA) iniciarChat();
})();
