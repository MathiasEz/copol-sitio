// Asistente del formulario, como un chat: la persona escribe (o dicta) los datos como le llegaron y la IA
// completa o corrige el formulario y responde qué hizo. Ve la conversación y cómo está el formulario, así
// que entiende correcciones («el código es 4521», «no, la cédula termina en 3»). No guarda nada: la persona
// revisa el formulario y lo guarda ella; cada respuesta que cambió campos se puede deshacer en la pantalla.
// Usa Vercel AI Gateway (API compatible con Anthropic Messages) igual que el asistente del panel de stock:
// en Vercel se autentica con el token OIDC del despliegue, sin claves. El modelo se cambia con IA_MODELO;
// por defecto Gemini 2.5 Flash, porque el crédito gratuito de AI Gateway no habilita los modelos de Claude.
import { CAMPOS, formatoCedula, limpiarTexto, siNo } from './campos.js';

const GATEWAY = 'https://ai-gateway.vercel.sh/v1/messages';
export const MAX_TEXTO = 4000;
const MAX_HISTORIAL = 12;
const modelo = () => process.env.IA_MODELO || 'google/gemini-2.5-flash';

export const tokenGateway = (cabeceraOidc) => process.env.AI_GATEWAY_API_KEY || cabeceraOidc || process.env.VERCEL_OIDC_TOKEN || null;

export class ErrorAsistente extends Error {
  constructor(mensaje, status = 502) {
    super(mensaje);
    this.status = status;
  }
}

const INSTRUCCIONES = `Sos el asistente del panel de registros de COPOL (Cooperativa Policial, Uruguay). Ayudás a un
empleado a completar un formulario con los datos de un socio y del producto que compra. El empleado te escribe
o te dicta los datos como le llegaron, o te pide correcciones. Siempre respondés llamando a la herramienta
completar_formulario. Reglas:
- En los campos ponés SOLO lo que hay que completar o cambiar según el último mensaje; los que no cambian van
  vacíos. No inventes nada que el empleado no haya dicho.
- nombre: nombre y apellido del socio, con mayúscula inicial en cada palabra.
- socio: número de socio, solo dígitos. No lo confundas con la cédula (C.I., cédula, documento) ni con el teléfono.
- cedula: cédula de identidad uruguaya tal como la dijeron (con o sin puntos y guion). Si la dictan en palabras,
  pasala a números.
- direccion: calle, número, apartamento y localidad o departamento si aparecen.
- service: solo si pide o menciona un service (servicio técnico, reparación, garantía, instalación, visita
  técnica); resumilo en pocas palabras.
- flete: "Sí" si pide flete, envío o entrega a domicilio (que se lo lleven, mandárselo a la casa); "No" si dice
  que lo retira, se lo lleva él o pasa a buscarlo. Si no dice nada, vacío.
- producto: descripción del producto (marca, modelo, color, capacidad).
- codigo: código interno del producto (código, cód., art., artículo, SKU). No uses el número de socio ni la cédula.
- Si el mensaje trae fotos o documentos (una factura, un comprobante, una etiqueta, una cédula, una captura de
  WhatsApp, un PDF), leé lo que tienen impreso o escrito y completá los campos con eso. Si algo no se lee bien o
  no estás seguro, dejalo vacío y decilo en la respuesta: nunca adivines números (cédula, socio, código).
- adicional: información útil que no entra en los otros campos (teléfono, horario o día de entrega, indicaciones para
  llegar, observaciones). No repitas acá lo que ya está en otro campo. Si no hay nada así, vacío.
- respuesta: una o dos frases cortas en español rioplatense, de vos, para el empleado: qué completaste o
  cambiaste y qué falta para poder guardar. Si trae varios socios o productos, completá solo el primero y
  avisalo. Si el mensaje no tiene datos (un saludo, una pregunta), respondé breve y no cambies campos.
  No repitas todos los datos: el empleado los ve en el formulario.`;

const HERRAMIENTA = {
  name: 'completar_formulario',
  description: 'Completa o corrige campos del formulario y responde al empleado.',
  input_schema: {
    type: 'object',
    properties: {
      respuesta: { type: 'string', description: 'Lo que le decís al empleado.' },
      nombre: { type: 'string' },
      socio: { type: 'string' },
      cedula: { type: 'string' },
      direccion: { type: 'string' },
      service: { type: 'string' },
      flete: { type: 'string', description: '"Sí", "No" o vacío si no cambia.' },
      producto: { type: 'string' },
      codigo: { type: 'string' },
      adicional: { type: 'string' },
    },
    required: ['respuesta'],
  },
};

