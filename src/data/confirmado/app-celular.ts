// Última versión del APK de la app de Android (copol-sitio-app), publicada en /api/app/v1/version.json.
// Al compilar un APK nuevo (`eas build -p android --profile preview`, que sube el versionCode), copiar acá su
// versionCode y la dirección del archivo, y publicar el sitio: quien tenga una versión anterior ve el aviso.
// La app solo acepta direcciones https://expo.dev/artifacts/eas/….apk (APK_OFICIAL en copol-sitio-app/src/config.ts).
export const APP_ANDROID = {
  versionCode: 2,
  url: 'https://expo.dev/artifacts/eas/TfTTEjqRb6rUfmK-caDPUIWRTK5bES5fn_nMqtQibSc.apk',
  notas: 'Incluye actualizaciones automáticas: las próximas mejoras llegan solas.',
} as const;
