/* Panel de envíos: búsqueda de la dirección, mapa y QR hacia Google Maps.
 * Búsqueda mientras se escribe: Photon (OpenStreetMap, pensado para autocompletar).
 * Búsqueda completa (Enter, lupa o «Buscar más»): Photon + Nominatim (OpenStreetMap). */
'use strict';

const DEPARTAMENTOS = ['Artigas', 'Canelones', 'Cerro Largo', 'Colonia', 'Durazno', 'Flores', 'Florida', 'Lavalleja', 'Maldonado', 'Montevideo', 'Paysandú', 'Río Negro', 'Rivera', 'Rocha', 'Salto', 'San José', 'Soriano', 'Tacuarembó', 'Treinta y Tres'];
const URUGUAY_BBOX = '-58.5,-35.1,-53.0,-30.0'; // oeste,sur,este,norte
const CENTRO_MVD = { lat: -34.87, lon: -56.17 };
const ESPERA_TECLEO = 400;

// Socio ficticio para probar el flujo completo, incluida la impresión.
const SOCIO_PRUEBA = {
  serie: 'HD', nro: '00001', socio: '123456', ci: '78910', nombre: 'SOCIO DE PRUEBA (FICTICIO)',
  domicilio: 'Aparicio Saravia 3441', telefono: '099 000 000', recibe: 'SOCIO DE PRUEBA', obs: 'Envío de prueba',
};
const PRODUCTOS_PRUEBA = [['453785', 'MICROONDAS SMART LIFE C/ GRILL 29 L | DIGITAL |']];

const $ = (sel) => document.querySelector(sel);
const campos = {
  fecha: $('#f-fecha'), serie: $('#f-serie'), nro: $('#f-nro'), socio: $('#f-socio'), ci: $('#f-ci'), nombre: $('#f-nombre'),
  domicilio: $('#f-domicilio'), localidad: $('#f-localidad'), depto: $('#f-depto'), telefono: $('#f-telefono'),
  recibe: $('#f-recibe'), obs: $('#f-obs'),
};

const estado = {
  elegida: null,       // dirección seleccionada (objeto de normalizar())
  lat: null, lon: null, // punto actual del pin
  pinMovido: false,
  destino: 'coordenadas',
  pedido: 0,
  abortar: null,
  temporizador: null,
  sucio: false,
};

/* ---------- Utilidades ---------- */
const sinTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function departamentoDe(nombre) {
  if (!nombre) return '';
  const limpio = sinTildes(nombre.replace(/^departamento de\s+/i, ''));
  return DEPARTAMENTOS.find((d) => sinTildes(d) === limpio) || '';
}

function abreviar(calle) {
  return calle
    .replace(/^bulevar\s+/i, 'Bv. ')
    .replace(/^boulevard\s+/i, 'Bv. ')
    .replace(/^avenida\s+/i, 'Av. ');
}

// Número de puerta que escribió el usuario (el último número del texto, ej. «3441» o «3441 bis»).
function numeroEscrito(texto) {
  const m = texto.match(/(?:^|\s)(\d{1,5})(\s*bis)?(?=\s|,|$)/gi);
  return m ? m[m.length - 1].trim() : '';
}

function unicos(lista) {
  const vistos = new Set();
  return lista.filter((x) => x && !vistos.has(sinTildes(x)) && vistos.add(sinTildes(x)));
}

function el(tag, props = {}, hijos = []) {
  const n = document.createElement(tag);
  Object.assign(n, props);
  for (const h of [].concat(hijos)) if (h != null) n.append(h);
  return n;
}

/* ---------- Normalización de resultados ---------- */
function normalizar(r) {
  const departamento = departamentoDe(r.departamento);
  const ciudad = r.ciudad || departamento;
  return {
    ...r,
    departamento,
    ciudad,
    calleCorta: r.calle ? abreviar(r.calle) : '',
    precision: r.numero ? 'exacta' : (r.calle ? 'calle' : 'zona'),
  };
}

function desdePhoton(f) {
  const p = f.properties || {};
  const [lon, lat] = f.geometry.coordinates;
  const esCalle = p.osm_key === 'highway';
  const calle = p.street || (esCalle ? p.name : '') || '';
  return normalizar({
    calle,
    numero: p.housenumber || '',
    lugar: p.name && p.name !== calle && !esCalle ? p.name : '',
    barrio: p.district || p.locality || '',
    ciudad: p.city || p.town || p.village || '',
    departamento: p.state || '',
    cp: p.postcode || '',
    lat, lon,
  });
}

