# COPOL — sitio y panel de la cooperativa

Sitio público de la Cooperativa Policial (Astro) y su panel de administración (Hono, en `panel/`). **`main` es producción**: es lo que ve la gente y lo que usan los empleados. Se escribe en español rioplatense y se cuida mucho de no romper nada: es una cooperativa real.

## Flujo de trabajo (obligatorio)

```
rama de trabajo  →  staging  →  main (producción)
```

1. **Nunca se trabaja directo sobre `main`.** Los cambios se hacen en la rama de trabajo de la sesión (la que indique la sesión) y se suben a **`staging`**.
2. **`staging` es el servidor de pruebas.** Vercel publica cada push a `staging` como una vista previa en una dirección fija:
   `https://copol-git-staging-brandonpevz-6978s-projects.vercel.app`
   (pide iniciar sesión en Vercel). Ahí se prueba todo antes de tocar la página real.
3. **A `main` se pasa solo con confirmación explícita de la persona** ("sí, unilo"), cada vez, después de haber probado en `staging`. La aprobación de un cambio no vale para el siguiente.
4. Si `staging` quedó atrás de `main` (por ejemplo, tras un arreglo urgente), se pone al día con `main` antes de seguir.
5. No se crean pull requests salvo que se pidan.
6. Los commits terminan con las líneas de atribución que indique la sesión.

## Antes de subir cualquier cambio

- `npm run check` (astro check), `npm run build`, `npm test` (verifica el sitio compilado) y `npm run panel:test` (tests del panel). `npm run verificar` corre todo junto.
- Si el cambio es visual o de interacción, probarlo en un navegador (Playwright sirve contra `.vercel/output/static`; las *server islands* no se renderizan ahí).
- Informar con honestidad lo que no se pudo probar (la hoja de Google real, los mosaicos reales del mapa, etc.).

## Ojo: staging comparte datos con producción

La vista previa de Vercel usa **las mismas** `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` y `BLOB_READ_WRITE_TOKEN` que producción (están cargadas en Production, Preview y Development). Por eso:

- Todo lo que se haga en el **panel de `staging`** (stock, usuarios, novedades, campana) **modifica los datos reales**.
- Las variables de Google Sheets (`GOOGLE_HOJA`, `GOOGLE_CREDENCIALES`) y las de los crons existen **solo en Production**: en `staging` la planilla de registros no toca la hoja real y los crons no corren.
- Para probar el panel sin riesgo hay que crear una base Turso de pruebas y cargar sus variables solo en el entorno **Preview** de Vercel. Mientras eso no esté hecho, en `staging` se prueban el sitio público y el diseño, y los cambios del panel se prueban con `npm run panel:test` (usa una base local temporal).

## Dónde mirar primero

- `docs/decisiones.md`: decisiones tomadas y por qué.
- `docs/panel-stock.md`: cómo funciona el panel (roles, permisos, registros, planilla, auditoría).
- `docs/sistema-visual.md`: colores, tipografía, componentes.
- `docs/produccion.md` y `docs/pendientes.md`: lo que falta y la lista de lanzamiento.
- `docs/migracion.md`: cómo pasar el proyecto a otro repositorio y otro Vercel (variables, datos, dominio). `README.md` tiene el paso a paso de la primera publicación y `.env.example` la lista completa de variables.

## Cosas del código que conviene saber

- Sitio: páginas estáticas de Astro con *server islands* (`server:defer`). Datos confirmados en `src/data/confirmado/` (se regeneran con `npm run datos:extraer`; ver `scripts/extract-data.mjs`).
- Panel: `panel/src/app.ts` (rutas), `vistas.ts` (HTML), `db.ts` (migraciones en `MIGRACIONES`, se agregan al final, nunca se editan las viejas), `seguridad.ts` (roles y permisos), `registros*.ts` (carga de registros y Google Sheets).
- CSP del panel: `style-src 'self'`, así que **no hay estilos en línea**; los estilos nuevos van como clases en `public/panel-recursos/panel.css`.
- Variables de entorno: la lista completa y explicada está en `.env.example` (los valores viven solo en Vercel, nunca en el repo). Las que importan: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `BLOB_READ_WRITE_TOKEN`, `GOOGLE_HOJA`, `GOOGLE_CREDENCIALES`, `RESPALDO_CLAVE`, `CRON_SECRET`, `RESEND_API_KEY`, `PUBLIC_FORM_ENDPOINT`.
- Los respaldos diarios cifrados y las notificaciones corren como crons de Vercel (`vercel.json`) y solo en producción.
