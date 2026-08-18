"""One-time deterministic patch for the Medscan shell loader.

The generated Z-Anatomy exterior is a local GLB, so Medscan should use the
viewer's existing GLTFLoader rather than importing/parsing FBX at runtime.
This script is intentionally strict: it fails if the expected old code is not
present, preventing a silent half-applied build.
"""

from __future__ import annotations

from pathlib import Path
import sys


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected exactly one {label}; found {count}")
    return text.replace(old, new, 1)


def main() -> None:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "web/anatomy-bootstrap.js")
    text = path.read_text(encoding="utf-8")

    # The viewer already owns a GLTFLoader.  Remove the separate runtime FBX
    # dependency entirely.
    text = replace_once(
        text,
        "import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';\n",
        "",
        "FBXLoader import",
    )

    text = replace_once(
        text,
        "const BODY_SHELL_URL = 'https://cdn.jsdelivr.net/gh/LluisV/Z-Anatomy@6c7f9016bd5899ac8edafd31b9900c151df42ed6/Resources/Models/FBX/Regions%20of%20human%20body100.fbx';",
        "const BODY_SHELL_URL = './assets/z-anatomy-skin.glb';",
        "external shell URL",
    )

    anchor = "async function loadScanShell() {\n"
    helper = """async function getSkeletonLayerForShell(timeoutMs = 15000) {
  if (!viewer) return null;
  const existing = viewer.layers.get(SKELETON_ID);
  if (existing) return existing;

  // The viewer constructor starts the skeletal load immediately. loadSystem()
  // returns null if that same system is already in flight, so wait for the
  // existing request instead of treating null as a missing skeleton.
  const direct = await viewer.loadSystem(SKELETON_ID);
  if (direct) return direct;

  const started = performance.now();
  while (viewer.loading.has(SKELETON_ID) && performance.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return viewer.layers.get(SKELETON_ID) ?? null;
}

async function loadScanShell() {
"""
    text = replace_once(text, anchor, helper, "loadScanShell anchor")

    old_load = """    const skeletonLayer = await viewer.loadSystem(SKELETON_ID);
    if (!skeletonLayer) {
      setShellStatus('skeleton-unavailable');
      return;
    }

    const shell = await new FBXLoader().loadAsync(BODY_SHELL_URL);
    const registration = fitShellToSkeleton(shell, skeletonLayer);
"""
    new_load = """    const skeletonLayer = await getSkeletonLayerForShell();
    if (!skeletonLayer) {
      setShellStatus('skeleton-unavailable', 'Timed out waiting for the skeletal layer');
      return;
    }

    const gltf = await viewer.loader.loadAsync(BODY_SHELL_URL);
    const shell = gltf.scene;
    shell.traverse((child) => { child.visible = true; });
    const registration = fitShellToSkeleton(shell, skeletonLayer);
"""
    text = replace_once(text, old_load, new_load, "runtime FBX shell load")

    path.write_text(text, encoding="utf-8")
    print(f"Patched {path}: local GLB loader + in-flight skeleton wait")


if __name__ == "__main__":
    main()
