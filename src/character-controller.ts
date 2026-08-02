import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName } from '@pixiv/three-vrm';
import {
  VRMAnimationLoaderPlugin,
  createVRMAnimationClip,
  type VRMAnimation,
} from '@pixiv/three-vrm-animation';
import type { CollisionWorld, DemoConfig, MotionState, MovementMode } from './app-types';

type Toast = (message: string, error?: boolean) => void;

export class CharacterController {
  readonly root = new THREE.Group();
  readonly position = this.root.position;
  readonly joystick = new THREE.Vector2();
  mode: MovementMode = 'manual';
  snapshotTarget: THREE.Vector3 | null = null;
  loaded = false;
  grounded = false;
  motionState: MotionState = 'idle';

  private vrm: VRM | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private actions: Partial<Record<MotionState, THREE.AnimationAction>> = {};
  private currentAction: THREE.AnimationAction | null = null;
  private velocityY = 0;
  private capsuleDebug: THREE.LineSegments | null = null;
  private fallbackBones = new Map<VRMHumanBoneName, { node: THREE.Object3D; rest: THREE.Quaternion }>();
  private animationTime = 0;
  private readonly raycaster = new THREE.Raycaster();

  constructor(
    private readonly scene: THREE.Scene,
    readonly config: DemoConfig,
    private readonly toast: Toast,
  ) {
    this.root.name = 'VRM character root';
    this.scene.add(this.root);
    this.rebuildCapsuleDebug();
  }

  get capsuleRadius(): number { return this.config.character.capsule.radiusMeters; }
  get capsuleHeight(): number { return this.config.character.capsule.heightMeters; }

