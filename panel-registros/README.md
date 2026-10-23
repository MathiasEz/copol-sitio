# Panel de registros (COPOL)

Herramienta aparte del sitio, del panel de stock y del panel de envíos: no comparte código, base de datos ni
despliegue con ellos. Se publica en Vercel como **proyecto propio** (`copol-registros`, carpeta raíz
`panel-registros`).

## Qué hace

- **Formulario**: Nombre, N° de socio, Cédula, Dirección, Producto, Código interno y Service (opcional).
  Cada registro se agrega como una fila nueva en una **planilla de Excel en la nube** (OneDrive o SharePoint),
  que se abre desde cualquier computadora en https://excel.cloud.microsoft.
- **Asistente de IA (opcional)**: se pega o escribe el texto como llegó (WhatsApp, correo, lo que dictó el socio)
  y completa el formulario. Los campos que completó quedan en amarillo; la persona los revisa y guarda. La IA
  nunca guarda sola.
- Valida antes de guardar: la cédula con su dígito verificador (y la guarda como `1.234.567-8`), el N° de socio
  solo con números y los campos obligatorios. Lo que empieza con `=`, `+`, `-` o `@` se guarda como texto
  para que Excel no lo tome como fórmula.
- Acceso con una **clave compartida** y el nombre de quien carga.

### Columnas de la planilla

| Fecha | Nombre | N° de socio | Cédula | Dirección | Service | Producto | Código interno | Cargado por |
|---|---|---|---|---|---|---|---|---|

«Fecha» (hora de Montevideo) y «Cargado por» (el nombre puesto al ingresar) las completa el panel. La primera
vez que se guarda, el panel crea en el archivo una hoja **Registros** con una tabla **Registros** y esas columnas;
no toca las otras hojas. Se pueden agregar filtros, colores o columnas a la derecha **fuera** de la tabla, pero
no cambiar la cantidad de columnas de la tabla.

## Publicar en Vercel

1. Vercel → *Add New… → Project* → importar el repositorio `copol-sitio` **otra vez**, como proyecto nuevo
   `copol-registros`. En *Root Directory* elegir `panel-registros`. *Framework Preset*: **Other**. No lleva
   comando de compilación.
2. *Settings → Environment Variables*: cargar `PANEL_CLAVE` (10 caracteres o más) y las de Microsoft (abajo).
3. *Storage → Create → Upstash for Redis* (plan gratuito) → conectarlo al proyecto. Crea `KV_REST_API_URL` y
   `KV_REST_API_TOKEN`. Hace falta para el modo cuenta; además limita los intentos de clave y el uso diario del asistente.
4. *AI Gateway*: el mismo de la cuenta de Vercel que usa el panel de stock. No lleva clave (usa el token OIDC
   del despliegue). Para apagar el asistente: `IA_APAGADA=1`.
5. *Deployments → Redeploy*.

Para que los commits de esta carpeta no vuelvan a desplegar el sitio (y al revés), en cada proyecto se puede
poner *Settings → Git → Ignored Build Step*: en `copol-registros` `git diff --quiet HEAD^ HEAD -- .`.

## Conectar con Excel (Microsoft)

### 1. El archivo

En OneDrive de la cuenta que va a ser dueña de la planilla, crear un libro de Excel vacío, por ejemplo
`COPOL/Registros COPOL.xlsx`. Esa ruta va en `EXCEL_RUTA`. Para que lo vean otras personas, compartirlo desde
Excel (*Compartir*) como cualquier archivo.

### 2. La aplicación en Microsoft Entra ID

En https://entra.microsoft.com (o https://portal.azure.com → *Microsoft Entra ID*) → *App registrations* →
*New registration*:

- Nombre: `COPOL Registros`.
- *Supported account types*: «Accounts in any organizational directory and personal Microsoft accounts»
  (sirve para una cuenta personal tipo Outlook/Hotmail y para Microsoft 365).
- *Redirect URI*: plataforma **Web**, `https://<dirección del proyecto>.vercel.app/api/microsoft/vuelta`.
- Después: *Certificates & secrets → New client secret* (anotar la fecha de vencimiento; hay que renovarlo).

Variables: `MS_CLIENT_ID` (*Application (client) ID*) y `MS_CLIENT_SECRET` (el *Value* del secreto).

### 3a. Modo cuenta (recomendado)

- `MS_CUENTA` = correo de la cuenta dueña del archivo.
- En la aplicación de Entra ID → *API permissions*: `Files.ReadWrite`, `User.Read`, `offline_access` (delegados).
- Entrar al panel → aviso «Falta conectar la cuenta» → **Conectar cuenta de Microsoft** → iniciar sesión con esa
  cuenta y aceptar. Solo se acepta la cuenta de `MS_CUENTA`. Queda conectada mientras el panel se use (Microsoft
  la desconecta tras 90 días sin uso, o si se cambia la contraseña: el panel lo avisa y se vuelve a conectar).

### 3b. Modo aplicación (solo Microsoft 365 empresa)

Sin inicio de sesión, la aplicación entra con su secreto. Requiere un administrador de Microsoft 365 y da acceso
a todos los OneDrive de la organización, por eso es la segunda opción.

- *API permissions* → *Application permissions* → `Files.ReadWrite.All` → *Grant admin consent*.
- `MS_USUARIO` = dueño del OneDrive (ej.: `registros@cooperativapolicial.com.uy`) y `MS_TENANT` = *Directory (tenant) ID*.
- No hace falta Upstash para guardar (sí para limitar los intentos de clave).

## Variables

Ver [.env.example](.env.example).

| Variable | Para qué |
|---|---|
| `PANEL_CLAVE` | Clave de acceso (10+ caracteres). Cambiarla cierra todas las sesiones. |
| `MS_CLIENT_ID`, `MS_CLIENT_SECRET` | Aplicación de Entra ID. |
| `MS_CUENTA` | Modo cuenta: correo dueño del archivo. |
| `MS_USUARIO`, `MS_TENANT` | Modo aplicación. |
| `EXCEL_RUTA` | Ruta del archivo en ese OneDrive (por defecto `Registros COPOL.xlsx`). |
| `EXCEL_TABLA` | Nombre de la tabla y de la hoja (por defecto `Registros`). |
| `MS_REDIRECT_URI` | Solo con dominio propio: dirección de vuelta registrada en Entra ID. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash for Redis (se crean solas). |
| `IA_MODELO`, `IA_LIMITE_DIA`, `IA_APAGADA` | Asistente: modelo de AI Gateway (por defecto `google/gemini-2.5-flash`), consultas por día (300), apagarlo. |
| `PANEL_SESION_HORAS` | Duración de la sesión (12 h). |

## Probar en la computadora

```bash
cd panel-registros
cp .env.example .env   # completar PANEL_CLAVE; sin variables MS_… guarda en datos/registros.csv
npm run dev            # http://localhost:4400
npm test               # pruebas (Microsoft, Upstash y la IA simulados)
```

Para probar el asistente en la computadora hace falta `AI_GATEWAY_API_KEY` (Vercel → AI Gateway → API Keys).

## Estructura

```
public/            Página (index.html, estilos.css, app.js) y recursos (logo, tipografía)
api/sesion.js      Ingreso, salida y estado del panel
api/registro.js    Guarda una fila en la planilla
api/asistente.js   La IA propone los campos a partir de un texto
api/microsoft/     Conectar la cuenta de Microsoft (modo cuenta)
api/_lib/          Campos y validación, sesión, Microsoft Graph, Upstash, asistente
servidor-local.js  Servidor para `npm run dev`
test/              Pruebas
```
