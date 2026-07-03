import Hls from 'hls.js'
import { onBeforeUnmount, watch } from 'vue'

export function useHlsPlayer(videoElRef, masterUrlRef, onFatalError) {
  let hls = null

  function detach() {
    if (hls) {
      hls.destroy()
      hls = null
    }
    if (videoElRef.value) videoElRef.value.removeAttribute('src')
  }

  function attach() {
    const el = videoElRef.value
    const src = masterUrlRef.value
    if (!el || !src) return

    detach()

    if (el.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS (Safari, iOS).
      el.src = src
      return
    }

    if (!Hls.isSupported()) {
      onFatalError?.({ type: 'unsupported' })
      return
    }

    hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      backBufferLength: 30,
    })
    hls.loadSource(src)
    hls.attachMedia(el)
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (data.fatal) onFatalError?.(data)
    })
  }

  // Watch BOTH refs: the master URL may resolve before or after the
  // <video> element mounts. flush:'post' guarantees the DOM is patched
  // when we run, so videoElRef.value is the live element (not null).
  watch([videoElRef, masterUrlRef], attach, { flush: 'post' })
  onBeforeUnmount(detach)

  return { attach, detach }
}
