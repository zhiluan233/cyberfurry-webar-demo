import * as THREE from 'three';
import type { VRMHumanBoneName } from '@pixiv/three-vrm';

/** Apply a visual adjustment after either the mixer or the procedural pose. */
export class ArmSpread {
  private readonly arms: { bone: THREE.Object3D; unadjusted: THREE.Quaternion; axis: THREE.Vector3 }[] = [];
  private readonly rotation = new THREE.Quaternion();
  private applied = false;
  private degrees = 0;

  constructor(getBone: (name: VRMHumanBoneName) => THREE.Object3D | null, basis: THREE.Quaternion) {
    for (const side of ['left', 'right'] as const) {
      const bone = getBone(`${side}UpperArm`);
      if (bone) {
        const axis = new THREE.Vector3(0, 0, side === 'left' ? 1 : -1).applyQuaternion(basis);
        this.arms.push({ bone, unadjusted: new THREE.Quaternion(), axis });
      }
    }
  }

  restore(): void {
    if (!this.applied) return;
    for (const { bone, unadjusted } of this.arms) bone.quaternion.copy(unadjusted);
    this.applied = false;
  }

  apply(): void {
    if (!this.degrees || this.applied) return;
    for (const { bone, unadjusted, axis } of this.arms) {
      unadjusted.copy(bone.quaternion);
      bone.quaternion.premultiply(this.rotation.setFromAxisAngle(axis, THREE.MathUtils.degToRad(this.degrees)));
    }
    this.applied = true;
  }

  set(degrees: number): void {
    this.restore();
    this.degrees = THREE.MathUtils.clamp(Number.isFinite(degrees) ? degrees : 0, 0, 40);
    this.apply();
  }
}
