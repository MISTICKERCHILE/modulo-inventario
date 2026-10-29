/** Configuración de Tailwind para las páginas públicas de Buddy ERP.
 *  La aplicación (/app) aún usa el CDN; se migrará módulo por módulo. */
module.exports = {
  content: [
    './index.html',
    './vistas/planes.html',
    './vistas/contacto.html',
    './legal/*.html',
  ],
  theme: { extend: {} },
  plugins: [],
};
