
async function obtenerDatosSeguros(tabla) {
  const respuesta = await fetch('/api/get-data', {
    method: 'POST',
    body: JSON.stringify({ table: tabla })
  });
  return await respuesta.json();
}

window.apiBuddy = { obtenerDatosSeguros };
