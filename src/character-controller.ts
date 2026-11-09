import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName } from '@pixiv/three-vrm';
import {
  VRMAnimationLoaderPlugin,
  createVRMAnimationClip,
  VRMLookAtQuaternionProxy,
  type VRMAnimation,
} from '@pixiv/three-vrm-animation';
import { Navigator, type NavigationMode } from './navigation';
import { BehaviorPlanner } from './behaviors';
import { ProceduralLocomotion, LOCOMOTION_STYLES, type FootSurface, type FootSupport, type LocomotionStyle } from './locomotion';
import { setLegacyShadeCompatibility } from './material-compat';
import type { CollisionWorld, DemoConfig, MotionState, MovementMode } from './app-types';
import { ArmSpread } from './arm-spread';
import { FIRST_PERSON_LAYER, THIRD_PERSON_LAYER } from './preview-camera';
import { sampleRigContacts } from './rig-contacts';

type GetBone = (name: VRMHumanBoneName) => THREE.Object3D | null;
type PreviewRigFactory = () => { scene: THREE.Group; getBone: GetBone };

type Toast = (message: string, error?: boolean) => void;

export class CharacterController {
  readonly root = new THREE.Group();
  readonly position = this.root.position;
  readonly joystick = new THREE.Vector2();
  mode: MovementMode = 'manual';
  readonly navigator = new Navigator();
  private readonly behavior = new BehaviorPlanner();
  locomotionStyle: LocomotionStyle = 'default';
  proceduralBounceEnabled = false;
  activity = '待命';
  manipulating = false;
  shadeCompatibility = true;
  repairedMaterialCount = 0;
  private procedural: ProceduralLocomotion | null = null;
  private armSpread: ArmSpread | null = null;
  private armSpreadDegrees = 0;
  private demoScene: THREE.Group | null = null;
  private route: { points: THREE.Vector3[]; index: number; traversal: 'ground' | 'ladder' | 'swim' } | null = null;
  private completedRoute = false;
  private movementIntent = false;
  private cursorMovementIntent = false;
  private intentInitialized = false;
  private manipulationOrigin: THREE.Vector3 | null = null;
  private worldMeshes: THREE.Mesh[] = [];
  loaded = false;
  grounded = false;
  motionState: MotionState = 'idle';

  private vrm: VRM | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private actions: Partial<Record<MotionState, THREE.AnimationAction>> = {};
  private currentAction: THREE.AnimationAction | null = null;
  private previewAction: THREE.AnimationAction | null = null;
  previewFileName: string | null = null;
  private velocityY = 0;
  private capsuleDebug: THREE.LineSegments | null = null;
  private readonly raycaster = new THREE.Raycaster();

  constructor(
    private readonly scene: THREE.Scene,
    readonly config: DemoConfig,
    private readonly toast: Toast,
  ) {
    this.root.name = 'VRM character root';
    this.scene.add(this.root);
    this.rebuildCapsuleDebug();
    this.root.visible = false;
  }

  get capsuleRadius(): number { return this.config.character.capsule.radiusMeters; }
  get capsuleHeight(): number { return this.config.character.capsule.heightMeters; }
  get hasVRM(): boolean { return this.vrm !== null; }
  get navigationMode(): NavigationMode { return this.navigator.mode; }
  get routeActive(): boolean { return this.route !== null; }
  get effectiveHeight(): number {
    const scale = LOCOMOTION_STYLES.find(style => style.id === this.locomotionStyle)?.capsuleScale ?? 1;
    return Math.max(this.capsuleRadius * 2.05, this.capsuleHeight * scale);
  }
  get previewing(): boolean { return this.previewAction !== null; }
  get previewPaused(): boolean { return this.previewAction?.paused ?? false; }

  getFirstPersonHead(target: THREE.Vector3): THREE.Vector3 | null {
    return this.vrm?.humanoid.getRawBoneNode('head')?.getWorldPosition(target) ?? null;
  }

  setArmSpread(degrees: number): void {
    this.armSpreadDegrees = degrees;
    this.armSpread?.set(degrees);
    this.vrm?.humanoid.update();
  }

