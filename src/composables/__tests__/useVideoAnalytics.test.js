import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { useVideoAnalytics } from '../useVideoAnalytics.js'
import { supabase } from '@/lib/supabase.js'

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function mountComposable(props) {
  let result
  const TestComponent = defineComponent({
    setup() {
      result = useVideoAnalytics(props)
      return () => h('div')
    },
  })
  const wrapper = mount(TestComponent)
  await flushPromises()
  return { result, wrapper }
}

describe('useVideoAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('navigator', {
      ...navigator,
      sendBeacon: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not emit when disabled', async () => {
    const { result } = await mountComposable({
      leccionId: 'l1',
      cursoId: 'c1',
      videoId: 'v1',
      enabled: false,
    })

    result.emit('play', 5)
    expect(result.events.value).toHaveLength(0)
  })

  it('startTracking requires video element', async () => {
    const { result } = await mountComposable({
      leccionId: 'l1',
      cursoId: 'c1',
      videoId: 'v1',
      enabled: true,
    })

    expect(() => result.startTracking(null)).toThrow('video element')
    expect(() => result.startTracking(undefined)).toThrow('video element')
  })

  it('batch sends events to Edge Function', async () => {
    const { result } = await mountComposable({
      leccionId: 'l1',
      cursoId: 'c1',
      videoId: 'v1',
      enabled: true,
    })

    result.emit('play', 5)
    result.emit('pause', 10)

    await result.sendBatch()

    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1)
    expect(supabase.functions.invoke).toHaveBeenCalledWith('video-analytics', {
      body: {
        events: expect.arrayContaining([
          expect.objectContaining({ evento: 'play', tiempo_video: 5 }),
          expect.objectContaining({ evento: 'pause', tiempo_video: 10 }),
        ]),
      },
    })
  })
})
