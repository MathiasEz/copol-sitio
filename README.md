# COPOL · Cooperativa Policial — Sitio web y panel de stock

Sitio institucional y comercial de la Cooperativa Policial, construido con [Astro](https://astro.build) y preparado para publicarse en **Vercel**. Incluye el **panel de stock del Bazar** en `/panel` (inventario, productos, novedades de la portada y usuarios).

- Páginas institucionales: estáticas (rápidas, sin servidor).
- Bazar y las partes dinámicas de Inicio: se generan en el servidor leyendo la base de datos y la CDN de Vercel guarda una copia; el panel la borra al guardar un cambio, así el stock y las novedades publicadas se ven en la visita siguiente (docs/panel-stock.md). El panel se genera en cada visita.
- Detalle técnico y de seguridad del panel: [docs/panel-stock.md](docs/panel-stock.md).

## Requisitos

- Node.js 22 o superior (probado con Node 24) y npm.
- Para producción: cuentas de **GitHub** y **Vercel**, una base **Turso** y un **Vercel Blob Store** (ambos se crean desde Vercel, ver abajo).

## Desarrollo local

```bash
npm install
```
```bash
npm run panel:sembrar
```
```bash
npm run panel:admin -- --usuario <usuario o correo>
```
```bash
npm run dev
```

Sitio en http://localhost:4321 · panel en http://localhost:4321/<dirección del panel> (ver `BASE` en `panel/src/config.ts`). Sin `.env` se usan una base local (`panel/datos/copol.db`) y una carpeta local para imágenes; ninguna se sube al repositorio.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo (sitio + panel). Antes genera las variantes de imágenes del catálogo. |
| `npm run build` | Compilación para Vercel (`.vercel/output`). |
| `npm run check` | Verificación de tipos. |
| `npm test` | Verifica el sitio compilado: enlaces, títulos, metadatos, `alt`, IDs, ausencia de precios, banners e imágenes del catálogo. |
| `npm run verificar` | `check` + `build` + `test` + pruebas del panel. |
| `npm run qa` | Pruebas en Edge contra `npm run dev`: filtros del Bazar, banners, carrusel, recortes, desborde y accesibilidad (axe). |
| `npm run qa:panel` | Prueba de punta a punta contra `npm run dev`: stock panel → web, escaneo con cámara, usuarios y novedades. |
| `npm run panel:test` | 22 pruebas de seguridad y funcionamiento del panel. |
| `npm run panel:sembrar` | Carga el catálogo importado y las novedades iniciales en la base configurada (no pisa cambios). |
| `npm run panel:admin -- --usuario <u>` | Crea el administrador principal (pide la contraseña por teclado; no queda en ningún archivo). |
| `npm run panel:respaldo` / `panel:restaurar` | Respaldo y recuperación de la base y las imágenes subidas. |
| `npm run catalogo:importar` | Vuelve a importar el catálogo desde Google Sites ([docs/catalogo-bazar.md](docs/catalogo-bazar.md)). |

## Variables de entorno

Ver [.env.example](.env.example). En Vercel se cargan en **Project Settings → Environment Variables** (nunca en el repositorio).

| Variable | Para qué | Cómo se obtiene |
|---|---|---|
| `TURSO_DATABASE_URL` | Base de datos (stock, productos, novedades, usuarios) | Se crea sola al conectar Turso desde el Marketplace de Vercel |
| `TURSO_AUTH_TOKEN` | Acceso a esa base | Ídem |
| `BLOB_READ_WRITE_TOKEN` | Guardar imágenes subidas desde el panel | Se crea sola al conectar un Blob Store al proyecto |
| `PUBLIC_FORM_ENDPOINT` | Destino del formulario de contacto (opcional; sin él, modo demostración) | Ver [docs/produccion.md](docs/produccion.md) |

## Publicar: GitHub privado + Vercel

> Nada de esto cambia el sitio actual ni el DNS. El dominio se vincula al final y **solo con la aprobación de la cooperativa**.

### 1. Crear el repositorio privado en GitHub

Este equipo no tiene Git instalado. La forma más simple es **GitHub Desktop** (https://desktop.github.com):

1. Instalar GitHub Desktop e iniciar sesión con la cuenta de GitHub de la cooperativa.
2. *File → Add local repository…* → elegir esta carpeta → *create a repository* (deja el `.gitignore` existente).
3. *Publish repository* → marcar **Keep this code private** → *Publish*.

Con Git en la terminal es equivalente: `git init`, `git add .`, `git commit -m "Sitio COPOL"`, crear un repositorio **privado** vacío en github.com y `git push`.

Antes de publicar, revisá que en la lista de archivos a subir **no** aparezcan `.env`, `panel/datos/`, `.vercel/` ni `node_modules/` (el `.gitignore` ya los excluye).

### 2. Crear el proyecto en Vercel

1. En https://vercel.com → *Add New… → Project* → importar el repositorio privado (autorizar a Vercel a leerlo).
2. Vercel detecta **Astro**. Dejar: *Build Command* `npm run build`, *Output* automático, *Node.js Version* 22.x o 24.x (Project Settings → General).
3. Todavía no desplegar a producción sin la base: seguir con el paso 3.

### 3. Conectar la base (Turso) y el almacenamiento de imágenes (Blob)

1. En el proyecto de Vercel → **Storage** → *Create* → **Turso** (Marketplace) → crear una base (región cercana, p. ej. São Paulo) y conectarla al proyecto para *Production* y *Preview*. Esto crea `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN`.
2. **Storage** → *Create* → **Blob** → conectarlo al proyecto. Esto crea `BLOB_READ_WRITE_TOKEN`.
3. Si se usa el formulario: agregar `PUBLIC_FORM_ENDPOINT` en *Environment Variables*.

### 4. Cargar los datos en la base de producción

Desde esta carpeta, con un archivo `.env` local que tenga **solo** `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` de producción (copiarlos desde Vercel; no subir el archivo):

- **Opción A — empezar limpio:**
  ```bash
  npm run panel:sembrar
  ```
  ```bash
  npm run panel:admin -- --usuario <usuario o correo>
  ```
- **Opción B — llevar todo lo cargado en local** (stock, usuarios, novedades, registro): primero, **sin** las variables de Turso, `npm run panel:respaldo`; después, **con** ellas, `npm run panel:restaurar -- --desde panel/datos/respaldos/<carpeta> --confirmar`. Las imágenes subidas en local no se trasladan: volver a subirlas desde el panel.

Al terminar, borrar las variables de Turso del `.env` local (o el archivo) para no tocar producción sin querer.

### 5. Desplegar y probar

1. En Vercel → *Deployments* → *Redeploy* (o hacer un commit). Al terminar, abrir la URL `*.vercel.app`.
2. Probar: `/hipermercado/bazar/`, el panel (ingresar, cambiar un stock, recargar el Bazar y ver el cambio), subir la imagen de una novedad y publicarla.
3. El escaneo con cámara requiere HTTPS: funciona en la URL de Vercel y en el dominio final.

### 6. Vincular el dominio `cooperativapolicial.com.uy` (con aprobación)

1. Vercel → Project Settings → **Domains** → agregar `cooperativapolicial.com.uy` y `www.cooperativapolicial.com.uy` (una redirige a la otra).
2. Vercel muestra los registros DNS a crear (normalmente un registro **A** para el dominio raíz y un **CNAME** para `www`). Cargarlos en el proveedor del dominio **en la ventana de cambio acordada**; mientras no se carguen, el sitio actual (Odoo) sigue funcionando sin cambios.
3. Esperar a que Vercel marque el dominio como válido y emita el certificado HTTPS. Las redirecciones de las direcciones viejas (`/locales`, `/bazar`, `/convenios`…) ya están configuradas como permanentes.
4. Enviar `https://cooperativapolicial.com.uy/sitemap-index.xml` a Google Search Console.

## Estructura

```
src/
  pages/                 Rutas. hipermercado/bazar.astro (con caché en la CDN) y el panel se generan en el servidor
  components/            Encabezado, Pie, TarjetaProducto, EstanteBazar y NovedadesInicio (server islands), BannerSeccion…
  lib/                   inventario.ts (catálogo y stock desde la base), datos.ts, imagenes.ts
  data/                  confirmado/ (datos verificados) · catalogo/ (catálogo importado e informe) · demo/
  assets/                brand/ · img/ · banners/ · catalogo/bazar/ (imágenes originales del catálogo)
  styles/global.css      Sistema visual (Manual de marca COPOL 2026)
panel/
  src/                   app.ts (rutas), db.ts (libSQL/Turso), productos.ts, novedades.ts, usuarios.ts, seguridad.ts, vistas.ts…
  scripts/               sembrar, crear-admin, respaldo, restaurar
  test/                  pruebas del panel
public/                  favicon, imagen OG, novedades/ (imágenes iniciales), panel-recursos/ (estilos y script del panel)
scripts/                 importación del catálogo, variantes de imágenes, verificadores y pruebas en navegador
assets-source/           originales descargados y manifiesto de procedencia
docs/                    decisiones, catálogo, panel, producción, activos y pendientes
```

## Documentación

- [docs/panel-stock.md](docs/panel-stock.md): panel, recorrido del stock, seguridad, respaldos.
- [docs/catalogo-bazar.md](docs/catalogo-bazar.md): importación del catálogo, conteos y faltantes.
- [docs/produccion.md](docs/produccion.md): requisitos para reemplazar el sitio actual.
- [docs/decisiones.md](docs/decisiones.md) · [docs/pendientes.md](docs/pendientes.md) · [docs/registro-de-activos.md](docs/registro-de-activos.md) · [docs/sistema-visual.md](docs/sistema-visual.md) · [docs/reemplazo-de-datos.md](docs/reemplazo-de-datos.md)

## Limitaciones conocidas

- Tipografía provisoria (Figtree) hasta recibir la licencia web de Articulat CF.
- Formulario de contacto sin backend configurado (modo demostración).
- Catálogo del Hipermercado y ofertas semanales: contenido de demostración o pendiente.
- Banner de Bazar: sus textos chicos no se leen en móvil; falta la versión móvil.