function desdeNominatim(r) {
  const a = r.address || {};
  const calle = a.road || a.pedestrian || a.footway || a.path || '';
  return normalizar({
    calle,
    numero: a.house_number || '',
    lugar: r.name && r.name !== calle ? r.name : '',
    barrio: a.suburb || a.neighbourhood || a.quarter || a.city_district || '',
    ciudad: a.city || a.town || a.village || a.hamlet || '',
    departamento: a.state || '',
    cp: a.postcode || '',
    lat: Number(r.lat), lon: Number(r.lon),
  });
}

async function buscarPhoton(q, signal) {
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', q);
  url.searchParams.set('limit', '15');
  url.searchParams.set('bbox', URUGUAY_BBOX);
  url.searchParams.set('lat', String(CENTRO_MVD.lat));
  url.searchParams.set('lon', String(CENTRO_MVD.lon));
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error('Photon respondió ' + r.status);
  const j = await r.json();
  return (j.features || [])
    .filter((f) => String(f.properties?.countrycode || '').toUpperCase() === 'UY')
    .map(desdePhoton);
}

async function buscarNominatim(q, signal) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('countrycodes', 'uy');
  url.searchParams.set('accept-language', 'es');
  url.searchParams.set('limit', '10');
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error('Nominatim respondió ' + r.status);
  return (await r.json()).map(desdeNominatim);
}

/* ---------- Textos de una dirección ---------- */
// Número a mostrar: el verificado del mapa o, si el resultado es la calle, el que escribió el usuario.
function numeroPara(d, escrito) {
  return d.numero || (d.precision === 'calle' ? escrito : '');
}

function linea1(d, escrito) {
  if (!d.calleCorta) return d.lugar || d.barrio || d.ciudad || d.departamento;
  const num = numeroPara(d, escrito);
  const base = num ? `${d.calleCorta} ${num}` : d.calleCorta;
  return d.lugar ? `${base} (${d.lugar})` : base;
}

// «Montevideo, Uruguay» o «Las Piedras, Canelones, Uruguay».
function ciudadPais(d) {
  return unicos([d.ciudad, d.departamento, 'Uruguay']).join(', ');
}

function linea2(d) {
  return unicos([d.barrio, d.ciudad, d.departamento, 'Uruguay']).join(', ') + (d.cp ? ` · CP ${d.cp}` : '');
}

function direccionCompleta(d, escrito) {
  const l1 = d.calleCorta ? `${d.calleCorta}${numeroPara(d, escrito) ? ' ' + numeroPara(d, escrito) : ''}` : linea1(d, escrito);
  return `${l1}, ${ciudadPais(d)}`;
}

const TEXTO_PRECISION = {
  exacta: 'N° de puerta verificado',
  calle: 'Calle encontrada · N° aproximado',
  zona: 'Zona aproximada',
};

/* ---------- Búsqueda ---------- */
function ordenar(resultados, escrito) {
  const depto = campos.depto.value;
  const puntaje = (d) => {
    let p = { exacta: 1, calle: 2, zona: 4 }[d.precision];
    if (escrito && d.numero && sinTildes(d.numero) === sinTildes(escrito)) p = 0;
    else if (escrito && d.numero) p = 3;
    if (depto && d.departamento !== depto) p += 0.5;
    return p;
  };
  return resultados
    .map((d, i) => ({ d, i, p: puntaje(d) }))
    .sort((a, b) => a.p - b.p || a.i - b.i)
    .map((x) => x.d);
}

