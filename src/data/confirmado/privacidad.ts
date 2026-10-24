// Política de privacidad (/privacidad/): datos de vigencia y estado de la revisión legal.
// El texto describe lo que el sitio y la app hacen hoy con los datos (formulario, estadísticas sin cookies,
// avisos de la app, panel). Si cambia algo de eso, actualizar src/pages/privacidad.astro y la fecha.
export const PRIVACIDAD = {
  /** Fecha desde la que rige este texto (se muestra al pie de la página). */
  vigenteDesde: '24 de octubre de 2026',
  /** false = borrador: la página muestra el aviso "pendiente de revisión legal". Pasar a true cuando la asesoría
   *  legal de COPOL apruebe el texto (docs/produccion.md, P6). */
  revisadaPorLegal: false,
} as const;