// ── Archivos adjuntos (fotos y PDF): se validan por su contenido real y solo se mandan a la IA, no se guardan ──
export const MAX_ADJUNTOS = 3;
export const MAX_BASE64_TOTAL = 4_000_000; // el cuerpo de una función de Vercel admite 4,5 MB
const TIPOS = [
  { tipo: 'imagen', media: 'image/jpeg', firma: [0xff, 0xd8, 0xff] },
  { tipo: 'imagen', media: 'image/png', firma: [0x89, 0x50, 0x4e, 0x47] },
  { tipo: 'pdf', media: 'application/pdf', firma: [0x25, 0x50, 0x44, 0x46] }, // %PDF
];

/** Adjuntos válidos con su tipo real, o { error }. */
export function limpiarAdjuntos(entrada) {
  if (entrada === undefined || entrada === null || (Array.isArray(entrada) && !entrada.length)) return { adjuntos: [] };
  if (!Array.isArray(entrada) || entrada.length > MAX_ADJUNTOS) return { error: `Se pueden adjuntar hasta ${MAX_ADJUNTOS} archivos por mensaje.` };
  let total = 0;
  const adjuntos = [];
  for (const a of entrada) {
    const datos = typeof a?.datos === 'string' ? a.datos : '';
    total += datos.length;
    if (!datos || !/^[A-Za-z0-9+/]+={0,2}$/.test(datos)) return { error: 'No se pudo leer uno de los archivos adjuntos.' };
    if (total > MAX_BASE64_TOTAL) return { error: 'Los archivos pesan demasiado. Probá con fotos más chicas o menos archivos.' };
    const inicio = Buffer.from(datos.slice(0, 16), 'base64');
    let tipo = TIPOS.find((t) => t.firma.every((b, i) => inicio[i] === b));
    if (!tipo && inicio.length >= 12 && inicio.subarray(0, 4).toString() === 'RIFF' && inicio.subarray(8, 12).toString() === 'WEBP') tipo = { tipo: 'imagen', media: 'image/webp' };
    if (!tipo) return { error: 'Solo se pueden adjuntar fotos (JPG, PNG, WebP) o archivos PDF.' };
    adjuntos.push({ tipo: tipo.tipo, media: tipo.media, datos, nombre: limpiarTexto(a.nombre).slice(0, 80) });
  }
  return { adjuntos };
}

/** Limpia el historial que manda el navegador: roles válidos, textos acotados, termina en un mensaje del empleado. */
export function limpiarHistorial(entrada) {
  if (!Array.isArray(entrada)) return [];
  const lista = entrada
    .filter((m) => m && (m.rol === 'usuario' || m.rol === 'asistente') && typeof m.texto === 'string' && m.texto.trim())
    .map((m) => ({ rol: m.rol, texto: m.texto.trim().slice(0, m.rol === 'usuario' ? MAX_TEXTO : 1000) }))
    .slice(-MAX_HISTORIAL);
  while (lista.length && lista[0].rol !== 'usuario') lista.shift();
  return lista.at(-1)?.rol === 'usuario' ? lista : [];
}

/** Formulario como lo tiene la persona en pantalla (solo campos conocidos, textos acotados). */
export function limpiarFormulario(entrada) {
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  const f = {};
  for (const [campo, regla] of Object.entries(CAMPOS)) f[campo] = campo === 'flete' ? siNo(e.flete) || 'No' : limpiarTexto(e[campo]).slice(0, regla.max);
  return f;
}

