import { useEffect, useRef, useState } from 'react'
import type { FeatureCollection } from 'geojson'
import {
  prepareGlobeFeatures,
  projectGlobe,
  type GlobeCamera,
  type GlobeFrame,
  type GlobeWorkerReply,
  type GlobeWorkerRequest,
} from './globeGeometry'

/** Keep one projection in flight; skip obsolete camera positions instead of queuing frames. */
export function useGlobeFrame(world: FeatureCollection | null, camera: GlobeCamera) {
  const [frame, setFrame] = useState<GlobeFrame | null>(null)
  const latest = useRef(camera)
  latest.current = camera
  const send = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!world) return
    let worker: Worker | null = null
    let disposed = false
    let busy = false
    let sequence = 0
    let requested: GlobeCamera | null = null
    let fallback: ReturnType<typeof prepareGlobeFeatures> | null = null

    function useFallback() {
      if (disposed || fallback) return
      worker?.terminate()
      worker = null
      busy = false
      requested = null
      fallback = prepareGlobeFeatures(world!)
      request()
    }

    function request() {
      if (disposed || busy || requested === latest.current) return
      const current = latest.current
      requested = current
      if (fallback) {
        setFrame(projectGlobe(fallback, current))
        return
      }
      busy = true
      const message: GlobeWorkerRequest = { type: 'camera', sequence: ++sequence, ...current }
      try {
        worker!.postMessage(message)
      } catch {
        useFallback()
      }
    }

    send.current = request
    try {
      worker = new Worker(new URL('./globe.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (event: MessageEvent<GlobeWorkerReply>) => {
        if (disposed || fallback || event.data.sequence !== sequence) return
        busy = false
        setFrame(event.data.frame)
        request()
      }
      worker.onerror = (event) => {
        event.preventDefault()
        useFallback()
      }
      worker.onmessageerror = useFallback
      worker.postMessage({ type: 'world', world } satisfies GlobeWorkerRequest)
      request()
    } catch {
      useFallback()
    }
    return () => {
      disposed = true
      worker?.terminate()
      send.current = null
    }
  }, [world])

  useEffect(() => send.current?.(), [camera])
  return frame
}
