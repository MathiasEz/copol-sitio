// Único punto de entrada: vercel.json manda acá todos los pedidos (ver api/_lib/app.js).
import { manejar } from './_lib/app.js';

export const GET = manejar;
export const HEAD = manejar;
export const POST = manejar;
export const PATCH = manejar;
export const DELETE = manejar;
