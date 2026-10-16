import {
  prepareGlobeFeatures,
  projectGlobe,
  type GlobeWorkerRequest,
  type GlobeWorkerReply,
} from './globeGeometry'

let prepared: ReturnType<typeof prepareGlobeFeatures> = []
self.onmessage = (event: MessageEvent<GlobeWorkerRequest>) => {
  const request = event.data
  if (request.type === 'world') {
    prepared = prepareGlobeFeatures(request.world)
    return
  }
  const reply: GlobeWorkerReply = {
    sequence: request.sequence,
    frame: projectGlobe(prepared, { rotation: request.rotation, zoom: request.zoom }),
  }
  self.postMessage(reply)
}
