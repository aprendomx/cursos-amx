// src/lib/enlacesInstitucionales.js
// Resuelve a dónde apunta cada enlace institucional del pie.
//
// Antes, la plantilla del tema traía `href: '#'` para el aviso de privacidad,
// los términos de uso y el contacto, y el formulario de alta recababa el
// consentimiento señalando a ese '#'. Ahora los documentos viven en la
// plataforma, pero la configuración tiene que seguir mandando: hay
// instalaciones que ya los publican fuera y no deben cambiar de comportamiento.
//
// Orden de resolución:
//   1. `href` con una URL de verdad          -> se respeta tal cual
//   2. `doc` declarado en la configuración   -> ruta interna del documento
//   3. sin URL, pero la etiqueta coincide    -> ruta interna (configuraciones
//      con un documento conocido                 antiguas, que traen '#' y no
//                                                conocen la clave `doc`)
//   4. nada de lo anterior                   -> se deja como está
import { DOCUMENTOS } from '@/services/documentosInstitucionales.js'

const SIN_DESTINO = new Set(['', '#'])

function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

const POR_ETIQUETA = new Map(DOCUMENTOS.map((d) => [normalizar(d.titulo), d]))

/** @returns {{href: string, externo: boolean}} */
export function resolverEnlace(link) {
  const href = String(link?.href || '').trim()

  if (!SIN_DESTINO.has(href)) {
    return { href, externo: /^https?:/i.test(href) }
  }

  const porClave = DOCUMENTOS.find((d) => d.slug === link?.doc)
  if (porClave) return { href: `#${porClave.ruta}`, externo: false }

  const porEtiqueta = POR_ETIQUETA.get(normalizar(link?.label))
  if (porEtiqueta) return { href: `#${porEtiqueta.ruta}`, externo: false }

  return { href: href || '#', externo: false }
}

/** Ruta del aviso, para el enlace de la casilla de consentimiento del alta. */
export function rutaAviso(configuracion) {
  return resolverEnlace({
    doc: 'aviso-privacidad',
    label: 'Aviso de privacidad',
    href: configuracion?.href,
  }).href
}