  async loadFile(file: File): Promise<void> {
    const objectUrl = URL.createObjectURL(file);
    try {
      const loader = new GLTFLoader();
      loader.register(parser => new VRMLoaderPlugin(parser));
      const gltf = await loader.loadAsync(objectUrl);
      const nextVrm = gltf.userData.vrm as VRM | undefined;
      if (!nextVrm) throw new Error('无效 VRM');

      this.stopAnimationPreview();
      this.loaded = false;
      this.mixer?.stopAllAction();
      if (this.vrm) {
        this.mixer?.uncacheRoot(this.vrm.scene);
        this.root.remove(this.vrm.scene);
        VRMUtils.deepDispose(this.vrm.scene);
      }

      if (this.demoScene) { this.root.remove(this.demoScene); VRMUtils.deepDispose(this.demoScene); this.demoScene = null; }
      this.vrm = nextVrm;
      this.repairedMaterialCount = setLegacyShadeCompatibility(nextVrm.scene, this.shadeCompatibility, nextVrm.meta?.metaVersion === '0');
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
      const contacts = sampleRigContacts(nextVrm);
      if (contacts.soleY !== null) nextVrm.scene.position.y -= contacts.soleY;
      nextVrm.firstPerson?.setup({ firstPersonOnlyLayer: FIRST_PERSON_LAYER, thirdPersonOnlyLayer: THIRD_PERSON_LAYER });
      if (nextVrm.lookAt) {
        const lookAtProxy = new VRMLookAtQuaternionProxy(nextVrm.lookAt);
        lookAtProxy.name = 'lookAtQuaternionProxy';
        nextVrm.scene.add(lookAtProxy);
      }
      this.root.add(nextVrm.scene);
      this.mixer = new THREE.AnimationMixer(nextVrm.scene);
      this.actions = {};
      this.currentAction = null;
      this.initializePose(name => nextVrm.humanoid.getNormalizedBoneNode(name), contacts.feet);
      this.procedural?.configureCrawlContacts(contacts.crawl);
      await this.loadAnimations(nextVrm);
      this.loaded = true;
      this.setMotionState('idle', true);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  async previewAnimationFile(file: File): Promise<void> {
    const vrm = this.vrm;
    const mixer = this.mixer;
    if (!this.loaded || !vrm || !mixer) throw new Error('请先载入 VRM 角色');
    if (!file.name.toLowerCase().endsWith('.vrma')) throw new Error('请选择 .vrma 动画文件');

    const objectUrl = URL.createObjectURL(file);
    try {
      const loader = new GLTFLoader();
      loader.register(parser => new VRMAnimationLoaderPlugin(parser));
      const gltf = await loader.loadAsync(objectUrl);
      const animation = (gltf.userData.vrmAnimations as VRMAnimation[] | undefined)?.[0];
      if (!animation) throw new Error('文件中没有有效的 VRMA 动画');
      if (this.vrm !== vrm || this.mixer !== mixer || !this.loaded) {
        throw new Error('角色已更换，请重新选择动画');
      }
      const clip = createVRMAnimationClip(animation, vrm);
      if (!clip.tracks.length || !Number.isFinite(clip.duration) || clip.duration <= 0) {
        throw new Error('动画没有可用于当前角色的有效轨道');
      }

      // Replace only after validation so a bad file leaves the current preview playing.
      this.armSpread?.restore();
      this.stopAnimationPreview();
      mixer.stopAllAction();
      this.currentAction = null;
      vrm.humanoid.resetNormalizedPose();
      this.previewAction = mixer.clipAction(clip);
      this.previewAction.setLoop(THREE.LoopRepeat, Infinity).reset().play();
      this.previewFileName = file.name;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  toggleAnimationPreview(): void {
    if (this.previewAction) this.previewAction.paused = !this.previewAction.paused;
  }

  stopAnimationPreview(): void {
    if (!this.previewAction) return;
    this.armSpread?.restore();
    const clip = this.previewAction.getClip();
    this.previewAction.stop();
    this.mixer?.uncacheClip(clip);
    this.previewAction = null;
    this.previewFileName = null;
    this.setMotionState(this.motionState, true);
  }

  place(point: THREE.Vector3): void {
    this.position.copy(point);
    this.position.y += this.config.character.spawnLiftMeters;
    this.velocityY = 0;
    this.grounded = false;
    this.navigator.reset();
    this.root.visible = true;
  }

  useDemoCharacter(factory: PreviewRigFactory): void {
    this.stopAnimationPreview();
    this.mixer?.stopAllAction();
    if (this.vrm) { this.root.remove(this.vrm.scene); VRMUtils.deepDispose(this.vrm.scene); }
    if (this.demoScene) { this.root.remove(this.demoScene); VRMUtils.deepDispose(this.demoScene); }
    this.vrm = null; this.mixer = null; this.actions = {}; this.currentAction = null;
    const demo = factory();
    this.normalizeVisualSize(demo.scene);
    this.demoScene = demo.scene;
    this.root.add(demo.scene);
    this.initializePose(demo.getBone);
    this.loaded = true;
    this.root.visible = true;
    this.repairedMaterialCount = 0;
  }

  private initializePose(getBone: GetBone, feet: FootSupport[] = []): void {
    this.procedural = new ProceduralLocomotion(getBone);
    this.procedural.configureGrounding(feet, () => this.position.y, point => this.findFootSurface(point));
    this.armSpread = new ArmSpread(getBone, this.procedural.basis);
    this.armSpread.set(this.armSpreadDegrees);
  }

  setShadeCompatibility(enabled: boolean): void {
    this.shadeCompatibility = enabled;
    if (this.vrm) this.repairedMaterialCount = setLegacyShadeCompatibility(this.vrm.scene, enabled, this.vrm.meta?.metaVersion === '0');
  }

  setNavigationMode(mode: NavigationMode): void { this.navigator.mode = mode; this.navigator.reset(); }

  setLocomotion(style: LocomotionStyle): void {
    const nextHeight = this.capsuleHeight * (LOCOMOTION_STYLES.find(item => item.id === style)?.capsuleScale ?? 1);
    if (nextHeight > this.effectiveHeight && !this.hasHeadroom(this.position, nextHeight, this.worldMeshes)) {
      this.toast('头顶空间不足，请先离开低矮通道再起身', true);
      return;
    }
    this.locomotionStyle = style;
    this.navigator.reset();
    this.setMotionState(this.motionState, true);
  }

  setMode(mode: MovementMode, cursor: THREE.Vector3 | null): void {
    this.cancelRoute();
    this.mode = mode;
    this.behavior.setMode(mode, this.position, cursor);
    this.navigator.reset();
    this.movementIntent = false;
    this.cursorMovementIntent = false;
    this.intentInitialized = false;
  }

  startRoute(points: THREE.Vector3[], traversal: 'ground' | 'ladder' | 'swim' = 'ground'): void {
    if (points.length < 2) return;
    this.setMode('manual', null);
    this.position.copy(points[0]);
    this.velocityY = 0;
    this.grounded = true;
    this.route = { points: points.map(point => point.clone()), index: 1, traversal };
    const facingPoint = points.find(point => Math.hypot(point.x - points[0].x, point.z - points[0].z) > 0.01);
    if (facingPoint) this.turnToward(facingPoint.clone().sub(points[0]), 1);
    this.root.visible = true;
  }

  cancelRoute(): void { this.route = null; this.completedRoute = false; this.navigator.reset(); }

  beginManipulation(): void {
    if (this.manipulating) return;
    this.manipulationOrigin = this.position.clone();
    this.manipulating = true;
    this.velocityY = 0;
  }

  endManipulation(): void {
    this.manipulating = false;
    this.manipulationOrigin = null;
    this.velocityY = 0;
    this.grounded = false;
    this.navigator.reset();
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

  update(deltaSeconds: number, camera: THREE.Camera, cursorPosition: THREE.Vector3 | null, world: CollisionWorld, observer?: THREE.Vector3): void {
    if (!this.loaded) return;
    this.worldMeshes = world.meshes;
    const delta = Math.min(Math.max(deltaSeconds, 0), 0.05);
    const speed = Math.max(0, this.config.character.moveSpeedMetersPerSecond)
      * (LOCOMOTION_STYLES.find(style => style.id === this.locomotionStyle)?.speedMultiplier ?? 1);
    // Dragging freezes task progression as well as physics, while the last desired gait keeps playing.
    if (!this.manipulating || !this.intentInitialized) {
      const intentPosition = this.manipulationOrigin ?? this.position;
      const manualInput = this.joystick.length() > 0.08;
      if (manualInput) { this.completedRoute = false; this.activity = '手动控制'; }
      let target: THREE.Vector3 | null = null;
      let stopDistance = this.config.character.arrivalDistanceMeters;
      if (!manualInput && this.route) {
        stopDistance = 0.06;
        target = this.route.points[this.route.index];
        const distance = this.route.traversal === 'ground'
          ? Math.hypot(target.x - this.position.x, target.z - this.position.z) : this.position.distanceTo(target);
        if (!this.manipulating && distance < 0.12 && Math.abs(target.y - this.position.y) < 0.3) {
          this.route.index++;
          if (this.route.index >= this.route.points.length) {
            this.route = null; target = null; this.completedRoute = true;
            this.navigator.reset(); this.activity = '场景演示完成';
          }
          else { target = this.route.points[this.route.index]; this.navigator.reset(); }
        }
        if (this.route) this.activity = '场景路线 ' + this.route.index + '/' + (this.route.points.length - 1);
      } else if (!manualInput) {
        const cameraPosition = observer ?? camera.getWorldPosition(new THREE.Vector3());
        const result = this.behavior.update(speed > 0 && !this.manipulating ? delta : 0, intentPosition, cameraPosition, cursorPosition);
        target = result.target;
        stopDistance = result.stopDistance ?? (this.mode === 'follow-player' ? this.config.character.followDistanceMeters : stopDistance);
        if (!this.completedRoute) this.activity = result.activity ?? this.mode;
        if (this.behavior.completed && this.mode === 'go-to') this.navigator.reset();
      }
      const special = !manualInput && this.route && this.route.traversal !== 'ground';
      const hasMoveGoal = target !== null && (special ? intentPosition.distanceTo(target) > 0.001
        : Math.hypot(target.x - intentPosition.x, target.z - intentPosition.z) > stopDistance
          || ((this.route || this.mode === 'go-to' || this.mode === 'follow-cursor') && Math.abs(target.y - intentPosition.y) > 0.3));
      // Missing external observations are not an arrival or an instruction to change the animation.
      // Keep the animation intent only; no stale target is used to invent physical movement.
      if (!manualInput && this.mode === 'follow-cursor' && cursorPosition !== null) this.cursorMovementIntent = Boolean(hasMoveGoal);
      this.movementIntent = manualInput || Boolean(hasMoveGoal)
        || (this.mode === 'follow-cursor' && cursorPosition === null && this.cursorMovementIntent);
      this.intentInitialized = true;
      if (!this.manipulating && special && target) {
        const vector = target.clone().sub(this.position);
        if (speed > 0) this.position.addScaledVector(vector.normalize(), Math.min(speed * delta, this.position.distanceTo(target)));
        if (Math.hypot(vector.x, vector.z) > 0.1) this.turnToward(vector, delta);
        this.grounded = true; this.velocityY = 0;
      } else if (!this.manipulating) {
        let direction = new THREE.Vector3();
        if (manualInput) {
          const forward = new THREE.Vector3(); camera.getWorldDirection(forward); forward.y = 0;
          if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
          forward.normalize();
          direction.set(-forward.z, 0, forward.x).multiplyScalar(this.joystick.x).addScaledVector(forward, -this.joystick.y);
        } else if (target && hasMoveGoal) {
          this.navigator.requireTargetHeight = this.route !== null || this.mode === 'go-to' || this.mode === 'follow-cursor';
          direction = this.navigator.getDirection(this.position, target, world, this.capsuleRadius, this.effectiveHeight, this.config.character.maxStepHeightMeters, delta);
        }
        if (speed > 0 && direction.lengthSq() > 0.0001) {
          const remaining = target && this.navigationMode === 'direct' ? Math.max(0, Math.hypot(target.x - this.position.x, target.z - this.position.z) - stopDistance * 0.5) : Infinity;
          this.applyHorizontalMovement(direction.normalize(), Math.min(speed * delta, remaining), delta, world);
        }
        this.applyGravity(delta, world);
      }
    }
    if (this.manipulating && this.mode === 'manual' && !this.route) this.movementIntent = this.joystick.length() > 0.08;
    const moving = speed > 0 && this.movementIntent;
    this.armSpread?.restore();
    this.procedural?.restoreFootIK();
    this.setMotionState(!this.grounded && !this.manipulating ? 'jump' : moving ? 'walk' : 'idle');
    // Treat the configured default 1.1 m/s gait as 1x clip playback, including when travel is blocked.
    this.currentAction?.setEffectiveTimeScale(this.motionState === 'walk' ? speed / 1.1 : 1);
    this.mixer?.update(delta);
    const supported = this.grounded || this.manipulating;
    if (!this.previewAction && !this.currentAction) {
      this.procedural?.update(delta, this.locomotionStyle, moving, supported, moving ? speed : 0, this.proceduralBounceEnabled);
    } else if (supported) {
      this.procedural?.applyFootIK();
    }
    this.armSpread?.apply();
    this.vrm?.update(delta);
    if (this.capsuleDebug) {
      this.capsuleDebug.position.set(this.position.x, this.position.y + this.effectiveHeight / 2, this.position.z);
      this.capsuleDebug.scale.y = this.effectiveHeight / this.capsuleHeight;
      this.capsuleDebug.rotation.y = this.root.rotation.y;
    }
  }

  private applyHorizontalMovement(direction: THREE.Vector3, distance: number, delta: number, world: CollisionWorld): void {
    if (!this.isBlocked(direction, distance, world.meshes)) this.position.addScaledVector(direction, distance);
    this.turnToward(direction, delta);
  }

  private turnToward(direction: THREE.Vector3, delta: number): void {
    let desiredYaw = Math.atan2(direction.x, direction.z);
    if (this.locomotionStyle === 'backward') desiredYaw += Math.PI;
    if (this.locomotionStyle === 'strafe-left') desiredYaw -= Math.PI / 2;
    if (this.locomotionStyle === 'strafe-right') desiredYaw += Math.PI / 2;
    const difference = desiredYaw - this.root.rotation.y;
    this.root.rotation.y += Math.atan2(Math.sin(difference), Math.cos(difference)) * Math.min(1, this.config.character.turnSpeed * delta);
  }

  private isBlocked(direction: THREE.Vector3, distance: number, meshes: THREE.Mesh[]): boolean {
    if (!meshes.length) return false;
    const destination = this.position.clone().addScaledVector(direction, distance + this.capsuleRadius);
    if (!this.hasHeadroom(destination, this.effectiveHeight, meshes)) return true;
    const samples = [
      Math.max(this.capsuleRadius * 1.05, this.grounded ? this.config.character.maxStepHeightMeters + 0.06 : 0),
      this.effectiveHeight * 0.52,
      this.effectiveHeight - this.capsuleRadius * 0.3,
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

  private hasHeadroom(position: THREE.Vector3, height: number, meshes: THREE.Mesh[]): boolean {
    this.raycaster.near = 0;
    const clearance = this.config.character.maxStepHeightMeters + 0.04;
    this.raycaster.far = Math.max(0, height - clearance);
    for (const [x, z] of [[0, 0], [this.capsuleRadius * 0.7, 0], [-this.capsuleRadius * 0.7, 0], [0, this.capsuleRadius * 0.7], [0, -this.capsuleRadius * 0.7]]) {
      this.raycaster.set(new THREE.Vector3(position.x + x, position.y + clearance, position.z + z), new THREE.Vector3(0, 1, 0));
      if (this.raycaster.intersectObjects(meshes, false).length) return false;
    }
    return true;
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
    const origin = this.position.clone();
    origin.y += this.capsuleHeight + 0.5;
    const limit = this.position.y + this.config.character.maxStepHeightMeters + 0.05;
    return this.findWalkableSurface(meshes, origin, this.capsuleHeight + 3, limit)?.height ?? null;
  }

  private findFootSurface(point: THREE.Vector3): FootSurface | null {
    const reach = this.config.character.maxStepHeightMeters + 0.05;
    const origin = point.clone();
    origin.y = Math.min(point.y + reach, this.position.y + reach);
    const bottom = Math.max(point.y - reach, this.position.y - reach);
    return this.findWalkableSurface(this.worldMeshes, origin, origin.y - bottom, origin.y);
  }

  private findWalkableSurface(meshes: THREE.Mesh[], origin: THREE.Vector3, distance: number, limit: number): FootSurface | null {
    if (!meshes.length || distance <= 0) return null;
    this.raycaster.set(origin, new THREE.Vector3(0, -1, 0));
    this.raycaster.near = 0;
    this.raycaster.far = distance;
    for (const hit of this.raycaster.intersectObjects(meshes, false)) {
      if (!hit.face) continue;
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
      const normal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
      if (normal.y > 0.35 && hit.point.y <= limit) return { height: hit.point.y, normal };
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
    if (this.previewAction) return;
    this.armSpread?.restore();
    const nextAction = this.locomotionStyle === 'default' ? this.actions[next] ?? null : null;
    if (nextAction && nextAction !== previous) {
      if (!previous) this.procedural?.reset();
      nextAction.reset().fadeIn(this.config.animations[next].fadeSeconds).play();
      previous?.fadeOut(this.config.animations[next].fadeSeconds);
      this.currentAction = nextAction;
    } else if (!nextAction) {
      this.mixer?.stopAllAction();
      this.currentAction = null;
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
