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
      if (res.redirected || res.status === 401) { location.href = '/panel/ingresar?aviso=sesion-vencida'; return; }
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
