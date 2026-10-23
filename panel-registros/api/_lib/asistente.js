// Asistente opcional: recibe un texto libre (un mensaje de WhatsApp, un correo, lo que dictó el socio) y
// devuelve los campos del formulario. No guarda nada: la persona revisa el formulario y lo guarda ella.
// Usa Vercel AI Gateway (API compatible con Anthropic Messages) igual que el asistente del panel de stock:
// en Vercel se autentica con el token OIDC del despliegue, sin claves. El modelo se cambia con IA_MODELO;
// por defecto Gemini 2.5 Flash, porque el crédito gratuito de AI Gateway no habilita los modelos de Claude.
import { CAMPOS, formatoCedula, limpiarTexto } from './campos.js';

const GATEWAY = 'https://ai-gateway.vercel.sh/v1/messages';
export const MAX_TEXTO = 4000;
const modelo = () => process.env.IA_MODELO || 'google/gemini-2.5-flash';

export const tokenGateway = (cabeceraOidc) => process.env.AI_GATEWAY_API_KEY || cabeceraOidc || process.env.VERCEL_OIDC_TOKEN || null;

export class ErrorAsistente extends Error {
  constructor(mensaje, status = 502) {
    super(mensaje);
    this.status = status;
  }
}

const INSTRUCCIONES = `Sos el asistente del panel de registros de COPOL (Cooperativa Policial, Uruguay).
Un empleado te pasa un texto con los datos de un socio y de un producto. Tu única tarea es completar el
formulario llamando a la herramienta completar_formulario. Reglas:
- Copiá los datos tal como aparecen; no inventes ni completes nada que no esté en el texto. Si un dato no
  está, dejalo vacío y nombralo en "faltan".
- nombre: nombre y apellido del socio, con mayúscula inicial en cada palabra.
- socio: número de socio, solo dígitos. No lo confundas con la cédula (C.I., cédula, documento) ni con el teléfono.
- cedula: cédula de identidad uruguaya tal como está escrita (con o sin puntos y guion).
- direccion: calle, número, apartamento y localidad o departamento si aparecen.
- service: solo si el texto pide o menciona un service (servicio técnico, reparación, garantía, instalación,
  visita técnica); resumilo en pocas palabras. Si no, vacío.
- producto: descripción del producto (marca, modelo, color, capacidad).
- codigo: código interno del producto (código, cód., art., artículo, SKU). No uses el número de socio ni la cédula.
- Si el texto trae varios socios o productos, completá solo el primero y avisalo en "notas".
- "notas": una frase corta en español rioplatense solo si hay algo para revisar; si no, vacío.`;

const HERRAMIENTA = {
  name: 'completar_formulario',
  description: 'Completa los campos del formulario de registro con los datos encontrados en el texto.',
  input_schema: {
    type: 'object',
    properties: {
      nombre: { type: 'string' },
      socio: { type: 'string' },
      cedula: { type: 'string' },
      direccion: { type: 'string' },
      service: { type: 'string' },
      producto: { type: 'string' },
      codigo: { type: 'string' },
      faltan: { type: 'array', items: { type: 'string' }, description: 'Campos que no aparecen en el texto.' },
      notas: { type: 'string' },
    },
    required: ['nombre', 'socio', 'cedula', 'direccion', 'service', 'producto', 'codigo', 'faltan', 'notas'],
  },
};

/** Limpia lo que propuso el modelo: textos acotados y solo los campos conocidos. */
export function limpiarPropuesta(entrada) {
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  const campos = {};
  for (const [campo, regla] of Object.entries(CAMPOS)) {
    let v = limpiarTexto(e[campo]).slice(0, regla.max);
    if (campo === 'socio') v = v.replace(/[\s.]/g, '');
    if (campo === 'cedula' && v) v = formatoCedula(v) ?? v; // si no es válida queda como vino y el formulario lo marca
    if (v) campos[campo] = v;
  }
  const notas = limpiarTexto(e.notas).slice(0, 300);
  const faltan = Object.keys(CAMPOS).filter((c) => CAMPOS[c].obligatorio && !campos[c]).map((c) => CAMPOS[c].etiqueta);
  return { campos, faltan, notas };
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

export async function extraer(texto, { token, pedir = fetch }) {
  const inicio = Date.now();
  for (let intento = 0; ; intento++) {
    const res = await pedir(GATEWAY, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: modelo(),
        max_tokens: 1000,
        temperature: 0,
        system: INSTRUCCIONES,
        tools: [HERRAMIENTA],
        tool_choice: { type: 'tool', name: HERRAMIENTA.name },
        messages: [{ role: 'user', content: `Texto del empleado:\n"""\n${texto}\n"""` }],
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
        : 'El servicio de IA no respondió. Probá de nuevo o completá el formulario a mano.',
      );
    }
    const datos = await res.json();
    const bloques = Array.isArray(datos.content) ? datos.content : [];
    const uso = bloques.find((b) => b.type === 'tool_use' && b.name === HERRAMIENTA.name);
    const propuesta = uso?.input ?? jsonEnTexto(bloques.filter((b) => b.type === 'text').map((b) => b.text).join('\n'));
    if (!propuesta) throw new ErrorAsistente('La IA no devolvió datos para el formulario. Probá escribir el texto de otra forma.');
    return limpiarPropuesta(propuesta);
  }
}
