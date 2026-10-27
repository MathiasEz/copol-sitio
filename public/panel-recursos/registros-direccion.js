/*!
 * Buscador de direcciones de Uruguay (Photon y Nominatim, datos de OpenStreetMap) y enlace a Google Maps.
 * Copiado del módulo del panel de envíos (envios-direccion.js, sin la parte de QR ni de campos): misma
 * búsqueda, mismas reglas de número de puerta y mismo enlace. Servicios gratuitos, sin clave.
 *   BuscadorDireccion.buscar(texto, { completa, signal }) → { resultados, partes, fallaron, error? }
 *   BuscadorDireccion.validar(dir) → motivo si la dirección no sirve, o ''
 *   BuscadorDireccion.urlGoogleMaps(dir) → enlace (coordenadas si el N° de puerta está verificado)
 */
(function (global) {
'use strict';

  var CONFIG = {
    photon: 'https://photon.komoot.io/api/',
    nominatim: 'https://nominatim.openstreetmap.org/search',
    bbox: '-58.5,-35.1,-53.0,-30.0', // Uruguay: oeste,sur,este,norte
    centro: { lat: -34.87, lon: -56.17 }, // prioriza resultados cercanos a Montevideo
    esperaTecleo: 400, // ms sin teclear antes de buscar
    maxResultados: 12,
    numeroMaximo: 20000, // en Uruguay los números de puerta no llegan a esto: más alto es un error de tipeo
  };

  var DEPARTAMENTOS = ['Artigas', 'Canelones', 'Cerro Largo', 'Colonia', 'Durazno', 'Flores', 'Florida', 'Lavalleja', 'Maldonado', 'Montevideo', 'Paysandú', 'Río Negro', 'Rivera', 'Rocha', 'Salto', 'San José', 'Soriano', 'Tacuarembó', 'Treinta y Tres'];

  var TEXTO_PRECISION = {
    exacta: 'N° de puerta verificado',
    calle: 'Calle encontrada · N° aproximado',
    zona: 'Zona aproximada',
  };

  /* ---------- Utilidades ---------- */
  function sinTildes(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  function soloDigitos(n) {
    return String(n || '').replace(/\D/g, '');
  }

  function unicos(lista) {
    var vistos = {};
    return lista.filter(function (x) {
      if (!x) return false;
      var k = sinTildes(x);
      if (vistos[k]) return false;
      vistos[k] = true;
      return true;
    });
  }

  function departamentoDe(nombre) {
    if (!nombre) return '';
    var limpio = sinTildes(String(nombre).replace(/^departamento de\s+/i, ''));
    for (var i = 0; i < DEPARTAMENTOS.length; i++) if (sinTildes(DEPARTAMENTOS[i]) === limpio) return DEPARTAMENTOS[i];
    return '';
  }

  function abreviar(calle) {
    return calle
      .replace(/^bulevar\s+/i, 'Bv. ')
      .replace(/^boulevard\s+/i, 'Bv. ')
      .replace(/^avenida\s+/i, 'Av. ');
  }

  /* ---------- Lo que escribió el usuario ---------- */
  var RE_UNIDAD = /\b(?:apto?|apt|ap|dpto|depto|piso|block|bl|torre|esc|local|of|oficina|unidad|casa)\.?\s*[\w-]*/gi;

  /* Separa lo escrito en calle, número de puerta y el resto:
   *   'Cañas 229bis apto 2'          → { calle: 'Cañas', numero: '229 bis', extra: 'apto 2', zona: '' }
   *   '18 de Julio 1234 Las Piedras' → { calle: '18 de Julio', numero: '1234', extra: 'Las Piedras', zona: 'Las Piedras' }
   *   'Av. 8 de Octubre 2500'        → { calle: 'Av. 8 de Octubre', numero: '2500', … }
   * Se toma el primer número que va después del nombre de la calle y que no es parte del nombre
   * («8 de Octubre») ni de la unidad («apto 2», «piso 3»). */
  function partirDireccion(texto) {
    var t = String(texto || '').trim().replace(/\s+/g, ' ');
    var re = /(?:^|[\s,])(?:n[°º.]?\s*)?(\d+)\s*(bis|ter)?(?=[\s,]|$)/gi;
    var m;
    while ((m = re.exec(t)) !== null) {
      var antes = t.slice(0, m.index);
      var despues = t.slice(m.index + m[0].length);
      if (!/[a-záéíóúñü]/i.test(antes)) continue;
      if (/^\s*de\b/i.test(despues)) continue;
      if (/\b(?:apto?|apt|ap|dpto|depto|piso|block|bl|torre|esc|local|of|oficina|unidad|casa|km)\.?\s*$/i.test(antes)) continue;
      var extra = despues.replace(/^[\s,]+/, '').trim();
      return {
        calle: antes.replace(/[\s,]+$/, '').trim(),
        numero: m[1] + (m[2] ? ' ' + m[2].toLowerCase() : ''),
        extra: extra,
        zona: extra.replace(RE_UNIDAD, '').replace(/^[\s,]+|[\s,]+$/g, '').trim(),
      };
    }
    return { calle: t, numero: '', extra: '', zona: '' };
  }

  var RE_SIN_NUMERO = /(?:^|\s)s\s*\/\s*n(?=\s|,|$)/i; // «S/N»: casa sin número de puerta

  // Motivo si el número de puerta es imposible («344444441», «0»), o '' si es posible.
  function problemaNumero(numero) {
    if (!numero) return '';
    var n = Number(soloDigitos(numero));
    if (n === 0) return 'El número de puerta no puede ser 0. Revisá el número.';
    if (n > CONFIG.numeroMaximo) {
      return 'El número de puerta ' + soloDigitos(numero) + ' no existe (en Uruguay no pasan de ' +
        CONFIG.numeroMaximo.toLocaleString('es-UY') + '). Revisá el número.';
    }
    return '';
  }

  // Motivo por el que una dirección elegida no sirve para un envío, o '' si está bien.
  function validar(dir) {
    if (!dir) return 'Elegí la dirección de la lista de resultados. Si no aparece, está mal escrita o no existe.';
    if (dir.precision === 'zona') return 'Elegiste solo una zona (barrio o ciudad). Elegí la calle con el número de puerta.';
    var problema = problemaNumero(dir.numero);
    if (problema) return problema;
    if (!dir.numero && !dir.sinNumero) {
      return 'Falta el número de puerta. Agregalo al domicilio (o escribí S/N si la casa no tiene) y elegí la dirección de nuevo.';
    }
    return '';
  }

  /* ---------- Resultados de los servicios ---------- */
  function base(r) {
    r.departamento = departamentoDe(r.departamento);
    r.ciudad = r.ciudad || r.departamento;
    return r;
  }

  function desdePhoton(f) {
    var p = f.properties || {};
    var esCalle = p.osm_key === 'highway';
    var calle = p.street || (esCalle ? p.name : '') || '';
    return base({
      calle: calle,
      numeroMapa: p.housenumber || '',
      lugar: p.name && p.name !== calle && !esCalle ? p.name : '',
      barrio: p.district || p.locality || '',
      ciudad: p.city || p.town || p.village || '',
      departamento: p.state || '',
      cp: p.postcode || '',
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
    });
  }

  function desdeNominatim(r) {
    var a = r.address || {};
    var calle = a.road || a.pedestrian || a.footway || a.path || '';
    return base({
      calle: calle,
      numeroMapa: a.house_number || '',
      lugar: r.name && r.name !== calle ? r.name : '',
      barrio: a.suburb || a.neighbourhood || a.quarter || a.city_district || '',
      ciudad: a.city || a.town || a.village || a.hamlet || '',
      departamento: a.state || '',
      cp: a.postcode || '',
      lat: Number(r.lat),
      lon: Number(r.lon),
    });
  }

  function pedirJSON(url, signal) {
    return fetch(url.toString(), { signal: signal }).then(function (r) {
      if (!r.ok) throw new Error(url.hostname + ' respondió ' + r.status);
      return r.json();
    });
  }

  function buscarPhoton(q, signal) {
    var url = new URL(CONFIG.photon);
    url.searchParams.set('q', q);
    url.searchParams.set('limit', '15');
    url.searchParams.set('bbox', CONFIG.bbox);
    url.searchParams.set('lat', String(CONFIG.centro.lat));
    url.searchParams.set('lon', String(CONFIG.centro.lon));
    return pedirJSON(url, signal).then(function (j) {
      return (j.features || [])
        .filter(function (f) { return String((f.properties || {}).countrycode || '').toUpperCase() === 'UY'; })
        .map(desdePhoton);
    });
  }

  function buscarNominatim(q, signal) {
    var url = new URL(CONFIG.nominatim);
    url.searchParams.set('q', q);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('countrycodes', 'uy');
    url.searchParams.set('accept-language', 'es');
    url.searchParams.set('limit', '10');
    return pedirJSON(url, signal).then(function (lista) { return lista.map(desdeNominatim); });
  }

  /* ---------- Armado del OBJETO DIRECCIÓN ---------- */
  // Número a usar: el del mapa; si el mapa solo tiene la calle, el que escribió el usuario.
  // «229 bis» escrito y el mapa tiene el 229: es la misma puerta, se conserva el «bis».
  function numeroPara(r, escrito) {
    if (r.numeroMapa && escrito && soloDigitos(r.numeroMapa) === soloDigitos(escrito) && escrito.length > r.numeroMapa.length) return escrito;
    if (r.numeroMapa) return r.numeroMapa;
    return r.calle ? escrito : '';
  }

  function completar(r, partes) {
    var precision = r.numeroMapa ? 'exacta' : (r.calle ? 'calle' : 'zona');
    var calleCorta = r.calle ? abreviar(r.calle) : '';
    var numero = numeroPara(r, partes.numero);
    var sinNumero = !numero && !!partes.sinNumero;
    var unidad = (partes.extra.match(RE_UNIDAD) || []).concat(sinNumero ? ['S/N'] : []).join(' ');
    var principal = calleCorta ? (numero ? calleCorta + ' ' + numero : calleCorta) : (r.lugar || r.barrio || r.ciudad || r.departamento);
    var d = {
      calle: r.calle,
      calleCorta: calleCorta,
      numero: numero,
      unidad: unidad,
      sinNumero: sinNumero,
      lugar: r.lugar,
      barrio: r.barrio,
      ciudad: r.ciudad,
      departamento: r.departamento,
      cp: r.cp,
      lat: r.lat,
      lon: r.lon,
      precision: precision,
      precisionTexto: TEXTO_PRECISION[precision],
      texto: principal + ', ' + unicos([r.ciudad, r.departamento, 'Uruguay']).join(', '),
      detalle: unicos([r.barrio, r.ciudad, r.departamento, 'Uruguay']).join(', ') + (r.cp ? ' · CP ' + r.cp : ''),
      titulo: r.lugar && calleCorta ? principal + ' (' + r.lugar + ')' : principal,
      domicilio: unicos([principal, unidad]).join(' ').toUpperCase(),
      localidad: (r.barrio || r.ciudad || '').toUpperCase(),
    };
    d.urlGoogleMaps = urlGoogleMaps(d);
    return d;
  }

  function ordenar(lista, partes, departamento) {
    var escrito = partes.numero;
    return lista
      .map(function (d, i) {
        var p = { exacta: 1, calle: 2, zona: 4 }[d.precision];
        if (escrito && d.precision === 'exacta') p = soloDigitos(d.numero) === soloDigitos(escrito) ? 0 : 3;
        if (departamento && d.departamento !== departamentoDe(departamento)) p += 0.5;
        return { d: d, i: i, p: p };
      })
      .sort(function (a, b) { return a.p - b.p || a.i - b.i; })
      .map(function (x) { return x.d; });
  }

  function quitarRepetidos(lista) {
    var vistos = {};
    return lista.filter(function (d) {
      var k = sinTildes([d.titulo, d.barrio, d.ciudad, d.departamento].join('|'));
      if (vistos[k]) return false;
      vistos[k] = true;
      return true;
    });
  }

  /* Busca la dirección escrita. opciones:
   *   completa     true = también consulta Nominatim (usar al apretar Enter / botón Buscar)
   *   departamento si ya se sabe, los resultados de ese departamento van primero
   *   signal       AbortSignal para cancelar (al seguir escribiendo)
   * Además del texto completo se busca la calle sola: si el mapa no tiene ese número de puerta
   * (o es un «bis»), la búsqueda completa no encuentra nada, pero la calle sí. */
  function buscar(texto, opciones) {
    opciones = opciones || {};
    var sinNumero = RE_SIN_NUMERO.test(texto || '');
    var partes = partirDireccion(String(texto || '').replace(RE_SIN_NUMERO, ' '));
    partes.sinNumero = sinNumero && !partes.numero;
    if (partes.calle.length < 3 || !/[a-záéíóúñü]/i.test(partes.calle)) {
      return Promise.resolve({ partes: partes, resultados: [], fallaron: 0, consultas: 0 });
    }
    var problema = problemaNumero(partes.numero);
    if (problema) {
      // Número imposible: no se consulta nada ni se ofrece nada para elegir.
      return Promise.resolve({ partes: partes, resultados: [], fallaron: 0, consultas: 0,
        error: { codigo: 'numero-imposible', mensaje: problema } });
    }
    var calleSola = [partes.calle, partes.zona].filter(Boolean).join(' ');
    var textoLimpio = [partes.calle, soloDigitos(partes.numero), partes.zona].filter(Boolean).join(' ');
    var fuentes = [buscarPhoton(textoLimpio, opciones.signal)];
    if (partes.numero && calleSola.length >= 3) fuentes.push(buscarPhoton(calleSola, opciones.signal));
    if (opciones.completa) fuentes.push(buscarNominatim(textoLimpio, opciones.signal));

    return Promise.all(fuentes.map(function (p) {
      return p.then(function (v) { return { ok: true, v: v }; }, function (e) { return { ok: false, e: e }; });
    })).then(function (resp) {
      if (opciones.signal && opciones.signal.aborted) {
        var abortado = new Error('Búsqueda cancelada');
        abortado.name = 'AbortError';
        throw abortado;
      }
      var crudos = [];
      var fallaron = 0;
      resp.forEach(function (x) { if (x.ok) crudos = crudos.concat(x.v); else fallaron++; });
      var lista = crudos.map(function (r) { return completar(r, partes); });
      lista = quitarRepetidos(ordenar(lista, partes, opciones.departamento)).slice(0, CONFIG.maxResultados);
      return { partes: partes, resultados: lista, fallaron: fallaron, consultas: fuentes.length };
    });
  }

  /* ---------- Google Maps ---------- */
  /* destino: 'auto' (por defecto) | 'coordenadas' | 'direccion'
   *   auto → coordenadas si el número de puerta está verificado; si no, la dirección escrita. */
  function urlGoogleMaps(dir, destino) {
    var query;
    if (typeof dir === 'string') {
      query = dir;
    } else {
      destino = destino || 'auto';
      var usarCoordenadas = destino === 'coordenadas' || (destino === 'auto' && (dir.precision === 'exacta' || !dir.texto));
      query = usarCoordenadas && isFinite(dir.lat) && isFinite(dir.lon)
        ? Number(dir.lat).toFixed(6) + ',' + Number(dir.lon).toFixed(6)
        : dir.texto;
    }
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query);
  }

global.BuscadorDireccion = { CONFIG: CONFIG, buscar: buscar, validar: validar, partirDireccion: partirDireccion, problemaNumero: problemaNumero, urlGoogleMaps: urlGoogleMaps };
})(window);
