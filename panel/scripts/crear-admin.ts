// Crea el administrador principal (protegido) en la base configurada, o restablece su contraseña.
// La contraseña NO se pasa como argumento ni se guarda en archivos: se escribe por teclado (no se
// muestra) y en la base solo queda su hash. Queda como temporal: hay que cambiarla al ingresar.
//
//   npm run panel:admin -- --usuario <usuario o correo>
import readline from 'node:readline';
import { parseArgs } from 'node:util';
import { registrar } from '../src/auditoria.ts';
import { conectar } from '../src/db.ts';
import * as U from '../src/usuarios.ts';

const { values } = parseArgs({ options: { usuario: { type: 'string' } } });
const usuario = (values.usuario ?? '').toLowerCase().trim();
if (!/^[a-z0-9._-]{3,40}$/.test(usuario) && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(usuario)) {
  console.error('Indicá --usuario (usuario de 3 a 40 caracteres o un correo).');
  process.exit(1);
}

async function pedirClave(): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const salida = rl as unknown as { _writeToOutput: (s: string) => void };
  const original = salida._writeToOutput.bind(rl);
  let oculto = false;
  salida._writeToOutput = (s: string) => original(oculto ? '' : s);
  const clave = await new Promise<string>((resolve) => {
    rl.question('Contraseña temporal (no se muestra): ', (r) => resolve(r));
    oculto = true;
  });
  rl.close();
  process.stdout.write('\n');
  return clave;
}

const clave = await pedirClave();
if (clave.length < 10) {
  console.error('La contraseña temporal debe tener al menos 10 caracteres.');
  process.exit(1);
}
const db = await conectar();
const existente = await U.buscarPorUsuario(db, usuario);
if (existente) {
  await U.cambiarClave(db, existente.id, clave, true);
  await db.execute({ sql: "UPDATE usuarios SET rol = 'administrador', activo = 1, protegido = 1 WHERE id = ?", args: [existente.id] });
  await U.cerrarSesionesDe(db, existente.id);
  await registrar(db, { id: null, usuario: 'sistema', ip: null }, 'usuario.clave', 'usuario', String(existente.id), { usuario, via: 'consola' });
  console.log(`Se restableció la contraseña de "${usuario}" (administrador principal). Deberá cambiarla al ingresar.`);
} else {
  const id = await U.crearUsuario(db, { usuario, rol: 'administrador', clave, debeCambiar: true, protegido: true, creadoPor: 'consola' });
  await registrar(db, { id: null, usuario: 'sistema', ip: null }, 'usuario.alta', 'usuario', String(id), { usuario, rol: 'administrador', protegido: true, via: 'consola' });
  console.log(`Administrador principal "${usuario}" creado. Deberá cambiar la contraseña al ingresar.`);
}
db.close();
