// src/lib/sanitizarHtml.js
// Saneado del HTML de los documentos institucionales.
//
// La frontera de confianza está AQUÍ, en el renderizado, y no en el editor.
// El contenido lo escriben administradores, pero un administrador puede hacer
// PATCH contra PostgREST sin pasar por el editor: sanear solo al guardar
// dejaría la puerta abierta a que ese HTML acabara ejecutándose en una página
// pública, que es la que ve cualquier visitante.
//
// La lista de permitidos se acota a lo que el editor puede producir. Todo lo
// demás —<script>, <iframe>, <style>, atributos on*, javascript: en href— se
// cae, porque no está en la lista.
import DOMPurify from 'dompurify'

export const ETIQUETAS_PERMITIDAS = Object.freeze([
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'ul',
  'ol',
  'li',
  'h2',
  'h3',
  'h4',
  'blockquote',
  'a',
  'hr',
  'code',
  'pre',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
])

export const ATRIBUTOS_PERMITIDOS = Object.freeze(['href', 'title', 'target', 'rel'])

/**
 * Devuelve el HTML seguro para insertar en la página.
 * @param {string} html contenido tal como está almacenado
 * @returns {string} HTML sin nada ejecutable
 */
export function sanitizarHtml(html) {
  if (!html) return ''
  return DOMPurify.sanitize(String(html), {
    ALLOWED_TAGS: [...ETIQUETAS_PERMITIDAS],
    ALLOWED_ATTR: [...ATRIBUTOS_PERMITIDOS],
    // Sin esto, `javascript:` y `data:` seguirían siendo href válidos.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#|\/)/i,
    // Un documento legal no necesita incrustar nada externo.
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'input'],
    FORBID_ATTR: ['style', 'srcset', 'formaction'],
  })
}

/**
 * Los enlaces salientes se abren fuera y sin pasar el referente. Se aplica
 * después de sanear, sobre el HTML ya limpio.
 * @param {string} htmlSaneado
 * @returns {string}
 */
export function marcarEnlacesExternos(htmlSaneado) {
  if (!htmlSaneado) return ''
  return htmlSaneado.replace(/<a\s+([^>]*href="https?:\/\/[^"]*"[^>]*)>/gi, (etiqueta, attrs) => {
    if (/target=/i.test(attrs)) return etiqueta
    return `<a ${attrs} target="_blank" rel="noopener noreferrer">`
  })
}