  async loadFile(file: File): Promise<void> {
    const objectUrl = URL.createObjectURL(file);
    try {
      const loader = new GLTFLoader();
      loader.register(parser => new VRMLoaderPlugin(parser));
      const gltf = await loader.loadAsync(objectUrl);
      const nextVrm = gltf.userData.vrm as VRM | undefined;
      if (!nextVrm) throw new Error('无效 VRM');

      if (this.vrm) {
        this.root.remove(this.vrm.scene);
        VRMUtils.deepDispose(this.vrm.scene);
      }

      this.vrm = nextVrm;
      VRMUtils.removeUnnecessaryVertices(nextVrm.scene);
      VRMUtils.combineSkeletons(nextVrm.scene);
      VRMUtils.rotateVRM0(nextVrm);
      nextVrm.scene.traverse(object => {
        object.frustumCulled = false;
        if (object instanceof THREE.Mesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });

      this.normalizeVisualSize(nextVrm.scene);
      this.root.add(nextVrm.scene);
      this.mixer = new THREE.AnimationMixer(nextVrm.scene);
      this.actions = {};
      this.currentAction = null;
      this.captureFallbackBonePose();
      await this.loadAnimations(nextVrm);
      this.loaded = true;
      this.setMotionState('idle', true);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  place(point: THREE.Vector3): void {
    this.position.copy(point);
    this.position.y += this.config.character.spawnLiftMeters;
    this.velocityY = 0;
    this.grounded = false;
    this.root.visible = true;
  }

  setMode(mode: MovementMode, cursor: THREE.Vector3 | null): void {
    this.mode = mode;
    this.snapshotTarget = mode === 'go-to' && cursor ? cursor.clone() : null;
  }

  jump(): void {
    if (!this.loaded || !this.grounded) return;
    this.velocityY = this.config.character.jumpVelocityMetersPerSecond;
    this.grounded = false;
    this.setMotionState('jump');
  }

  setCapsule(radius: number, height: number): void {
    this.config.character.capsule.radiusMeters = Math.min(radius, Math.max(0.1, height * 0.48));
    this.config.character.capsule.heightMeters = Math.max(height, radius * 2.05);
    this.rebuildCapsuleDebug();
  }

  setDebugVisible(visible: boolean): void {
    if (this.capsuleDebug) this.capsuleDebug.visible = visible;
  }

  update(
    deltaSeconds: number,
    camera: THREE.Camera,
    cursorPosition: THREE.Vector3 | null,
    collisionWorld: CollisionWorld,
  ): void {
    if (!this.loaded || !this.vrm) return;
    const delta = Math.min(deltaSeconds, 0.05);
    const moveDirection = this.resolveDesiredDirection(camera, cursorPosition);
    const moving = moveDirection.lengthSq() > 0.0001;
    if (moving) this.applyHorizontalMovement(moveDirection.normalize(), delta, collisionWorld);
    this.applyGravity(delta, collisionWorld);

    if (!this.grounded) this.setMotionState('jump');
    else this.setMotionState(moving ? 'walk' : 'idle');

    this.mixer?.update(delta);
    this.vrm.update(delta);
    this.animationTime += delta;
    if (!this.actions[this.motionState]) this.updateProceduralAnimation(delta);
    if (this.capsuleDebug) {
      this.capsuleDebug.position.set(this.position.x, this.position.y + this.capsuleHeight / 2, this.position.z);
      this.capsuleDebug.rotation.y = this.root.rotation.y;
    }
  }

  private resolveDesiredDirection(camera: THREE.Camera, cursorPosition: THREE.Vector3 | null): THREE.Vector3 {
    const manualMagnitude = this.joystick.length();
    if (manualMagnitude > 0.08) {
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
      forward.normalize();
      const right = new THREE.Vector3(-forward.z, 0, forward.x);
      return right.multiplyScalar(this.joystick.x).add(forward.multiplyScalar(-this.joystick.y));
    }

    let target: THREE.Vector3 | null = null;
    let stopDistance = this.config.character.arrivalDistanceMeters;
    if (this.mode === 'follow-player') {
      target = new THREE.Vector3();
      camera.getWorldPosition(target);
      stopDistance = this.config.character.followDistanceMeters;
    } else if (this.mode === 'follow-cursor') {
      target = cursorPosition;
    } else if (this.mode === 'go-to') {
      target = this.snapshotTarget;
    }

    if (!target) return new THREE.Vector3();
    const direction = target.clone().sub(this.position);
    direction.y = 0;
    if (direction.length() <= stopDistance) {
      if (this.mode === 'go-to') {
        this.snapshotTarget = null;
        this.mode = 'manual';
      }
      return new THREE.Vector3();
    }
    return direction;
  }

  private applyHorizontalMovement(direction: THREE.Vector3, delta: number, world: CollisionWorld): void {
    const distance = this.config.character.moveSpeedMetersPerSecond * delta;
    const movement = direction.clone().multiplyScalar(distance);
    if (!this.isBlocked(direction, distance, world.meshes)) this.position.add(movement);

    const desiredYaw = Math.atan2(direction.x, direction.z);
    let yawDifference = desiredYaw - this.root.rotation.y;
    yawDifference = Math.atan2(Math.sin(yawDifference), Math.cos(yawDifference));
    this.root.rotation.y += yawDifference * Math.min(1, this.config.character.turnSpeed * delta);
  }

  private isBlocked(direction: THREE.Vector3, distance: number, meshes: THREE.Mesh[]): boolean {
    if (!meshes.length) return false;
    const samples = [
      this.capsuleRadius * 1.05,
      this.capsuleHeight * 0.52,
      this.capsuleHeight - this.capsuleRadius * 1.05,
    ];
    const lateral = new THREE.Vector3(-direction.z, 0, direction.x).multiplyScalar(this.capsuleRadius * 0.72);
    for (const height of samples) {
      for (const offset of [-1, 0, 1]) {
        const origin = this.position.clone().add(new THREE.Vector3(0, height, 0)).addScaledVector(lateral, offset);
        this.raycaster.set(origin, direction);
        this.raycaster.near = 0;
        this.raycaster.far = distance + this.capsuleRadius;
        const hit = this.raycaster.intersectObjects(meshes, false)[0];
        if (!hit || !hit.face) continue;
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
        const normal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
        if (Math.abs(normal.y) < 0.72) return true;
      }
    }
    return false;
  }

  private applyGravity(delta: number, world: CollisionWorld): void {
    this.velocityY -= this.config.character.gravityMetersPerSecondSquared * delta;
    const nextY = this.position.y + this.velocityY * delta;
    const groundY = this.findGroundHeight(world.meshes);
    if (groundY !== null && nextY <= groundY + this.config.character.maxStepHeightMeters && this.velocityY <= 0) {
      this.position.y = groundY;
      this.velocityY = 0;
      this.grounded = true;
    } else {
      this.position.y = nextY;
      this.grounded = false;
    }
  }

  private findGroundHeight(meshes: THREE.Mesh[]): number | null {
    if (!meshes.length) return null;
    const origin = this.position.clone();
    origin.y += this.capsuleHeight + 0.5;
    this.raycaster.set(origin, new THREE.Vector3(0, -1, 0));
    this.raycaster.near = 0;
    this.raycaster.far = this.capsuleHeight + 3;
    for (const hit of this.raycaster.intersectObjects(meshes, false)) {
      if (!hit.face) continue;
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
      const normal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
      if (normal.y > 0.35 && hit.point.y <= this.position.y + this.config.character.maxStepHeightMeters + 0.05) return hit.point.y;
    }
    return null;
  }

  private normalizeVisualSize(scene: THREE.Object3D): void {
    scene.scale.setScalar(1);
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const height = Math.max(0.01, box.max.y - box.min.y);
    const scale = this.config.character.visualHeightMeters / height;
    scene.scale.setScalar(scale);
    scene.updateMatrixWorld(true);
    const scaledBox = new THREE.Box3().setFromObject(scene);
    scene.position.y -= scaledBox.min.y;
  }

  private async loadAnimations(vrm: VRM): Promise<void> {
    const loader = new GLTFLoader();
    loader.register(parser => new VRMAnimationLoaderPlugin(parser));
    const entries = Object.entries(this.config.animations) as Array<[MotionState, DemoConfig['animations'][MotionState]]>;
    const results = await Promise.allSettled(entries.map(async ([state, settings]) => {
      const gltf = await loader.loadAsync(settings.url);
      const animation = (gltf.userData.vrmAnimations as VRMAnimation[] | undefined)?.[0];
      if (!animation || !this.mixer) throw new Error(`${state} 动画文件无效`);
      const clip = createVRMAnimationClip(animation, vrm);
      const action = this.mixer.clipAction(clip);
      action.setLoop(settings.loop ? THREE.LoopRepeat : THREE.LoopOnce, settings.loop ? Infinity : 1);
      action.clampWhenFinished = !settings.loop;
      this.actions[state] = action;
    }));
    const loadedCount = results.filter(result => result.status === 'fulfilled').length;
    if (loadedCount < entries.length) this.toast(`已载入 ${loadedCount}/3 个 动画片段`);
  }

  private setMotionState(next: MotionState, force = false): void {
    if (!force && this.motionState === next) return;
    const previous = this.currentAction;
    this.motionState = next;
    const nextAction = this.actions[next] ?? null;
    if (nextAction && nextAction !== previous) {
      nextAction.reset().fadeIn(this.config.animations[next].fadeSeconds).play();
      previous?.fadeOut(this.config.animations[next].fadeSeconds);
      this.currentAction = nextAction;
    } else if (!nextAction) {
      previous?.fadeOut(0.12);
      this.currentAction = null;
    }
  }

  private captureFallbackBonePose(): void {
    this.fallbackBones.clear();
    if (!this.vrm) return;
    const names: VRMHumanBoneName[] = ['hips', 'chest', 'leftUpperArm', 'rightUpperArm', 'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg'];
    names.forEach(name => {
      const node = this.vrm?.humanoid.getNormalizedBoneNode(name);
      if (node) this.fallbackBones.set(name, { node, rest: node.quaternion.clone() });
    });
  }

  private updateProceduralAnimation(_delta: number): void {
    for (const { node, rest } of this.fallbackBones.values()) node.quaternion.copy(rest);
    const swing = Math.sin(this.animationTime * 9) * 0.5;
    const applyX = (name: VRMHumanBoneName, angle: number) => {
      const bone = this.fallbackBones.get(name);
      if (!bone) return;
      bone.node.quaternion.copy(bone.rest).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(angle, 0, 0)));
    };
    if (this.motionState === 'walk') {
      applyX('leftUpperLeg', swing);
      applyX('rightUpperLeg', -swing);
      applyX('leftUpperArm', -swing * 0.7);
      applyX('rightUpperArm', swing * 0.7);
      applyX('leftLowerLeg', Math.max(0, -swing) * 0.55);
      applyX('rightLowerLeg', Math.max(0, swing) * 0.55);
    } else if (this.motionState === 'jump') {
      applyX('leftUpperLeg', -0.35);
      applyX('rightUpperLeg', -0.35);
      applyX('leftUpperArm', -1.2);
      applyX('rightUpperArm', -1.2);
    } else {
      applyX('chest', Math.sin(this.animationTime * 1.7) * 0.025);
      applyX('leftUpperArm', 0.05 + Math.sin(this.animationTime * 1.7) * 0.02);
      applyX('rightUpperArm', 0.05 - Math.sin(this.animationTime * 1.7) * 0.02);
    }
  }

  private rebuildCapsuleDebug(): void {
    if (this.capsuleDebug) {
      this.scene.remove(this.capsuleDebug);
      this.capsuleDebug.geometry.dispose();
      (this.capsuleDebug.material as THREE.Material).dispose();
    }
    const cylinderLength = Math.max(0.01, this.capsuleHeight - this.capsuleRadius * 2);
    const geometry = new THREE.CapsuleGeometry(this.capsuleRadius, cylinderLength, 5, 10);
    const wireframe = new THREE.WireframeGeometry(geometry);
    geometry.dispose();
    this.capsuleDebug = new THREE.LineSegments(wireframe, new THREE.LineBasicMaterial({ color: 0x6dffbd, transparent: true, opacity: 0.82 }));
    this.capsuleDebug.name = 'Character collision capsule';
    this.capsuleDebug.visible = false;
    this.scene.add(this.capsuleDebug);
  }
}
