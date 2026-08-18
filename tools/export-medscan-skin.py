"""Export the pinned Z-Anatomy exterior/regions FBX to a browser-ready GLB.

Run inside Blender:
  blender --background --python tools/export-medscan-skin.py -- SOURCE.fbx OUTPUT.glb

The source is the Z-Anatomy `Regions of human body100.fbx` model.  It is the
same source system used as the skin layer by other Z-Anatomy browser viewers.
No pose adjustment or non-uniform reshaping is performed here: the export only
bakes the FBX scene transforms into glTF's coordinate convention and combines
the region meshes into one low-draw-call shell.
"""

from __future__ import annotations

import os
import sys

import bpy
import mathutils


PINNED_SOURCE = (
    "LluisV/Z-Anatomy@6c7f9016bd5899ac8edafd31b9900c151df42ed6/"
    "Resources/Models/FBX/Regions of human body100.fbx"
)


def args_after_separator() -> list[str]:
    argv = list(sys.argv)
    if "--" not in argv:
        raise SystemExit("Expected SOURCE.fbx and OUTPUT.glb after --")
    args = argv[argv.index("--") + 1 :]
    if len(args) != 2:
        raise SystemExit("Usage: blender --background --python SCRIPT -- SOURCE.fbx OUTPUT.glb")
    return args


def world_bounds(objects):
    mn = mathutils.Vector((1e30, 1e30, 1e30))
    mx = mathutils.Vector((-1e30, -1e30, -1e30))
    for obj in objects:
        for corner in obj.bound_box:
            p = obj.matrix_world @ mathutils.Vector(corner)
            for axis in range(3):
                mn[axis] = min(mn[axis], p[axis])
                mx[axis] = max(mx[axis], p[axis])
    return mn, mx, mx - mn


def main() -> None:
    source, output = args_after_separator()
    source = os.path.abspath(source)
    output = os.path.abspath(output)
    os.makedirs(os.path.dirname(output), exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=source)

    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError("Z-Anatomy exterior FBX contained no mesh geometry")

    # Z-Anatomy files can carry authoring-time visibility state.  For Medscan the
    # exported exterior is explicitly presentation geometry, so all region meshes
    # belong in the shell regardless of their original viewport visibility flag.
    for obj in meshes:
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.hide_render = False

    mn, mx, size = world_bounds(meshes)
    print(f"Imported {len(meshes)} exterior meshes")
    print(f"Source bounds min={tuple(round(v, 5) for v in mn)} max={tuple(round(v, 5) for v in mx)}")
    print(f"Source size={tuple(round(v, 5) for v in size)}")

    # Join without changing world-space geometry.  This keeps the silhouette but
    # avoids hundreds of transparent draw calls on mobile.
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    shell = bpy.context.view_layer.objects.active
    shell.name = "medscan_zanatomy_skin"
    shell["source"] = PINNED_SOURCE
    shell["license"] = "CC BY-SA 4.0; source models include BodyParts3D CC BY-SA 2.1 Japan"
    shell["purpose"] = "Medscan translucent registered body envelope"

    # Materials are replaced by Medscan at runtime, so remove source slots and
    # export geometry only.  We deliberately do not decimate on the first pass:
    # correctness of registration matters more than shaving a small source asset.
    shell.data.materials.clear()

    bpy.ops.object.select_all(action="DESELECT")
    shell.select_set(True)
    bpy.context.view_layer.objects.active = shell

    bpy.ops.export_scene.gltf(
        filepath=output,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_normals=True,
        export_extras=True,
    )

    if not os.path.exists(output) or os.path.getsize(output) < 1024:
        raise RuntimeError("GLB export did not produce a valid output file")
    print(f"Wrote {output} ({os.path.getsize(output) / 1_000_000:.2f} MB)")


if __name__ == "__main__":
    main()
