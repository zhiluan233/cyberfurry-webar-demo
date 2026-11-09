import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { CrawlContact, FootSupport } from './locomotion';

const SIDES = ['left', 'right'] as const;

function sampleRegion(
  meshes: readonly THREE.SkinnedMesh[],
  matchesBone: (bone: THREE.Bone) => boolean,
  matchesPoint: (point: THREE.Vector3) => boolean,
): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const point = new THREE.Vector3();
  for (const mesh of meshes) {
    const indices = mesh.geometry.getAttribute('skinIndex');
    const weights = mesh.geometry.getAttribute('skinWeight');
    if (!indices || !weights) continue;
    const selected = mesh.skeleton.bones.map(matchesBone);
    if (!selected.includes(true)) continue;
    for (let vertex = 0; vertex < indices.count; vertex++) {
      let influence = 0;
      for (let channel = 0; channel < 4; channel++) {
        if (selected[indices.getComponent(vertex, channel)]) influence += weights.getComponent(vertex, channel);
      }
      if (influence < 0.35) continue;
      mesh.getVertexPosition(vertex, point).applyMatrix4(mesh.matrixWorld);
      if (matchesPoint(point)) points.push(point.clone());
    }
  }
  return points;
}

export function sampleRigContacts(vrm: VRM): { feet: FootSupport[]; crawl: CrawlContact[]; soleY: number | null } {
  const { humanoid } = vrm;
  const meshes: THREE.SkinnedMesh[] = [];
  vrm.scene.updateWorldMatrix(true, false);
  vrm.scene.updateMatrixWorld(true);
  vrm.scene.traverse(node => {
    if (node instanceof THREE.SkinnedMesh && ![node.material].flat().every(material => 'isOutline' in material && material.isOutline)) meshes.push(node);
  });
  const feet: FootSupport[] = [];
  const crawl: CrawlContact[] = [];
  let lowest = Infinity;
  for (const side of SIDES) {
    const foot = humanoid.getRawBoneNode(`${side}Foot`);
    const toes = humanoid.getRawBoneNode(`${side}Toes`);
    const normalizedFoot = humanoid.getNormalizedBoneNode(`${side}Foot`);
    if (foot && normalizedFoot) {
      const ankle = foot.getWorldPosition(new THREE.Vector3());
      const samples = sampleRegion(meshes, bone => bone === foot || bone === toes, point => point.y <= ankle.y + 0.08);
      if (samples.length >= 4) {
        const minY = samples.reduce((minimum, point) => Math.min(minimum, point.y), Infinity);
        const bottom = samples.filter(point => point.y <= minY + 0.004);
        const sole = bottom.reduce((mean, point) => mean.add(point), new THREE.Vector3()).divideScalar(bottom.length);
        sole.y = minY;
        const axis = toes?.getWorldPosition(new THREE.Vector3()).sub(ankle) ?? new THREE.Vector3();
        axis.y = 0;
        if (axis.lengthSq() < 0.0001) axis.set(0, 0, 1);
        axis.normalize();
        const nearSole = samples.filter(point => point.y <= minY + 0.018);
        const distances = nearSole.map(point => point.dot(axis));
        const min = distances.reduce((a, b) => Math.min(a, b), Infinity);
        const max = distances.reduce((a, b) => Math.max(a, b), -Infinity);
        const edge = (max - min) * 0.2;
        const front = nearSole.filter((_, index) => distances[index] >= max - edge);
        const back = nearSole.filter((_, index) => distances[index] <= min + edge);
        const forefoot = front.reduce((mean, point) => mean.add(point), new THREE.Vector3()).divideScalar(front.length);
        const heel = back.reduce((mean, point) => mean.add(point), new THREE.Vector3()).divideScalar(back.length);
        feet.push({
          side,
          local: normalizedFoot.worldToLocal(sole),
          forefootLocal: normalizedFoot.worldToLocal(forefoot),
          heelLocal: normalizedFoot.worldToLocal(heel),
        });
        lowest = Math.min(lowest, minY);
      }
    }

    for (const kind of ['Hand', 'LowerLeg'] as const) {
      const raw = humanoid.getRawBoneNode(`${side}${kind}`);
      const normalized = humanoid.getNormalizedBoneNode(`${side}${kind}`);
      if (!raw || !normalized) continue;
      const center = raw.getWorldPosition(new THREE.Vector3());
      const normal = new THREE.Vector3(0, 0, 1);
      let radius = 0.12;
      if (kind === 'Hand') {
        const index = humanoid.getRawBoneNode(`${side}IndexProximal`);
        const little = humanoid.getRawBoneNode(`${side}LittleProximal`);
        if (!index || !little) continue;
        const a = index.getWorldPosition(new THREE.Vector3());
        const b = little.getWorldPosition(new THREE.Vector3());
        const fingers = a.clone().add(b).multiplyScalar(0.5).sub(center);
        const thumb = humanoid.getRawBoneNode(`${side}ThumbProximal`) ?? humanoid.getRawBoneNode(`${side}ThumbDistal`);
        const across = thumb ? thumb.getWorldPosition(new THREE.Vector3()).sub(center) : a.sub(b);
        normal.crossVectors(fingers, across).multiplyScalar(side === 'left' ? 1 : -1).normalize();
        if (!normal.lengthSq()) continue;
        center.addScaledVector(fingers, 0.45);
        radius = THREE.MathUtils.clamp(fingers.length() * 0.85, 0.025, 0.09);
      }
      const samples = sampleRegion(meshes, bone => {
        if (kind === 'LowerLeg') return bone === raw || bone === raw.parent;
        for (let parent: THREE.Object3D | null = bone; parent; parent = parent.parent) if (parent === raw) return true;
        return false;
      }, point => point.distanceToSquared(center) <= radius * radius);
      let contact: THREE.Vector3 | undefined;
      let furthest = -Infinity;
      for (const point of samples) {
        const projection = point.dot(normal);
        if (projection > furthest) { contact = point; furthest = projection; }
      }
      if (contact) crawl.push({ side, kind: kind === 'Hand' ? 'palm' : 'knee', local: normalized.worldToLocal(contact) });
    }
  }
  return { feet, crawl, soleY: Number.isFinite(lowest) ? lowest : null };
}
