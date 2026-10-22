// Catálogo del Bazar para la app: modelos agrupados por color, con el mismo estado de stock que la web.
// Sin precios. La descripción de cada modelo se pide aparte en /api/bazar/descripcion/<id>.
import type { APIRoute } from 'astro';
import { obtenerCatalogoModelos } from '../../../../lib/inventario';
import { ETIQUETAS_WEB } from '../../../../lib/cache-publica';
import { respuestaApp, varianteGrande } from '../../../../lib/api-app';

export const prerender = false;

export const GET: APIRoute = async () => {
  const c = await obtenerCatalogoModelos();
  return respuestaApp({
    categorias: c.categorias.map(({ id, nombre, total, conStock }) => ({ id, nombre, total, conStock })),
    totales: c.totales,
    modelos: c.modelos.map((m) => ({
      id: m.id,
      nombre: m.nombre,
      marca: m.marca,
      categoriaId: m.categoriaId,
      subcategoria: m.subcategoria,
      imagen: m.imagen?.src ?? null,
      imagenGrande: varianteGrande(m.imagen?.srcset) ?? m.imagen?.src ?? null,
      estado: m.estado,
      descripcionId: m.descripcionId,
      variantes: m.variantes.map(({ id, color, codigo, estado }) => ({ id, color, codigo, estado })),
    })),
  }, c.enVivo, ETIQUETAS_WEB.bazar);
};
