import * as THREE from 'three';

export const FIRST_PERSON_LAYER = 9;
export const THIRD_PERSON_LAYER = 10;

export class PreviewCamera {
  private readonly lastPosition = new THREE.Vector3();
  private readonly translation = new THREE.Vector3();
  private savedView: { position: THREE.Vector3; rotation: THREE.Quaternion; fov: number; near: number } | null = null;
  private yaw = 0;
  private pitch = 0;

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    camera.layers.enable(THIRD_PERSON_LAYER);
  }

  get firstPerson(): boolean { return this.savedView !== null; }

  // Player-dependent behaviors keep the observer instead of chasing the actor's head.
  get observerPosition(): THREE.Vector3 | undefined { return this.savedView?.position; }

  rebaseFollow(position: THREE.Vector3): void {
    this.lastPosition.copy(position);
  }

  follow(position: THREE.Vector3, target: THREE.Vector3): void {
    this.translation.subVectors(position, this.lastPosition);
    this.camera.position.add(this.translation);
    target.add(this.translation);
    this.rebaseFollow(position);
  }

  enterFirstPerson(): void {
    if (this.savedView) return;
    const camera = this.camera;
    this.savedView = { position: camera.position.clone(), rotation: camera.quaternion.clone(), fov: camera.fov, near: camera.near };
    camera.layers.enable(FIRST_PERSON_LAYER);
    camera.layers.disable(THIRD_PERSON_LAYER);
    camera.fov = 75;
    camera.near = 0.015;
    camera.updateProjectionMatrix();
    this.resetLook();
  }

  exitFirstPerson(): void {
    if (!this.savedView) return;
    const camera = this.camera;
    camera.position.copy(this.savedView.position);
    camera.quaternion.copy(this.savedView.rotation);
    camera.fov = this.savedView.fov;
    camera.near = this.savedView.near;
    camera.layers.disable(FIRST_PERSON_LAYER);
    camera.layers.enable(THIRD_PERSON_LAYER);
    camera.updateProjectionMatrix();
    this.savedView = null;
  }

  resetLook(): void { this.yaw = 0; this.pitch = 0; }

  look(deltaX: number, deltaY: number): void {
    this.yaw -= deltaX * 0.004;
    this.pitch = THREE.MathUtils.clamp(this.pitch - deltaY * 0.004, -1.48, 1.3);
  }

  updateFirstPerson(head: THREE.Vector3, heading: number, forward: number, height: number): void {
    this.camera.position.copy(head);
    this.camera.position.x += Math.sin(heading) * forward;
    this.camera.position.z += Math.cos(heading) * forward;
    this.camera.position.y += height;
    this.camera.rotation.set(this.pitch, Math.PI + heading + this.yaw, 0, 'YXZ');
  }
}