function quitarRepetidos(resultados, escrito) {
  const vistos = new Set();
  return resultados.filter((d) => {
    const clave = sinTildes([linea1(d, escrito), d.barrio, d.ciudad, d.departamento].join('|'));
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

async function buscar(completa) {
  const q = campos.domicilio.value.trim();
  clearTimeout(estado.temporizador);
  if (q.length < 3 || !/[a-záéíóúñ]/i.test(q)) {
    if (completa) mostrarEstado('Escribí al menos el nombre de la calle.', true);
    return;
  }
  estado.abortar?.abort();
  const ctrl = new AbortController();
  estado.abortar = ctrl;
  const id = ++estado.pedido;

  $('#resultados').hidden = false;
  $('#resultados-titulo').textContent = `Resultados para «${q}»`;
  $('#btn-mas').hidden = completa;
  mostrarEstado(completa ? 'Buscando en todos los mapas…' : 'Buscando…');

  const fuentes = [buscarPhoton(q, ctrl.signal)];
  if (completa) fuentes.push(buscarNominatim(q, ctrl.signal));
  const respuestas = await Promise.allSettled(fuentes);
  if (id !== estado.pedido) return; // llegó una búsqueda más nueva

  const escrito = numeroEscrito(q);
  const todos = respuestas.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  const fallaron = respuestas.filter((r) => r.status === 'rejected' && r.reason?.name !== 'AbortError');
  const lista = quitarRepetidos(ordenar(todos, escrito), escrito).slice(0, 12);

  pintarResultados(lista, escrito);
  if (!lista.length && fallaron.length === respuestas.length) {
    mostrarEstado('No se pudo consultar el servicio de mapas. Revisá la conexión e intentá de nuevo.', true);
  } else if (!lista.length) {
    mostrarEstado(completa
      ? 'Sin resultados. Revisá el nombre de la calle o agregá la ciudad (ej.: «Rivera 1234 Maldonado»).'
      : 'Sin resultados todavía. Probá «Buscar más resultados» o agregá la ciudad.');
  } else {
    mostrarEstado(escrito ? 'Elegí la dirección correcta:' : 'Elegí la dirección correcta (si sabés el número de puerta, agregalo):');
  }
}

function mostrarEstado(texto, error = false) {
  const p = $('#resultados-estado');
  p.textContent = texto;
  p.classList.toggle('error', error);
  if (texto) $('#resultados').hidden = false;
}

function pintarResultados(lista, escrito) {
  const ul = $('#resultados-lista');
  ul.replaceChildren();
  for (const d of lista) {
    const btn = el('button', { type: 'button', className: 'opcion' }, [
      el('span', { className: 'pin', textContent: '📍', ariaHidden: 'true' }),
      el('span', { className: 'l1', textContent: linea1(d, escrito) }),
      el('span', { className: `insignia ${d.precision}`, textContent: TEXTO_PRECISION[d.precision] }),
      el('span', { className: 'l2', textContent: linea2(d) }),
    ]);
    btn.addEventListener('click', () => seleccionar(d, escrito));
    ul.append(el('li', {}, btn));
  }
}

/* ---------- Selección ---------- */
function seleccionar(d, escrito) {
  estado.elegida = { ...d, numeroFinal: numeroPara(d, escrito) };
  estado.lat = d.lat;
  estado.lon = d.lon;
  estado.pinMovido = false;
  estado.destino = d.precision === 'exacta' ? 'coordenadas' : 'direccion';

  const e = estado.elegida;
  campos.domicilio.value = (e.calleCorta ? `${e.calleCorta}${e.numeroFinal ? ' ' + e.numeroFinal : ''}` : linea1(e, escrito)).toUpperCase();
  campos.localidad.value = (e.barrio || e.ciudad).toUpperCase();
  if (e.departamento) campos.depto.value = e.departamento;

  $('#resultados').hidden = true;
  mostrarUbicacion();
}

function invalidarSeleccion() {
  if (!estado.elegida) return;
  estado.elegida = null;
  $('#ubicacion').hidden = true;
}

/* ---------- Ubicación, mapa y QR ---------- */
let mapa = null;
let marcador = null;

function mostrarUbicacion() {
  const e = estado.elegida;
  $('#ubicacion').hidden = false;
  $('#u-linea1').textContent = direccionCompleta(e, e.numeroFinal);
  $('#u-linea2').textContent = linea2(e);
  pintarInsignias();

  if (!mapa) {
    mapa = L.map('mapa', { scrollWheelZoom: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapa);
    marcador = L.marker([e.lat, e.lon], { draggable: true, autoPan: true }).addTo(mapa);
    marcador.on('dragend', () => moverPin(marcador.getLatLng()));
    mapa.on('click', (ev) => moverPin(ev.latlng));
  }
  marcador.setLatLng([e.lat, e.lon]);
  mapa.setView([e.lat, e.lon], e.precision === 'zona' ? 15 : 18);
  requestAnimationFrame(() => mapa.invalidateSize());

  actualizarQR();
  $('#ubicacion').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function moverPin(latlng) {
  estado.lat = latlng.lat;
  estado.lon = latlng.lng;
  estado.pinMovido = true;
  estado.destino = 'coordenadas';
  marcador.setLatLng(latlng);
  pintarInsignias();
  actualizarQR();
}

function pintarInsignias() {
  const e = estado.elegida;
  const caja = $('#u-insignias');
  caja.replaceChildren(el('span', { className: `insignia ${e.precision}`, textContent: TEXTO_PRECISION[e.precision] }));
  if (estado.pinMovido) caja.append(el('span', { className: 'insignia movido', textContent: 'Pin ajustado a mano' }));
  caja.append(el('span', { className: 'insignia zona', textContent: `${estado.lat.toFixed(6)}, ${estado.lon.toFixed(6)}` }));
}

function urlGoogleMaps() {
  const e = estado.elegida;
  const query = estado.destino === 'coordenadas'
    ? `${estado.lat.toFixed(6)},${estado.lon.toFixed(6)}`
    : direccionCompleta(e, e.numeroFinal);
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query);
}

function dibujarQR(canvas, texto, modulo) {
  const qr = qrcode(0, 'M');
  qr.addData(texto);
  qr.make();
  const n = qr.getModuleCount();
  const margen = 4;
  const lado = (n + margen * 2) * modulo;
  canvas.width = lado;
  canvas.height = lado;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, lado, lado);
  ctx.fillStyle = '#000';
  for (let f = 0; f < n; f++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(f, c)) ctx.fillRect((c + margen) * modulo, (f + margen) * modulo, modulo, modulo);
    }
  }
  return canvas;
}

function actualizarQR() {
  const url = urlGoogleMaps();
  dibujarQR($('#qr'), url, 6);
  $('#u-enlace').href = url;
  $('#u-url').textContent = url;
  for (const r of document.querySelectorAll('input[name="destino"]')) r.checked = r.value === estado.destino;
}

function descargarQR() {
  if (!estado.elegida) return;
  const canvas = dibujarQR(document.createElement('canvas'), urlGoogleMaps(), 12);
  const nombre = ['qr-envio', campos.serie.value, campos.nro.value || campos.socio.value].filter(Boolean).join('-');
  const a = el('a', { href: canvas.toDataURL('image/png'), download: `${nombre}.png` });
  document.body.append(a);
  a.click();
  a.remove();
}

/* ---------- Productos ---------- */
function filaProducto(codigo = '', descripcion = '') {
  const tr = el('tr', {}, [
    el('td', { className: 'col-cod' }, el('input', { className: 'plano der', ariaLabel: 'Código de producto', value: codigo })),
    el('td', {}, el('input', { className: 'plano', ariaLabel: 'Descripción', value: descripcion })),
    el('td', { className: 'col-quitar' }, el('button', { type: 'button', className: 'quitar', ariaLabel: 'Quitar producto', textContent: '×' })),
  ]);
  return tr;
}

function productos() {
  return [...document.querySelectorAll('#productos tr')]
    .map((tr) => [...tr.querySelectorAll('input')].map((i) => i.value.trim()))
    .filter(([cod, desc]) => cod || desc);
}

/* ---------- Confirmar, etiqueta y salir ---------- */
function aviso(texto, tipo, acciones = []) {
  const caja = $('#aviso');
  caja.className = 'aviso' + (tipo === 'error' ? ' error' : '');
  caja.replaceChildren(el('div', { textContent: texto }));
  if (acciones.length) caja.append(el('div', { className: 'acciones' }, acciones));
  caja.hidden = false;
  caja.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function confirmar(accion) {
  const faltan = [];
  if (!campos.domicilio.value.trim()) faltan.push('domicilio');
  if (!campos.depto.value) faltan.push('departamento');
  if (faltan.length) {
    aviso(`Falta completar: ${faltan.join(' y ')}.`, 'error');
    (faltan[0] === 'domicilio' ? campos.domicilio : campos.depto).focus();
    return;
  }
  if (!estado.elegida && !window.confirm('La dirección no fue verificada en el mapa, así que el envío no tendrá QR.\n¿Confirmar igual?')) {
    campos.domicilio.focus();
    return;
  }
  const texto = accion === 'actualiza'
    ? 'Envío confirmado. El domicilio de la Ficha del Socio se actualiza si era diferente.'
    : 'Envío confirmado. La Ficha del Socio NO se modifica (este envío no va a su dirección).';
  estado.sucio = false;
  const boton = (rotulo, accion) => {
    const b = el('button', { type: 'button', className: 'btn btn-claro', textContent: rotulo });
    b.addEventListener('click', accion);
    return b;
  };
  aviso(texto, 'ok', [
    boton('Imprimir en impresora de facturas (ticket 80 mm)', () => imprimir('ticket')),
    boton('Imprimir etiqueta A4', () => imprimir('a4')),
    boton('Nuevo envío', reiniciar),
  ]);
}

// Aclaración obligatoria en todo lo que se imprime: este panel no emite comprobantes fiscales.
function avisoNoFiscal() {
  return el('div', { className: 'no-fiscal' }, [
    el('div', { className: 'grande', textContent: 'NO ES UNA FACTURA FISCAL' }),
    el('div', { textContent: 'Documento de PRUEBA, ficticio y sin validez legal ni tributaria.' }),
  ]);
}

function datosImpresion() {
  const e = estado.elegida;
  return {
    e,
    fecha: campos.fecha.value ? campos.fecha.value.split('-').reverse().join('/') : '',
    factura: unicos([campos.serie.value && `Serie ${campos.serie.value}`, campos.nro.value && `Nro. ${campos.nro.value}`]).join(' '),
    socio: unicos([campos.socio.value && `Socio ${campos.socio.value}`, campos.ci.value && `C.I. ${campos.ci.value}`]).join(' · '),
    zona: unicos([campos.localidad.value, campos.depto.value]).join(' - '),
    qr: e ? dibujarQR(document.createElement('canvas'), urlGoogleMaps(), 10).toDataURL('image/png') : '',
    prods: productos(),
  };
}

function etiquetaA4(d) {
  const dato = (etiqueta, valor) => (valor ? el('p', { className: 'et-dato' }, [el('strong', { textContent: etiqueta + ': ' }), valor]) : null);
  const datos = el('div', {}, [
    el('p', { className: 'et-dir', textContent: campos.domicilio.value }),
    el('p', { className: 'et-dato', textContent: unicos([campos.localidad.value, campos.depto.value, 'Uruguay']).join(' · ') }),
    dato('Destinatario', campos.nombre.value),
    d.socio ? el('p', { className: 'et-dato', textContent: d.socio }) : null,
    dato('Recibe', campos.recibe.value),
    dato('Teléfono', campos.telefono.value),
    dato('Observaciones', campos.obs.value),
    d.e ? dato('Ubicación', `${direccionCompleta(d.e, d.e.numeroFinal)} (${estado.lat.toFixed(6)}, ${estado.lon.toFixed(6)})`) : null,
  ]);
  const qr = d.e
    ? el('div', { className: 'et-qr' }, [el('img', { src: d.qr, alt: 'QR a Google Maps' }), el('div', { textContent: 'Escaneá para abrir en Google Maps' })])
    : el('div');
  return el('div', { className: 'et-caja' }, [
    avisoNoFiscal(),
    el('div', { className: 'et-cabecera' }, [
      el('strong', { textContent: 'ENVÍO' }),
      el('span', { textContent: unicos([d.fecha, d.factura]).join(' · ') }),
    ]),
    el('div', { className: 'et-cuerpo' }, [datos, qr]),
    d.prods.length ? el('div', { className: 'et-productos' }, d.prods.map(([cod, desc]) => el('div', { textContent: `${cod}  ${desc}` }))) : null,
    el('p', { className: 'et-dato', textContent: 'Documento de prueba: no es una factura fiscal.' }),
  ]);
}

function ticket80(d) {
  const p = (texto, clase = '') => (texto ? el('p', { className: clase, textContent: texto }) : null);
  const sep = () => el('div', { className: 'sep' });
  return el('div', { className: 'tk' }, [
    p('COPOL · ENVÍO', 'centro titulo-tk'),
    avisoNoFiscal(),
    sep(),
    p(unicos([d.fecha, d.factura]).join('  ')),
    p(d.socio),
    p(campos.nombre.value),
    sep(),
    p('ENVIAR A:'),
    p(campos.domicilio.value, 'dir'),
    p(d.zona),
    campos.telefono.value ? p(`Tel.: ${campos.telefono.value}`) : null,
    campos.recibe.value ? p(`Recibe: ${campos.recibe.value}`) : null,
    campos.obs.value ? p(`Obs.: ${campos.obs.value}`) : null,
    d.prods.length ? sep() : null,
    ...d.prods.map(([cod, desc]) => p(`${cod} ${desc}`, 'chico')),
    d.e ? sep() : null,
    d.e ? el('img', { className: 'qr', src: d.qr, alt: 'QR a Google Maps' }) : null,
    d.e ? p('Escaneá para abrir en Google Maps', 'centro chico') : null,
    sep(),
    p('*** NO ES UNA FACTURA FISCAL ***', 'centro'),
    p('Comprobante ficticio de prueba', 'centro chico'),
  ]);
}

function imprimir(formato) {
  const d = datosImpresion();
  let pagina = $('#estilo-pagina');
  if (!pagina) {
    pagina = el('style', { id: 'estilo-pagina' });
    document.head.append(pagina);
  }
  // Ticket: el ancho del papel lo da la impresora de facturas (rollo de 80 mm); solo se quitan márgenes.
  pagina.textContent = formato === 'ticket' ? '@page { margin: 2mm; }' : '@page { size: A4; margin: 10mm; }';
  $('#etiqueta').replaceChildren(formato === 'ticket' ? ticket80(d) : etiquetaA4(d));
  // Esperar a que el QR (imagen) esté listo antes de abrir el diálogo de impresión.
  const img = $('#etiqueta img');
  if (img && !img.complete) img.addEventListener('load', () => window.print(), { once: true });
  else window.print();
}

function cargarPrueba() {
  reiniciar();
  for (const [k, v] of Object.entries(SOCIO_PRUEBA)) campos[k].value = v;
  $('#productos').replaceChildren(...PRODUCTOS_PRUEBA.map(([cod, desc]) => filaProducto(cod, desc)));
  estado.sucio = false;
  buscar(true);
}

function reiniciar() {
  $('#form-envio').reset();
  campos.fecha.valueAsDate = new Date();
  $('#productos').replaceChildren(filaProducto());
  estado.abortar?.abort();
  estado.pedido++;
  invalidarSeleccion();
  $('#resultados').hidden = true;
  $('#aviso').hidden = true;
  estado.sucio = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function salir() {
  if (estado.sucio && !window.confirm('¿Salir sin confirmar ni actualizar? Se borran los datos cargados.')) return;
  reiniciar();
  campos.domicilio.focus();
}

/* ---------- Inicio ---------- */
for (const d of DEPARTAMENTOS) campos.depto.append(el('option', { value: d, textContent: d }));
campos.fecha.valueAsDate = new Date();

campos.domicilio.addEventListener('input', () => {
  invalidarSeleccion();
  clearTimeout(estado.temporizador);
  estado.temporizador = setTimeout(() => buscar(false), ESPERA_TECLEO);
});
campos.domicilio.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') { ev.preventDefault(); buscar(true); }
  if (ev.key === 'ArrowDown') {
    const primera = $('#resultados-lista .opcion');
    if (primera && !$('#resultados').hidden) { ev.preventDefault(); primera.focus(); }
  }
  if (ev.key === 'Escape') $('#resultados').hidden = true;
});
$('#resultados-lista').addEventListener('keydown', (ev) => {
  const btn = ev.target.closest('.opcion');
  if (!btn) return;
  const li = btn.parentElement;
  if (ev.key === 'ArrowDown') { ev.preventDefault(); li.nextElementSibling?.querySelector('.opcion').focus(); }
  if (ev.key === 'ArrowUp') { ev.preventDefault(); (li.previousElementSibling?.querySelector('.opcion') || campos.domicilio).focus(); }
  if (ev.key === 'Escape') { $('#resultados').hidden = true; campos.domicilio.focus(); }
});
$('#btn-buscar').addEventListener('click', () => buscar(true));
$('#btn-mas').addEventListener('click', () => buscar(true));

for (const r of document.querySelectorAll('input[name="destino"]')) {
  r.addEventListener('change', () => { estado.destino = r.value; actualizarQR(); });
}
$('#btn-descargar').addEventListener('click', descargarQR);

$('#btn-agregar').addEventListener('click', () => {
  const tr = filaProducto();
  $('#productos').append(tr);
  tr.querySelector('input').focus();
});
$('#productos').addEventListener('click', (ev) => {
  if (ev.target.closest('.quitar')) ev.target.closest('tr').remove();
});

$('#form-envio').addEventListener('input', () => { estado.sucio = true; });
$('#form-envio').addEventListener('submit', (ev) => ev.preventDefault());
for (const b of document.querySelectorAll('[data-accion]')) b.addEventListener('click', () => confirmar(b.dataset.accion));
$('#btn-salir').addEventListener('click', salir);
$('#btn-prueba').addEventListener('click', cargarPrueba);

cargarPrueba();
