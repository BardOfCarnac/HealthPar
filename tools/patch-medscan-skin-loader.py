"""Deterministically switch Medscan's exterior shell loader to the local GLB.

The generated Z-Anatomy exterior is a local GLB, so Medscan should use the
viewer's existing GLTFLoader rather than importing/parsing FBX at runtime.
The patch is idempotent: a rebuild validates an already-patched loader instead
of failing simply because the desired code is already present.
"""

from __future__ import annotations

from pathlib import Path
import sys


LOCAL_URL = "const BODY_SHELL_URL = './assets/z-anatomy-skin.glb';"
HELPER_MARKER = "async function getSkeletonLayerForShell(timeoutMs = 15000) {"
GLTF_LOAD_MARKER = "const gltf = await viewer.loader.loadAsync(BODY_SHELL_URL);"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected exactly one {label}; found {count}")
    return text.replace(old, new, 1)


def validate_patched(text: str) -> None:
    required = [LOCAL_URL, HELPER_MARKER, GLTF_LOAD_MARKER]
    missing = [marker for marker in required if marker not in text]
    if missing:
        raise RuntimeError(f"Medscan skin loader is partially patched; missing: {missing}")
    if "FBXLoader" in text:
        raise RuntimeError("Medscan skin loader still contains an FBXLoader reference")


def main() -> None:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "web/anatomy-bootstrap.js")
    text = path.read_text(encoding="utf-8")

    if LOCAL_URL in text:
        validate_patched(text)
        print(f"Validated {path}: already using local GLB + in-flight skeleton wait")
        return

    # The viewer already owns a GLTFLoader. Remove the separate runtime FBX
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
        LOCAL_URL,
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

    validate_patched(text)
    path.write_text(text, encoding="utf-8")
    print(f"Patched {path}: local GLB loader + in-flight skeleton wait")


if __name__ == "__main__":
    main()
