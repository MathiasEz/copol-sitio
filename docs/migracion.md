# Migrar el proyecto a otro repositorio y otro Vercel

Guía para llevar COPOL a un GitHub nuevo (otra cuenta u organización) y publicarlo en Vercel, y para que una sesión nueva de Claude lo entienda desde el primer minuto. Complementa el [README](../README.md#publicar-github-privado--vercel), que tiene el paso a paso de la primera publicación.

## 1. Qué es cada cosa

| Pieza | Dónde vive | Se migra con el repo |
|---|---|---|
| Código del sitio y del panel, tests, `docs/` | GitHub | Sí |
| Instrucciones para Claude (`CLAUDE.md`) | GitHub | Sí |
| Stock, productos, novedades, usuarios, registros, auditoría | Base **Turso** | No: se pasa con respaldo/restauración (§4) |
| Imágenes subidas desde el panel y respaldos diarios | **Vercel Blob** | No: las imágenes se vuelven a subir; los respaldos quedan en el Blob viejo |
| Planilla de registros | **Google Sheets** | No: se comparte la misma hoja con la misma cuenta de servicio |
| Variables y secretos | **Vercel** (Environment Variables) | No: se cargan a mano (§3) |
| Dominio y DNS | Proveedor del dominio + Vercel | No (§6) |

## 2. Pasar el repositorio

```bash
git clone --mirror https://github.com/<cuenta-vieja>/copol-sitio.git
cd copol-sitio.git
git push --mirror https://github.com/<cuenta-nueva>/copol-sitio.git
```

Lleva todas las ramas y el historial. Después, en el repositorio nuevo:

- Dejar `main` como rama de producción y crear `staging` si no vino (`git branch staging main && git push origin staging`). El flujo está en el `CLAUDE.md`.
- Revisar que el repositorio sea **privado** y que no haya archivos `.env` ni `panel/datos/` subidos (el `.gitignore` ya los excluye).

## 3. Crear el proyecto en Vercel

1. *Add New… → Project* → importar el repositorio nuevo. Framework **Astro**, `npm run build`, Node 22 o 24. Producción = rama `main`; el resto de las ramas (incluida `staging`) se publica como vista previa, en `https://<proyecto>-git-staging-<equipo>.vercel.app`.
2. **Storage**: conectar una base **Turso** (crea `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN`) y un **Blob Store** (crea `BLOB_READ_WRITE_TOKEN`).
3. **Environment Variables**: cargar a mano lo que sigue. Los nombres y su explicación están en [`.env.example`](../.env.example); los valores no están en ningún archivo, hay que sacarlos del Vercel anterior o generarlos.

| Variable | Entornos | Obligatoria | Notas |
|---|---|---|---|
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Production (+ Preview con otra base, ver abajo) | Sí | |
| `BLOB_READ_WRITE_TOKEN` | Production, Preview | Sí | |
| `CRON_SECRET` | Production | Sí | Valor al azar; autoriza los crons de `vercel.json`. |
| `RESPALDO_CLAVE` | Production | Sí | 24+ caracteres. **Tiene que ser la misma de antes** para poder descifrar respaldos viejos; guardar una copia fuera de Vercel. |
| `GOOGLE_HOJA`, `GOOGLE_CREDENCIALES` | Production | Para registros en Google | URL de la hoja y JSON de la cuenta de servicio (en una línea). La hoja debe estar compartida como Editor con esa cuenta. |
| `RESEND_API_KEY`, `PANEL_CORREO_REMITENTE` | Production | Para el código por correo del login | Sin clave, el paso queda en pausa. |
| `PUBLIC_FORM_ENDPOINT` | Production | Para el formulario de contacto | Sin valor: modo demostración. |
| `IA_MODELO`, `IA_LIMITE_DIA`, `IA_APAGADA`, `PANEL_ASISTENTE_LIMITE_DIA` | Production | No | El asistente usa AI Gateway: hay que habilitarlo en la cuenta nueva. |
| `EXPO_ACCESS_TOKEN` | Production | Para notificaciones push de la app | |
| `SITIO_DE_PRUEBA` | — | No | Solo si se quiere `noindex` en un dominio de prueba. Las vistas previas ya lo hacen solas. |

**Base de pruebas para `staging`.** Si las variables de Turso/Blob se cargan en Preview con los mismos valores que Production, la vista previa edita los datos reales. Lo recomendable es crear una segunda base Turso (y un Blob aparte) y cargar sus variables **solo en Preview**. Las de Google y los crons van solo en Production.

## 4. Pasar los datos

1. Con el proyecto **viejo**: el cron diario deja respaldos cifrados en el Blob (`respaldos/`). También se puede sacar uno a mano con `npm run panel:respaldo` (con las variables de Turso viejas en un `.env` local).
2. Con el proyecto **nuevo** vacío: `npm run panel:descifrar` (si el respaldo viene cifrado, con la `RESPALDO_CLAVE` de siempre) y `npm run panel:restaurar -- --desde <carpeta> --confirmar`, apuntando el `.env` local a la base nueva. Detalle en [panel-stock.md](panel-stock.md) y en el README §4.
3. Si se empieza limpio: `npm run panel:sembrar` y `npm run panel:admin -- --usuario <usuario o correo>`.
4. Las imágenes subidas desde el panel viven en el Blob viejo: volver a subirlas, o conservar el Blob viejo mientras haga falta.
5. Borrar el `.env` local al terminar para no tocar producción sin querer.

## 5. Probar antes de apuntar el dominio

- `npm run verificar` en local (astro check + build + verificación del sitio + tests del panel).
- En la URL `*.vercel.app`: el Bazar, el panel (ingresar, cambiar un stock, ver el cambio), subir una imagen, cargar un registro de prueba y mirar la hoja de Google.
- En *Settings → Cron Jobs*, comprobar que aparecen `respaldo`, `notificaciones` y `estadisticas`.

## 6. Dominio

Se mueve en la ventana de cambio acordada: sacarlo del proyecto viejo, agregarlo al nuevo (*Settings → Domains*) y, si el DNS no está en Vercel, los registros que Vercel indique. Nada de esto se hace sin la aprobación de la cooperativa.

## 7. Para que Claude lo entienda en la sesión nueva

1. Abrir el repositorio nuevo en Claude Code: lee solo el `CLAUDE.md` de la raíz (reglas de trabajo, flujo `rama de trabajo → staging → main`, comandos, advertencias) y de ahí sigue a `docs/`.
2. Autorizar el acceso de Claude al repositorio nuevo en GitHub y, si va a ver despliegues, conectar Vercel a la sesión.
3. Lo que **no** se hereda es la memoria de conversaciones anteriores: si hay una regla que no esté escrita en `CLAUDE.md` o en `docs/`, hay que agregarla ahí.
4. Pedirle como primera tarea que corra `npm run verificar` y confirme que todo pasa.
