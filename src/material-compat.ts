import * as THREE from 'three';
import { MToonMaterial } from '@pixiv/three-vrm';

/** Opt-out compatibility for legacy exporters that omit the textured shade slot.
 * Keep explicitly authored shade maps, colors, emission and all VRM 1 materials.
 * JMoF2025 original omits _ShadeTexture on all three materials; its test export
 * assigns _MainTex to _ShadeTexture. A missing slot otherwise samples white.
 */
export function setLegacyShadeCompatibility(scene: THREE.Object3D, enabled: boolean, legacyVRM: boolean): number {
  if (!legacyVRM) return 0;
  const materials = new Set<MToonMaterial>();
  scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material instanceof MToonMaterial) materials.add(material);
    }
  });
  let count = 0;
  for (const material of materials) {
    if (!material.map) continue;
    if (material.shadeMultiplyTexture === null && material.userData.legacyShadeFallback === undefined) {
      material.userData.legacyShadeFallback = true;
    }
    if (!material.userData.legacyShadeFallback) continue;
    material.shadeMultiplyTexture = enabled ? material.map : null;
    material.needsUpdate = true;
    count++;
  }
  return count;
}
