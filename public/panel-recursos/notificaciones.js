// Formulario de notificaciones de la app: vista previa en vivo, campos según "Cuándo" y confirmación al enviar ya.
(() => {
  const form = document.querySelector('[data-form-notificacion]');
  if (!form) return;
  const campo = (n) => form.querySelector(`[data-np="${n}"]`);
  const ver = (n) => form.querySelector(`[data-np-ver="${n}"]`);
  const destino = campo('destino');
  const boton = campo('boton');
  const textoBoton = () => destino.selectedOptions[0]?.dataset.boton ?? '';
  const actualizar = () => {
    ver('titulo').textContent = campo('titulo').value.trim() || 'Título del aviso';
    ver('texto').textContent = campo('texto').value.trim() || 'Texto del aviso.';
    ver('boton').textContent = textoBoton();
    ver('boton').hidden = !boton.checked;
    form.querySelector('[data-np-boton]').textContent = textoBoton();
  };
  const cuando = () => form.querySelector('input[name="cuando"]:checked')?.value ?? 'programar';
  const mostrar = () => {
    const c = cuando();
    for (const el of form.querySelectorAll('[data-cuando]')) el.hidden = !el.dataset.cuando.split(' ').includes(c);
    const etiqueta = form.querySelector('[data-cuando-texto]');
    if (etiqueta) etiqueta.textContent = c === 'repetir' ? 'Desde el día' : 'Día';
    const enviar = form.querySelector('[data-boton-enviar]');
    enviar.lastChild.textContent = c === 'ahora' ? 'Enviar ahora' : enviar.dataset.textoGuardar ?? enviar.lastChild.textContent;
  };
  const enviar = form.querySelector('[data-boton-enviar]');
  enviar.dataset.textoGuardar = form.action.endsWith('/nueva') ? 'Programar' : 'Guardar cambios';
  form.addEventListener('input', actualizar);
  form.addEventListener('change', () => { actualizar(); mostrar(); });
  form.addEventListener('submit', (e) => {
    if (cuando() !== 'ahora') return;
    let alcance = {};
    try { alcance = JSON.parse(form.dataset.alcance || '{}'); } catch {}
    const n = alcance[campo('categoria').value] ?? 0;
    const texto = n ? `¿Enviar ahora? Llega al instante a ${n} ${n === 1 ? 'celular' : 'celulares'} y al resto cuando la app se actualiza.` : '¿Enviar ahora? Le llega a cada celular cuando la app se actualiza.';
    if (!confirm(`${texto} No se puede deshacer.`)) e.preventDefault();
  });
  actualizar();
  mostrar();
})();
