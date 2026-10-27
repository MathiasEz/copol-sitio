// Error de la hoja de registros (Google Sheets), con el estado HTTP que el panel le devuelve a la persona.
export class ErrorPlanilla extends Error {
  status: number;
  constructor(mensaje: string, { status = 502 }: { status?: number } = {}) {
    super(mensaje);
    this.name = 'ErrorPlanilla';
    this.status = status;
  }
}
