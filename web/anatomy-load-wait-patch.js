import { MedscanAnatomyViewer } from './anatomy-viewer.js';

const originalLoadSystem = MedscanAnatomyViewer.prototype.loadSystem;

MedscanAnatomyViewer.prototype.loadSystem = async function loadSystemWithWait(systemId) {
  if (this.layers.has(systemId)) return this.layers.get(systemId);

  if (this.loading.has(systemId)) {
    const startedAt = performance.now();
    while (this.loading.has(systemId) && performance.now() - startedAt < 15000) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return this.layers.get(systemId) ?? null;
  }

  return originalLoadSystem.call(this, systemId);
};
