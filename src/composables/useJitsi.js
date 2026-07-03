// Integración con el iframe API de Jitsi Meet (external_api.js).
// Instancia configurable vía VITE_JITSI_DOMAIN; default la pública
// meet.jit.si. Para una instancia propia con JWT de moderador, pasar
// `jwt` en las opciones (en meet.jit.si no aplica).

export const JITSI_DOMAIN = import.meta.env.VITE_JITSI_DOMAIN || 'meet.jit.si'

let scriptPromise = null

export function cargarJitsiApi(domain = JITSI_DOMAIN) {
  if (window.JitsiMeetExternalAPI) return Promise.resolve(window.JitsiMeetExternalAPI)
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://${domain}/external_api.js`
    script.async = true
    script.onload = () => {
      if (window.JitsiMeetExternalAPI) resolve(window.JitsiMeetExternalAPI)
      else reject(new Error('external_api.js cargó pero JitsiMeetExternalAPI no existe'))
    }
    script.onerror = () => {
      scriptPromise = null
      reject(new Error(`No se pudo cargar el API de Jitsi desde ${domain}`))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

/**
 * Monta una sala de Jitsi en `parentNode` y devuelve la instancia del
 * API (dispose() al desmontar es responsabilidad del caller).
 */
export async function crearSalaJitsi({
  roomName,
  parentNode,
  displayName = '',
  email = '',
  jwt = null,
  domain = JITSI_DOMAIN,
}) {
  const JitsiAPI = await cargarJitsiApi(domain)
  return new JitsiAPI(domain, {
    roomName,
    parentNode,
    jwt: jwt || undefined,
    width: '100%',
    height: '100%',
    userInfo: { displayName, email },
    configOverwrite: {
      prejoinConfig: { enabled: false },
      disableDeepLinking: true,
      startWithAudioMuted: true,
    },
    interfaceConfigOverwrite: {
      SHOW_JITSI_WATERMARK: false,
      MOBILE_APP_PROMO: false,
    },
  })
}
