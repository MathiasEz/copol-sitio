// Panel de stock: mejora progresiva. Todo funciona sin JavaScript (formularios normales); con JS:
// guardado de stock sin recargar (con confirmación solo si el servidor verificó el guardado), menú
// móvil, vista previa de imágenes y escaneo del código interno con la cámara.
(() => {
  const ETIQUETAS = { 'con-stock': 'Con stock', 'sin-stock': 'Sin stock', 'sin-dato': 'Sin dato' };
  const ICONOS = { 'con-stock': '<path d="M20 6 9 17l-5-5"/>', 'sin-stock': '<path d="M18 6 6 18M6 6l12 12"/>', 'sin-dato': '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>' };
  const badge = (estado, cantidad) => {
    const s = document.createElement('span');
    s.className = `badge badge--${estado}`;
    s.innerHTML = `<svg class="i" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[estado]}</svg>`;
    s.append(ETIQUETAS[estado] + (cantidad != null ? ` · ${cantidad} u.` : ''));
    return s;
  };

  // Menú: abierto en escritorio, cerrado al cargar en pantallas angostas.
  const menu = document.querySelector('[data-menu]');
  if (menu && matchMedia('(max-width: 899px)').matches) menu.removeAttribute('open');

  // ── Guardado de stock desde la tabla ──
  document.addEventListener('submit', async (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.dataset.confirmar && !confirm(form.dataset.confirmar)) { e.preventDefault(); return; }
    if (!form.matches('[data-stock]')) return;
    e.preventDefault();
    const boton = form.querySelector('button[type="submit"]');
    const nota = form.querySelector('.stock__nota');
    const nota_ = (texto, tipo) => { nota.textContent = texto; nota.className = `stock__nota${tipo ? ` stock__nota--${tipo}` : ''}`; };
    boton?.setAttribute('aria-busy', 'true');
    nota_('Guardando…');
    try {
      const res = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' }, credentials: 'same-origin' });
      if (res.redirected || res.status === 401) { location.href = `${document.documentElement.dataset.base || ''}/ingresar?aviso=sesion-vencida`; return; }
      const datos = await res.json().catch(() => ({ ok: false, error: 'Respuesta inesperada del servidor.' }));
      // Solo se confirma si el servidor releyó la base y verificó el valor guardado.
      if (!datos.ok || !datos.verificado) {
        nota_(datos.error ?? 'No se pudo guardar.', 'error');
        if (datos.version) form.querySelector('[name="version"]').value = datos.version;
        return;
      }
      form.querySelector('[name="version"]').value = datos.version;
      const radio = form.querySelector(`[name="estado"][value="${datos.estado}"]`);
      if (radio) radio.checked = true;
      form.querySelector('[name="cantidad"]').value = datos.cantidad ?? '';
      form.closest('tr')?.querySelector('[data-estado]')?.replaceChildren(badge(datos.estado, datos.cantidad));
      nota_(`Guardado: ${datos.etiqueta}`, 'ok');
    } catch {
      nota_('Sin conexión. No se guardó: probá de nuevo.', 'error');
    } finally {
      boton?.removeAttribute('aria-busy');
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    // Al elegir sí/no se descarta una cantidad que ya no coincide.
    if (t instanceof HTMLInputElement && t.name === 'estado') {
      const cant = t.form?.querySelector('[name="cantidad"]');
      if (cant && cant.value !== '' && ((t.value === 'sin-stock' && cant.value !== '0') || (t.value === 'con-stock' && cant.value === '0'))) cant.value = '';
    }
    if (t instanceof HTMLSelectElement && t.matches('[data-autoenvio]')) t.form?.requestSubmit();
    if (t instanceof HTMLInputElement && t.matches('[data-vista-previa]') && t.files?.[0]) {
      const img = document.querySelector('[data-vista-img]');
      if (!img) return;
      img.src = URL.createObjectURL(t.files[0]);
      img.hidden = false;
      document.querySelector('[data-vista-vacio]')?.setAttribute('hidden', '');
    }
  });

  // ── Carrusel de "Información empleados": cinta continua ──
  // Las piezas pasan de seguido, a velocidad fija (cada una tarda ~1,5 s en pasar), en bucle sin cortes
  // (se duplican). Se detiene con el puntero o el foco encima, mientras se toca o se desliza a mano (retoma
  // a los 2,5 s), con la pestaña oculta y con el botón Pausar. Con "reducir movimiento" empieza detenida.
  // Sin JS queda la tira deslizable con encastre.
  const ICONO_PAUSA = '<path d="M9 5v14M15 5v14"/>';
  const ICONO_PLAY = '<path d="M7 4v16l13-8Z"/>';
  const SEGUNDOS_POR_PIEZA = 1.5;
  document.querySelectorAll('[data-carrusel-panel]').forEach((c) => {
    const pista = c.querySelector('[data-pista]');
    const controles = c.querySelector('[data-controles]');
    if (!pista || !controles) return;
    const originales = [...pista.children];
    // Copias para el bucle: decorativas (ocultas para lectores de pantalla).
    for (let vuelta = 0; vuelta < 2; vuelta++) {
      originales.forEach((li) => {
        const copia = li.cloneNode(true);
        copia.setAttribute('aria-hidden', 'true');
        copia.querySelectorAll('img').forEach((img) => { img.alt = ''; img.loading = 'eager'; });
        copia.querySelectorAll('.sr').forEach((s) => s.remove());
        pista.append(copia);
      });
    }
    c.classList.add('carrusel-panel--continuo');
    controles.hidden = false;
    const boton = c.querySelector('[data-pausa]');
    const textoBoton = c.querySelector('[data-pausa-texto]');

    const anchoSet = () => pista.children[originales.length].offsetLeft - pista.children[0].offsetLeft;
    const velocidad = () => (pista.children[1].offsetLeft - pista.children[0].offsetLeft) / SEGUNDOS_POR_PIEZA;

    let pausadoPorUsuario = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let encima = false;
    let enMano = false;
    let pos = 0;
    let ultimo = 0;
    let retomar;
    const activo = () => !pausadoPorUsuario && !encima && !enMano && !document.hidden;
    // El avance depende del tiempo real (no de los cuadros por segundo). Mientras está detenida, el reloj
    // se mantiene al día para que al retomar no "salte".
    const cuadro = (t) => {
      const dt = ultimo ? (t - ultimo) / 1000 : 0;
      ultimo = t;
      if (activo() && dt < 5) {
        const set = anchoSet();
        pos += velocidad() * dt;
        if (set > 0 && pos >= set) pos -= set;
        pista.scrollLeft = pos;
      }
      requestAnimationFrame(cuadro);
    };
    // Al retomar, sigue desde donde la dejó la persona (dentro del primer juego de piezas).
    const sincronizar = () => { const set = anchoSet(); pos = set > 0 ? pista.scrollLeft % set : pista.scrollLeft; };
    const pintar = () => {
      boton?.setAttribute('aria-pressed', String(pausadoPorUsuario));
      if (textoBoton) textoBoton.textContent = pausadoPorUsuario ? 'Reproducir' : 'Pausar';
      const svg = boton?.querySelector('svg');
      if (svg) svg.innerHTML = pausadoPorUsuario ? ICONO_PLAY : ICONO_PAUSA;
    };
    boton?.addEventListener('click', () => { pausadoPorUsuario = !pausadoPorUsuario; sincronizar(); pintar(); });
    pista.addEventListener('mouseenter', () => { encima = true; });
    pista.addEventListener('mouseleave', () => { encima = false; sincronizar(); });
    pista.addEventListener('focusin', () => { encima = true; });
    pista.addEventListener('focusout', () => { encima = false; sincronizar(); });
    const tocar = () => { enMano = true; clearTimeout(retomar); };
    const soltar = () => { clearTimeout(retomar); retomar = setTimeout(() => { enMano = false; sincronizar(); }, 2500); };
    pista.addEventListener('pointerdown', tocar);
    pista.addEventListener('touchstart', tocar, { passive: true });
    pista.addEventListener('pointerup', soltar);
    pista.addEventListener('touchend', soltar, { passive: true });
    pista.addEventListener('wheel', () => { tocar(); soltar(); }, { passive: true });
    pista.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      pista.scrollLeft += (e.key === 'ArrowRight' ? 1 : -1) * (pista.children[1].offsetLeft - pista.children[0].offsetLeft);
      sincronizar();
    });
    pintar();
    requestAnimationFrame(cuadro);
  });

  // ── Administración Página: vista previa del banner de Inicio ──
  // Selector Computadora / Celular (el banner usa consultas de contenedor: en "Celular" el recuadro se
  // angosta a 375 px). Los enlaces de la vista previa no navegan.
  document.querySelectorAll('[data-previa]').forEach((previa) => {
    const modos = previa.querySelector('[data-previa-modos]');
    if (!modos) return;
    modos.hidden = false;
    modos.querySelectorAll('[data-previa-modo]').forEach((b) => b.addEventListener('click', () => {
      const celular = b.dataset.previaModo === 'celular';
      previa.classList.toggle('previa--celular', celular);
      modos.querySelectorAll('[data-previa-modo]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }));
  });
  document.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('[data-previa-marco] a')) e.preventDefault();
  });

  // Edición de una diapositiva: la vista previa refleja cada cambio del formulario al instante.
  const editor = document.querySelector('[data-bi-editor]');
  const diapo = editor?.querySelector('[data-bi-diapo]');
  if (editor && diapo) {
    const el = (n) => diapo.querySelector(`[data-bi-campo="${n}"]`);
    const val = (n) => (editor.elements.namedItem(n)?.value ?? '').trim();
    const marcado = (n) => editor.querySelector(`[name="${n}"]:checked`)?.value ?? '';
    const poner = (n, v, siVacio) => {
      const e = el(n);
      if (!e) return;
      e.textContent = v || siVacio || '';
      if (siVacio === undefined) e.hidden = !v;
    };
    const cambiarClase = (prefijo, valor) => {
      [...diapo.classList].filter((k) => k.startsWith(prefijo)).forEach((k) => diapo.classList.remove(k));
      if (valor) diapo.classList.add(prefijo + valor);
    };
    let movilNueva = false;
    const actualizar = () => {
      poner('antetitulo', val('antetitulo'));
      poner('titulo', val('titulo'), 'Título de la diapositiva');
      poner('resaltado', val('resaltado'));
      poner('texto', val('texto'));
      poner('etiqueta', val('etiqueta'));
      for (const n of [1, 2]) {
        const texto = val(`boton${n}_texto`);
        poner(`boton${n}-texto`, texto, '');
        el(`boton${n}`).hidden = !texto;
      }
      el('acciones').hidden = el('boton1').hidden && el('boton2').hidden;
      const diseno = marcado('diseno');
      ['lateral', 'tarjeta', 'solo-imagen'].forEach((d) => diapo.classList.toggle(`bi__diapo--${d}`, d === diseno));
      diapo.classList.toggle('bi__diapo--completa', Boolean(editor.elements.namedItem('completa')?.checked));
      cambiarClase('bi__foco--', marcado('foco'));
      const movil = el('imagen-movil');
      const quitar = editor.elements.namedItem('quitar_movil')?.checked && !movilNueva;
      const conMovil = Boolean(movil?.getAttribute('src')) && !quitar;
      if (movil) movil.hidden = !conMovil;
      diapo.classList.toggle('bi__diapo--con-movil', conMovil);
    };
    editor.addEventListener('input', actualizar);
    editor.addEventListener('change', (e) => {
      const t = e.target;
      if (t instanceof HTMLInputElement && t.dataset.biArchivo && t.files?.[0]) {
        const url = URL.createObjectURL(t.files[0]);
        if (t.dataset.biArchivo === 'imagen') {
          const img = el('imagen');
          img.removeAttribute('srcset');
          img.src = url;
          img.hidden = false;
          el('fondo').src = url;
          el('vacio').hidden = true;
        } else {
          el('imagen-movil').src = url;
          movilNueva = true;
        }
      }
      actualizar();
    });
    actualizar();
  }

  // ── Ofertas: las piezas se suben de a una (cada pedido queda lejos del límite de tamaño de Vercel) ──
  const subida = document.querySelector('[data-subir-piezas]');
  subida?.addEventListener('submit', async (e) => {
    const entrada = subida.querySelector('input[type="file"]');
    const archivos = [...(entrada?.files ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
    if (!archivos.length || typeof fetch === 'undefined') return;
    e.preventDefault();
    const estado = subida.querySelector('[data-subir-estado]');
    const boton = subida.querySelector('button[type="submit"]');
    boton.disabled = true;
    boton.setAttribute('aria-busy', 'true');
    let fallidas = 0;
    for (const [i, archivo] of archivos.entries()) {
      estado.textContent = `Subiendo ${i + 1} de ${archivos.length}…`;
      const fd = new FormData();
      fd.set('_csrf', subida.querySelector('[name="_csrf"]').value);
      fd.set('piezas', await achicar(archivo).catch(() => archivo));
      try {
        const res = await fetch(subida.action, { method: 'POST', body: fd, headers: { Accept: 'application/json' }, credentials: 'same-origin' });
        if (res.redirected || res.status === 401) { location.href = `${document.documentElement.dataset.base || ''}/ingresar?aviso=sesion-vencida`; return; }
        const datos = await res.json().catch(() => ({ ok: false }));
        if (!datos.ok) fallidas++;
      } catch {
        fallidas++;
      }
    }
    location.href = `${subida.action.replace(/\/piezas$/, '')}?aviso=${fallidas ? 'ofertas-error-subida' : 'ofertas-agregadas'}`;
  });

  // ── Fotos grandes: se achican en el navegador antes de enviarlas ──
  // Vercel rechaza pedidos de más de ~4,5 MB; una foto de celular ronda los 3-6 MB. Se reducen a 1800 px
  // (WebP). Si el navegador no puede, se envían tal cual y el servidor informa si son demasiado grandes.
  const achicar = async (archivo) => {
    if (!/^image\/(jpeg|png|webp|avif|heic|heif)$/.test(archivo.type) || archivo.size < 900 * 1024) return archivo;
    const bitmap = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
    const escala = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(bitmap.width * escala);
    lienzo.height = Math.round(bitmap.height * escala);
    lienzo.getContext('2d').drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
    bitmap.close?.();
    const blob = await new Promise((ok) => lienzo.toBlob(ok, 'image/webp', 0.86));
    return blob && blob.size < archivo.size ? new File([blob], archivo.name.replace(/\.\w+$/, '') + '.webp', { type: 'image/webp' }) : archivo;
  };
  document.addEventListener('submit', async (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement) || !form.matches('[data-comprimir]') || form.dataset.listo) return;
    const entradas = [...form.querySelectorAll('input[type="file"]')].filter((i) => i.files?.length);
    if (!entradas.length || typeof DataTransfer === 'undefined' || typeof createImageBitmap === 'undefined') return;
    e.preventDefault();
    const boton = form.querySelector('button[type="submit"]');
    boton?.setAttribute('aria-busy', 'true');
    if (boton) boton.disabled = true;
    try {
      for (const entrada of entradas) {
        const dt = new DataTransfer();
        for (const f of entrada.files) dt.items.add(await achicar(f).catch(() => f));
        entrada.files = dt.files;
      }
    } finally {
      form.dataset.listo = '1';
      form.submit();
    }
  });

  // ── Escaneo del código interno con la cámara ──
  // El permiso de cámara se pide recién al tocar "Escanear código". Si no hay cámara, no hay permiso o
  // el navegador no puede leer códigos, el campo sigue disponible para ingresarlo a mano.
  const boton = document.querySelector('[data-escanear]');
  const dialogo = document.getElementById('escaner');
  const campo = document.querySelector('[data-campo-codigo]');
  const estado = document.querySelector('[data-escaner-estado]');
  if (!boton || !dialogo || !campo) return;
  const video = dialogo.querySelector('video');
  const mensaje = dialogo.querySelector('[data-escaner-mensaje]');
  const FORMATOS = ['code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_39', 'itf', 'qr_code'];
  let flujo = null;
  let detener = null;

  const avisar = (texto) => { estado.textContent = texto; };
  const cerrar = () => {
    detener?.();
    detener = null;
    flujo?.getTracks().forEach((t) => t.stop());
    flujo = null;
    video.srcObject = null;
    if (dialogo.open) dialogo.close();
  };
  const listo = (codigo) => {
    const limpio = String(codigo).trim().replace(/\s+/g, '').slice(0, 20);
    cerrar();
    campo.value = limpio;
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    avisar(`Código escaneado: ${limpio}. Revisalo antes de guardar.`);
    campo.focus();
  };
  const cargarZxing = () => new Promise((resolve, reject) => {
    if (window.ZXingBrowser) return resolve(window.ZXingBrowser);
    const s = document.createElement('script');
    s.src = '/panel-recursos/zxing-browser.min.js';
    s.onload = () => (window.ZXingBrowser ? resolve(window.ZXingBrowser) : reject(new Error('lector no disponible')));
    s.onerror = () => reject(new Error('lector no disponible'));
    document.head.append(s);
  });

  dialogo.addEventListener('close', cerrar);
  dialogo.querySelectorAll('[data-cerrar-escaner]').forEach((b) => b.addEventListener('click', () => { cerrar(); campo.focus(); }));

  boton.addEventListener('click', async () => {
    avisar('');
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      avisar('La cámara no está disponible en este dispositivo o conexión. Ingresá el código a mano.');
      campo.focus();
      return;
    }
    mensaje.textContent = 'Pidiendo permiso para usar la cámara…';
    dialogo.showModal();
    try {
      flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    } catch (err) {
      cerrar();
      avisar(err?.name === 'NotAllowedError' ? 'No se dio permiso para usar la cámara. Podés ingresar el código a mano.' : 'No se pudo abrir la cámara. Ingresá el código a mano.');
      campo.focus();
      return;
    }
    video.srcObject = flujo;
    await video.play().catch(() => {});
    mensaje.textContent = 'Apuntá la cámara al código de barras.';
    try {
      const nativos = 'BarcodeDetector' in window ? await window.BarcodeDetector.getSupportedFormats().catch(() => []) : [];
      const usables = FORMATOS.filter((f) => nativos.includes(f));
      if (usables.length) {
        const detector = new window.BarcodeDetector({ formats: usables });
        let activo = true;
        detener = () => { activo = false; };
        const ciclo = async () => {
          if (!activo) return;
          try {
            const [codigo] = await detector.detect(video);
            if (codigo?.rawValue) return listo(codigo.rawValue);
          } catch { /* cuadro sin imagen todavía */ }
          setTimeout(ciclo, 180);
        };
        ciclo();
      } else {
        const { BrowserMultiFormatReader } = await cargarZxing();
        const lector = new BrowserMultiFormatReader();
        const controles = await lector.decodeFromVideoElement(video, (resultado) => {
          if (resultado) listo(resultado.getText());
        });
        detener = () => controles.stop();
      }
    } catch {
      cerrar();
      avisar('Este navegador no puede leer códigos con la cámara. Ingresá el código a mano.');
      campo.focus();
    }
  });
})();