/** Limpia lo que propuso el modelo: solo campos conocidos y con valor (vacío = no cambia). */
export function limpiarPropuesta(entrada, formulario = {}) {
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  const campos = {};
  for (const [campo, regla] of Object.entries(CAMPOS)) {
    if (campo === 'flete') {
      if (siNo(e.flete)) campos.flete = siNo(e.flete);
      continue;
    }
    let v = limpiarTexto(e[campo]).slice(0, regla.max);
    if (campo === 'socio') v = v.replace(/[\s.]/g, '');
    if (campo === 'cedula' && v) v = formatoCedula(v) ?? v; // si no es válida queda como vino y el formulario lo marca
    if (v) campos[campo] = v;
  }
  for (const [campo, v] of Object.entries(campos)) if (formulario[campo] === v) delete campos[campo];
  const final = { ...formulario, ...campos };
  const faltan = Object.keys(CAMPOS).filter((c) => c !== 'flete' && CAMPOS[c].obligatorio && !final[c]).map((c) => CAMPOS[c].etiqueta);
  const respuesta = limpiarTexto(e.respuesta).slice(0, 600)
    || (Object.keys(campos).length ? 'Listo, completé el formulario. Revisalo antes de guardar.' : 'No encontré datos para el formulario en ese mensaje.');
  return { respuesta, campos, faltan };
}

/** Saca el JSON de una respuesta en texto (por si el modelo no usó la herramienta). */
function jsonEnTexto(texto) {
  const m = texto.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

export async function conversar({ historial, formulario, adjuntos = [], token, pedir = fetch }) {
  const mensajes = historial.map((m, i) => ({
    role: m.rol === 'usuario' ? 'user' : 'assistant',
    content: i === historial.length - 1
      ? [
        ...adjuntos.map((a) => (a.tipo === 'pdf'
          ? { type: 'document', source: { type: 'base64', media_type: a.media, data: a.datos } }
          : { type: 'image', source: { type: 'base64', media_type: a.media, data: a.datos } })),
        { type: 'text', text: `Formulario en pantalla ahora:\n${JSON.stringify(formulario)}\n\nMensaje del empleado${adjuntos.length ? ` (con ${adjuntos.length} archivo${adjuntos.length === 1 ? '' : 's'} adjunto${adjuntos.length === 1 ? '' : 's'})` : ''}:\n"""\n${m.texto}\n"""` },
      ]
      : m.texto,
  }));
  const inicio = Date.now();
  for (let intento = 0; ; intento++) {
    const res = await pedir(GATEWAY, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: modelo(), max_tokens: 1000, temperature: 0, system: INSTRUCCIONES,
        tools: [HERRAMIENTA], tool_choice: { type: 'tool', name: HERRAMIENTA.name }, messages: mensajes,
      }),
      signal: AbortSignal.timeout(25_000),
    });
    // El crédito gratuito admite pocos pedidos por minuto: ante un 429 se espera y se reintenta una vez.
    if (res.status === 429 && intento === 0 && Date.now() - inicio < 15_000) {
      const segundos = Number(res.headers.get('retry-after')) || 8;
      await new Promise((ok) => setTimeout(ok, Math.min(Math.max(segundos, 2), 20) * 1000));
      continue;
    }
    if (!res.ok) {
      const detalle = (await res.text().catch(() => '')).slice(0, 300);
      console.error(`asistente: AI Gateway respondió ${res.status}: ${detalle}`);
      throw new ErrorAsistente(
        detalle.includes('customer_verification_required') ? 'Vercel AI Gateway todavía no está habilitado en la cuenta (Vercel → AI Gateway).'
        : res.status === 401 || res.status === 403 ? 'El asistente no tiene acceso a Vercel AI Gateway. Revisá que esté habilitado para este proyecto.'
        : res.status === 402 || detalle.includes('insufficient') ? 'Se agotó el crédito de IA de este mes. Completá el formulario a mano.'
        : res.status === 429 ? 'El servicio de IA está ocupado. Esperá un minuto y probá de nuevo.'
        : res.status === 400 && adjuntos.length ? 'La IA no pudo leer ese archivo. Probá con una foto más nítida o escribí los datos.'
        : 'El servicio de IA no respondió. Probá de nuevo o completá el formulario a mano.',
      );
    }
    const datos = await res.json();
    const bloques = Array.isArray(datos.content) ? datos.content : [];
    const uso = bloques.find((b) => b.type === 'tool_use' && b.name === HERRAMIENTA.name);
    const texto = bloques.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    const propuesta = uso?.input ?? jsonEnTexto(texto) ?? (texto.trim() ? { respuesta: texto } : null);
    if (!propuesta) throw new ErrorAsistente('La IA no respondió. Probá escribirlo de otra forma.');
    return limpiarPropuesta(propuesta, formulario);
  }
}
