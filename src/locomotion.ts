import * as THREE from 'three';
import type { VRMHumanBoneName } from '@pixiv/three-vrm';

export type LocomotionStyle =
  | 'walk' | 'run' | 'sprint' | 'sneak' | 'crouch' | 'crawl' | 'ladder'
  | 'stairs-up' | 'stairs-down' | 'backward' | 'strafe-left' | 'strafe-right'
  | 'hop' | 'swim' | 'balance' | 'march' | 'tiptoe' | 'wade' | 'skate' | 'limping' | 'dance';

export interface LocomotionDefinition {
  id: LocomotionStyle;
  label: string;
  description: string;
  speedMultiplier: number;
  capsuleScale: number;
}

export const LOCOMOTION_STYLES: readonly LocomotionDefinition[] = [
  { id: 'walk', label: '自然步行', description: '脚跟落地、脚尖蹬离，骨盆侧摆与反向摆臂。', speedMultiplier: 1, capsuleScale: 1 },
  { id: 'run', label: '跑步', description: '前倾、屈肘摆臂、后腿回收与短暂腾空。', speedMultiplier: 1.65, capsuleScale: 1 },
  { id: 'sprint', label: '冲刺', description: '更大步幅、抬膝、深屈肘与有力蹬地。', speedMultiplier: 2.35, capsuleScale: 1 },
  { id: 'sneak', label: '潜行', description: '前倾低重心，大步轻落，支撑期间保持头身高度平稳。', speedMultiplier: 0.55, capsuleScale: 0.83 },
  { id: 'crouch', label: '蹲行', description: '持续屈髋屈膝，小步前行，踝关节补偿。', speedMultiplier: 0.42, capsuleScale: 0.68 },
  { id: 'crawl', label: '四肢爬行', description: '低姿态交叉支撑，手掌着地、肘膝交替回收。', speedMultiplier: 0.34, capsuleScale: 0.52 },
  { id: 'ladder', label: '攀爬梯子', description: '交替向上抓握，屈肘拉升、抬膝寻找踏棍。', speedMultiplier: 0.4, capsuleScale: 1 },
  { id: 'stairs-up', label: '上楼梯', description: '落脚逐级升高，抬膝越过台阶，根据实际踏面高度落脚。', speedMultiplier: 0.64, capsuleScale: 1 },
  { id: 'stairs-down', label: '下楼梯', description: '向低一级踏面探脚，支撑腿缓冲，根据实际踏面高度落脚。', speedMultiplier: 0.58, capsuleScale: 1 },
  { id: 'backward', label: '后退', description: '脚尖向后探地，胸肩、颈和头分担转身，回头看向后方。', speedMultiplier: 0.62, capsuleScale: 1 },
  { id: 'strafe-left', label: '向左侧移', description: '左脚打开、右脚并拢，屈膝横向转移重心。', speedMultiplier: 0.7, capsuleScale: 1 },
  { id: 'strafe-right', label: '向右侧移', description: '右脚打开、左脚并拢，上身朝向保持稳定。', speedMultiplier: 0.7, capsuleScale: 1 },
  { id: 'hop', label: '双脚跳行', description: '双腿同步预蹲、伸展腾空、屈膝吸收落地。', speedMultiplier: 0.78, capsuleScale: 1 },
  { id: 'swim', label: '自由泳', description: '水平俯卧、左右滚转、曲肘划水和交替打腿。', speedMultiplier: 0.72, capsuleScale: 0.42 },
  { id: 'balance', label: '平衡木', description: '双臂展开，脚尖沿中线落下，躯干微调平衡。', speedMultiplier: 0.42, capsuleScale: 1 },
  { id: 'march', label: '高抬腿', description: '大幅抬膝，伸直支撑腿，对侧屈肘前摆。', speedMultiplier: 0.76, capsuleScale: 1 },
  { id: 'tiptoe', label: '踮脚', description: '明显抬起脚跟，以前脚掌支撑，保持膝踝弹性。', speedMultiplier: 0.48, capsuleScale: 1 },
  { id: 'wade', label: '涉水', description: '高抬脚跨过水面，缓慢落脚，手臂向外平衡。', speedMultiplier: 0.45, capsuleScale: 1 },
  { id: 'skate', label: '滑步', description: '交替向侧后方蹬伸，屈膝滑行与骨盆侧移。', speedMultiplier: 1.45, capsuleScale: 0.9 },
  { id: 'limping', label: '跛行', description: '不对称支撑时间、右腿减负、肩部补偿。', speedMultiplier: 0.5, capsuleScale: 1 },
  { id: 'dance', label: '律动步', description: '左右交替向前落脚、蹬地与回收，肩髋反扭并配合手臂律动。', speedMultiplier: 0.65, capsuleScale: 1 },
];

const BONE_NAMES: VRMHumanBoneName[] = [
  'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
  'leftShoulder', 'rightShoulder', 'leftUpperArm', 'rightUpperArm',
  'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand',
  'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg',
  'leftFoot', 'rightFoot', 'leftToes', 'rightToes',
];
type BoneState = { node: THREE.Object3D; rotation: THREE.Quaternion; position: THREE.Vector3; pose: THREE.Euler };
export type LegSide = 'left' | 'right';
export interface FootSupport {
  side: LegSide;
  local: THREE.Vector3;
  forefootLocal: THREE.Vector3;
  heelLocal?: THREE.Vector3;
}
export interface CrawlContact {
  side: LegSide;
  kind: 'palm' | 'knee';
  local: THREE.Vector3;
}
type LegDimensions = { thigh: number; shin: number; height: number };
type GroundGait = { stride: number; stance: number; clearance: number; knee: number; roll: number };
const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
// Stride and clearance are expressed in leg lengths, so avatars of different
// proportions share the same gait without sharing the same world-space cadence.
const GROUND_GAITS: Partial<Record<LocomotionStyle, GroundGait>> = {
  walk: { stride: 1.2, stance: 0.58, clearance: 0.13, knee: 0.13, roll: 0.12 },
  run: { stride: 1.7, stance: 0.42, clearance: 0.24, knee: 0.65, roll: 0.12 },
  sprint: { stride: 2.7, stance: 0.34, clearance: 0.5, knee: 1.12, roll: 0.22 },
  sneak: { stride: 1.22, stance: 0.72, clearance: 0.12, knee: 0.9, roll: 0.035 },
  crouch: { stride: 0.65, stance: 0.68, clearance: 0.1, knee: 1.28, roll: 0.035 },
  'stairs-up': { stride: 0.92, stance: 0.66, clearance: 0.39, knee: 0.45, roll: 0.06 },
  'stairs-down': { stride: 0.82, stance: 0.7, clearance: 0.15, knee: 0.72, roll: 0.045 },
  backward: { stride: 0.8, stance: 0.62, clearance: 0.1, knee: 0.22, roll: 0.07 },
  balance: { stride: 0.75, stance: 0.66, clearance: 0.1, knee: 0.2, roll: 0.06 },
  march: { stride: 1.0, stance: 0.59, clearance: 0.36, knee: 0.18, roll: 0.07 },
  tiptoe: { stride: 0.75, stance: 0.62, clearance: 0.12, knee: 0.2, roll: 0.04 },
  wade: { stride: 0.85, stance: 0.65, clearance: 0.32, knee: 0.25, roll: 0.06 },
  dance: { stride: 1.25, stance: 0.6, clearance: 0.26, knee: 0.32, roll: 0.09 },
};

/** Animates normalized humanoid bones from a T-pose rest pose.
 * Authored poses use +X left / +Z forward; the rest skeleton supplies the actual
 * local basis (VRM 0.x commonly retains -X left / -Z forward after scene rotation).
 * Rotations are relative to captured rest transforms, never accumulated frame to frame.
 * Missing optional bones (toes, chest, shoulders, etc.) are safely ignored.
 */
export class ProceduralLocomotion {
  private readonly bones = new Map<VRMHumanBoneName, BoneState>();
  private readonly rotation = new THREE.Quaternion();
  private readonly poseBasis = new THREE.Quaternion();
  private readonly inversePoseBasis = new THREE.Quaternion();
  private readonly offset = new THREE.Vector3();
  private readonly targetPosition = new THREE.Vector3();
  private readonly legs = new Map<LegSide, LegDimensions>();
  private phase = 0;
  private time = 0;
  private activity = 0;
  private wasGrounded = true;
  private airTime = 0;
  private landing = 0;
  private previousStyle: LocomotionStyle | null = null;
  private styleAge = 0;
  private readonly legHeight: number;
  private supports: FootSupport[] = [];
  private supportFloor: (() => number) | null = null;
  private stairSurface: ((point: THREE.Vector3) => number | null) | null = null;
  private readonly handFrames = new Map<LegSide, THREE.Matrix4>();
  private crawlContacts: CrawlContact[] = [];
  private stairTargets: { side: LegSide; clearance: number }[] = [];

  configureGrounding(
    supports: FootSupport[],
    floor: () => number,
    stairSurface: (point: THREE.Vector3) => number | null,
  ): void {
    this.supports = supports;
    this.supportFloor = floor;
    this.stairSurface = stairSurface;
  }

  configureCrawlContacts(contacts: CrawlContact[]): void {
    this.crawlContacts = contacts;
  }

  get basis(): THREE.Quaternion { return this.poseBasis.clone(); }

  constructor(getBone: (name: VRMHumanBoneName) => THREE.Object3D | null) {
    for (const name of BONE_NAMES) {
      const node = getBone(name);
      if (node) this.bones.set(name, { node, rotation: node.quaternion.clone(), position: node.position.clone(), pose: new THREE.Euler() });
    }
    const hips = this.bones.get('hips')?.node;
    const left = this.bones.get('leftUpperLeg')?.node ?? this.bones.get('leftUpperArm')?.node;
    const right = this.bones.get('rightUpperLeg')?.node ?? this.bones.get('rightUpperArm')?.node;
    if (hips && left && right) {
      const leftPosition = left.getWorldPosition(new THREE.Vector3());
      const rightPosition = right.getWorldPosition(new THREE.Vector3());
      // Work in the normalized rig's own coordinates. Its outer scene may
      // already have rotateVRM0 applied, hiding the reversed local bone axes.
      hips.parent?.worldToLocal(leftPosition);
      hips.parent?.worldToLocal(rightPosition);
      const lateral = leftPosition.sub(rightPosition);
      if (Math.hypot(lateral.x, lateral.z) > 0.001) {
        this.poseBasis.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-lateral.z, lateral.x));
        this.inversePoseBasis.copy(this.poseBasis).invert();
      }
    }
    const foot = this.bones.get('leftFoot')?.node ?? this.bones.get('rightFoot')?.node;
    if (hips && foot) {
      const hipPosition = hips.getWorldPosition(new THREE.Vector3());
      const footPosition = foot.getWorldPosition(new THREE.Vector3());
      const parentScale = hips.parent?.getWorldScale(new THREE.Vector3()).y ?? 1;
      this.legHeight = Math.max(0.1, Math.abs(hipPosition.y - footPosition.y) / Math.max(0.001, Math.abs(parentScale)));
    } else this.legHeight = Math.max(0.5, hips?.position.y ?? 0.9);
    for (const side of ['left', 'right'] as const) {
      const hand = getBone(`${side}Hand`);
      const index = getBone(`${side}IndexProximal`);
      const little = getBone(`${side}LittleProximal`);
      if (hand && index && little) {
        const a = hand.worldToLocal(index.getWorldPosition(new THREE.Vector3()));
        const b = hand.worldToLocal(little.getWorldPosition(new THREE.Vector3()));
        const forward = a.clone().add(b).normalize();
        const across = a.clone().sub(b).normalize();
        const thumb = getBone(`${side}ThumbProximal`) ?? getBone(`${side}ThumbDistal`) ?? getBone(`${side}ThumbMetacarpal`);
        if (thumb) {
          const t = hand.worldToLocal(thumb.getWorldPosition(new THREE.Vector3()));
          t.addScaledVector(forward, -t.dot(forward));
          if (t.lengthSq() > 1e-6) across.copy(t.normalize());
        }
        const normal = forward.clone().cross(across).multiplyScalar(side === 'left' ? 1 : -1).normalize();
        const right = normal.clone().cross(forward).normalize();
        normal.crossVectors(forward, right).normalize();
        if (right.lengthSq() > 0.5) this.handFrames.set(side, new THREE.Matrix4().makeBasis(right, normal, forward).invert());
      }
      const upper = this.bones.get(`${side}UpperLeg`)?.node;
      const lower = this.bones.get(`${side}LowerLeg`)?.node;
      const ankle = this.bones.get(`${side}Foot`)?.node;
      if (!upper || !lower || !ankle || !hips) continue;
      const scale = Math.max(0.001, Math.abs(hips.parent?.getWorldScale(new THREE.Vector3()).y ?? 1));
      const upperPosition = upper.getWorldPosition(new THREE.Vector3());
      const lowerPosition = lower.getWorldPosition(new THREE.Vector3());
      const anklePosition = ankle.getWorldPosition(new THREE.Vector3());
      this.legs.set(side, {
        thigh: upperPosition.distanceTo(lowerPosition) / scale,
        shin: lowerPosition.distanceTo(anklePosition) / scale,
        height: Math.abs(upperPosition.y - anklePosition.y) / scale,
      });
    }
  }

  reset(): void {
    for (const bone of this.bones.values()) {
      bone.node.quaternion.copy(bone.rotation);
      bone.node.position.copy(bone.position);
    }
    this.phase = this.time = this.activity = this.airTime = this.landing = 0;
    this.previousStyle = null;
    this.styleAge = 0;
    this.wasGrounded = true;
    this.stairTargets = [];
  }

  update(deltaSeconds: number, style: LocomotionStyle, moving: boolean, grounded: boolean, speed: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    const delta = Math.min(deltaSeconds, 0.05);
    this.styleAge = style === this.previousStyle && grounded ? this.styleAge + delta : 0;
    this.previousStyle = style;
    const active = moving && Number.isFinite(speed) && speed > 0.001;
    this.activity = THREE.MathUtils.damp(this.activity, active ? 1 : 0, 10, delta);
    this.time += delta;
    const cadence = style === 'sprint' ? 2.9 : style === 'run' ? 2.3 : style === 'hop' ? 1.55
      : style === 'crawl' || style === 'ladder' || style === 'swim' ? 0.85
        : style === 'sneak' || style === 'crouch' || style === 'balance' ? 0.95 : 1.4;
    const multiplier = LOCOMOTION_STYLES.find(entry => entry.id === style)?.speedMultiplier ?? 1;
    const dimensions = this.legs.get('left') ?? this.legs.get('right');
    const legLength = dimensions ? dimensions.thigh + dimensions.shin : this.legHeight;
    const worldScale = Math.max(0.001, Math.abs(this.bones.get('hips')?.node.parent?.getWorldScale(new THREE.Vector3()).y ?? 1));
    const stride = GROUND_GAITS[style]?.stride;
    const cycleDistance = stride ? stride * legLength * worldScale : (1.5 * multiplier / cadence) * this.legHeight * worldScale / 0.8;
    // Integrate the requested travel speed. Navigation can keep this motion
    // intent alive while blocked; the controller separately owns real movement.
    if (active) this.phase = (this.phase + delta * TAU * speed / Math.max(0.05, cycleDistance)) % TAU;
    for (const bone of this.bones.values()) bone.pose.set(0, 0, 0);
    this.stairTargets = [];
    this.offset.set(0, 0, 0);
    this.idlePose();
    this.gaitPose(style);
    if (grounded && GROUND_GAITS[style]) this.groundGaitPose(style, GROUND_GAITS[style]!);

    if (!grounded && style !== 'swim' && style !== 'ladder') {
      this.airTime += delta;
      this.jumpPose();
    } else {
      if (!this.wasGrounded && this.airTime > 0.08) this.landing = clamp(this.airTime * 0.42, 0.08, 0.24);
      this.airTime = 0;
      if (this.landing > 0.001) {
        this.offset.y -= this.landing;
        for (const side of ['left', 'right'] as const) {
          this.add(`${side}UpperLeg`, -this.landing * 1.6, 0, 0);
          this.add(`${side}LowerLeg`, this.landing * 3.1, 0, 0);
          this.add(`${side}Foot`, -this.landing * 1.5, 0, 0);
        }
        this.add('spine', this.landing * 0.7, 0, 0);
        this.landing *= Math.exp(-delta * 10);
      }
    }
    this.wasGrounded = grounded;
    // Keep style changes soft, then track planted feet more closely. A fixed
    // slow blend otherwise smears a short swing into the next contact phase.
    const supportTracking = grounded && GROUND_GAITS[style]
      ? clamp((this.styleAge - 0.12) / 0.2, 0, 1) * this.activity : 0;
    const blend = 1 - Math.exp(-delta * (16 + 16 * supportTracking));
    this.offset.applyQuaternion(this.poseBasis);
    for (const [name, bone] of this.bones) {
      this.rotation.setFromEuler(bone.pose).premultiply(this.poseBasis).multiply(this.inversePoseBasis).premultiply(bone.rotation);
      bone.node.quaternion.slerp(this.rotation, blend);
      if (name === 'hips') {
        this.targetPosition.copy(bone.position).addScaledVector(this.offset, this.legHeight);
        bone.node.position.lerp(this.targetPosition, blend);
      }
    }
    if (style === 'crawl') {
      if (grounded) this.solveCrawlContacts();
      this.orientHands('crawl');
    }
    if (style === 'ladder') {
      this.solveLadderArms();
      this.orientHands('ladder');
    }
    if (grounded) {
      this.applyFootGrounding(style);
      if (this.stairTargets.length) this.applyStairContacts();
    }
  }

  private orientHands(style: 'crawl' | 'ladder'): void {
    const normal = style === 'crawl' ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(0, 0, 1);
    const forward = style === 'crawl' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const desired = new THREE.Matrix4().makeRotationFromQuaternion(this.worldBasis())
      .multiply(new THREE.Matrix4().makeBasis(normal.clone().cross(forward), normal, forward));
    for (const [side, local] of this.handFrames) {
      const hand = this.bones.get(`${side}Hand`)?.node;
      if (!hand?.parent) continue;
      const world = new THREE.Quaternion().setFromRotationMatrix(desired.clone().multiply(local));
      hand.quaternion.copy(hand.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));
    }
  }

  private worldBasis(): THREE.Quaternion {
    const basis = new THREE.Quaternion();
    this.bones.get('hips')?.node.parent?.getWorldQuaternion(basis);
    return basis.multiply(this.poseBasis);
  }

  private solveLadderArms(): void {
    const basis = this.worldBasis();
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(basis);
    const lateral = new THREE.Vector3(1, 0, 0).applyQuaternion(basis);
    for (const side of this.handFrames.keys()) {
      const upper = this.bones.get(`${side}UpperArm`)?.node;
      const lower = this.bones.get(`${side}LowerArm`)?.node;
      const hand = this.bones.get(`${side}Hand`)?.node;
      if (!upper || !lower || !hand) continue;
      const shoulder = upper.getWorldPosition(new THREE.Vector3());
      const elbow = lower.getWorldPosition(new THREE.Vector3());
      const length = shoulder.distanceTo(elbow) + elbow.distanceTo(hand.getWorldPosition(new THREE.Vector3()));
      const phase = this.phase + (side === 'right' ? Math.PI : 0);
      const reach = (Math.sin(phase) * this.activity + 1) * 0.5;
      const sign = side === 'left' ? 1 : -1;
      const target = shoulder.addScaledVector(forward, length * 0.36).addScaledVector(lateral, sign * length * 0.04);
      target.y += length * (0.18 + reach * 0.72);
      const pole = forward.clone().multiplyScalar(-0.5).addScaledVector(lateral, sign * 0.6);
      pole.y -= 0.4;
      this.solveLimb(upper, lower, hand, target, pole, 1.78);
    }
  }

  private solveCrawlContacts(): void {
    const hips = this.bones.get('hips')?.node;
    if (!hips?.parent || !this.supportFloor || !this.crawlContacts.length) return;
    const floor = this.supportFloor();
    let kneeY = Infinity;
    for (const contact of this.crawlContacts) {
      if (contact.kind !== 'knee') continue;
      const knee = this.bones.get(`${contact.side}LowerLeg`)?.node;
      if (knee) kneeY = Math.min(kneeY, knee.localToWorld(contact.local.clone()).y);
    }
    if (Number.isFinite(kneeY)) {
      const position = hips.getWorldPosition(new THREE.Vector3());
      position.y += floor - kneeY;
      hips.position.copy(hips.parent.worldToLocal(position));
    }
    const basis = this.worldBasis();
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(basis);
    const lateral = new THREE.Vector3(1, 0, 0).applyQuaternion(basis);
    const palmFrame = new THREE.Matrix4().makeRotationFromQuaternion(basis).multiply(
      new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1)),
    );
    for (const { side, kind, local } of this.crawlContacts) {
      if (kind !== 'palm') continue;
      const upper = this.bones.get(`${side}UpperArm`)?.node;
      const lower = this.bones.get(`${side}LowerArm`)?.node;
      const hand = this.bones.get(`${side}Hand`)?.node;
      const frame = this.handFrames.get(side);
      if (!upper || !lower || !hand || !frame) continue;
      const phase = this.phase + (side === 'right' ? Math.PI : 0);
      const lift = Math.max(0, -Math.cos(phase)) * 0.1 * this.activity;
      const desiredHand = new THREE.Quaternion().setFromRotationMatrix(palmFrame.clone().multiply(frame));
      const offset = local.clone().multiply(hand.getWorldScale(new THREE.Vector3())).applyQuaternion(desiredHand);
      const sign = side === 'left' ? 1 : -1;
      // The planted hand travels backward and returns forward while lifted.
      const target = upper.getWorldPosition(new THREE.Vector3())
        .addScaledVector(forward, 0.1 - Math.sin(phase) * 0.14 * this.activity)
        .addScaledVector(lateral, sign * 0.015);
      target.y = floor + lift - offset.y;
      const pole = forward.clone().negate().addScaledVector(lateral, sign * 0.25);
      this.solveLimb(upper, lower, hand, target, pole, 1.78);
    }
  }

  private solveLimb(upper: THREE.Object3D, lower: THREE.Object3D, end: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3, maxFlex = 2.22): void {
    const origin = upper.getWorldPosition(new THREE.Vector3());
    const joint = lower.getWorldPosition(new THREE.Vector3());
    const upperLength = origin.distanceTo(joint);
    const lowerLength = joint.distanceTo(end.getWorldPosition(new THREE.Vector3()));
    const direction = target.clone().sub(origin);
    if (upperLength < 0.002 || lowerLength < 0.002 || direction.lengthSq() < 1e-8) return;
    const minReach = Math.sqrt(upperLength ** 2 + lowerLength ** 2 + 2 * upperLength * lowerLength * Math.cos(maxFlex));
    const distance = clamp(direction.length(), minReach, upperLength + lowerLength - 0.001);
    direction.normalize();
    pole.addScaledVector(direction, -pole.dot(direction));
    if (pole.lengthSq() < 1e-6) {
      pole.set(Math.abs(direction.x) < 0.8 ? 1 : 0, Math.abs(direction.x) < 0.8 ? 0 : 1, 0);
      pole.addScaledVector(direction, -pole.dot(direction));
    }
    pole.normalize();
    const cosine = clamp((upperLength ** 2 + distance ** 2 - lowerLength ** 2) / (2 * upperLength * distance), -1, 1);
    const bend = origin.clone().addScaledVector(direction, upperLength * cosine)
      .addScaledVector(pole, upperLength * Math.sqrt(1 - cosine ** 2));
    const rotate = (bone: THREE.Object3D, child: THREE.Object3D, goal: THREE.Vector3) => {
      const pivot = bone.getWorldPosition(new THREE.Vector3());
      const current = child.getWorldPosition(new THREE.Vector3()).sub(pivot).normalize();
      const desired = goal.clone().sub(pivot).normalize();
      const rotation = new THREE.Quaternion().setFromUnitVectors(current, desired)
        .multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
      if (bone.parent) rotation.premultiply(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert());
      bone.quaternion.copy(rotation);
    };
    rotate(upper, lower, bend);
    rotate(lower, end, origin.addScaledVector(direction, distance));
  }

  private applyFootGrounding(style: LocomotionStyle): void {
    const hips = this.bones.get('hips')?.node;
    if (!hips?.parent || !this.supportFloor || !this.supports.length || ['swim', 'crawl', 'ladder', 'hop'].includes(style)) return;
    const gait = GROUND_GAITS[style];
    const cycle = this.phase / TAU;
    // Only running and sprinting have a flight phase with no supporting foot.
    if (gait && gait.stance < 0.5 && this.activity >= 0.08 && cycle % 0.5 >= gait.stance) return;
    let lowest = Infinity;
    for (const { side, local, forefootLocal } of this.supports) {
      const foot = this.bones.get(`${side}Foot`)?.node;
      const point = style === 'tiptoe' ? forefootLocal : local;
      if (foot) lowest = Math.min(lowest, foot.localToWorld(point.clone()).y);
    }
    if (!Number.isFinite(lowest)) return;
    const position = hips.getWorldPosition(new THREE.Vector3());
    position.y += this.supportFloor() - lowest;
    hips.position.copy(hips.parent.worldToLocal(position));
  }

  private applyStairContacts(): void {
    const hips = this.bones.get('hips')?.node;
    if (!hips?.parent || !this.stairSurface) return;
    const scale = Math.abs(hips.parent.getWorldScale(new THREE.Vector3()).y);
    const basis = this.worldBasis();
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(basis);
    const goals = [];
    let pelvisOffset = 0;
    for (const target of this.stairTargets) {
      const support = this.supports.find(entry => entry.side === target.side);
      const upper = this.bones.get(`${target.side}UpperLeg`)?.node;
      const lower = this.bones.get(`${target.side}LowerLeg`)?.node;
      const foot = this.bones.get(`${target.side}Foot`)?.node;
      if (!support || !upper || !lower || !foot?.parent) continue;
      const sole = foot.localToWorld(support.local.clone());
      // A paw can bridge the edge even when its centre is still over the lower tread.
      const contacts = [sole, foot.localToWorld(support.forefootLocal.clone())];
      if (support.heelLocal) contacts.push(foot.localToWorld(support.heelLocal.clone()));
      const levels = contacts.map(this.stairSurface).filter(height => height !== null);
      if (!levels.length) continue;
      const surface = Math.max(...levels);
      const ankle = foot.getWorldPosition(new THREE.Vector3());
      const knee = lower.getWorldPosition(new THREE.Vector3());
      const hip = upper.getWorldPosition(new THREE.Vector3());
      const reach = hip.distanceTo(knee) + knee.distanceTo(ankle) - 0.004;
      ankle.y += surface + target.clearance * scale - sole.y;
      const horizontal = Math.hypot(hip.x - ankle.x, hip.z - ankle.z);
      if (horizontal < reach) {
        pelvisOffset = Math.min(pelvisOffset, ankle.y + Math.sqrt(reach ** 2 - horizontal ** 2) - hip.y);
      }
      goals.push({ upper, lower, foot, ankle, orientation: foot.getWorldQuaternion(new THREE.Quaternion()) });
    }
    if (pelvisOffset < 0) {
      const position = hips.getWorldPosition(new THREE.Vector3());
      position.y += Math.max(pelvisOffset, -0.12);
      hips.position.copy(hips.parent.worldToLocal(position));
    }
    for (const { upper, lower, foot, ankle, orientation } of goals) {
      this.solveLimb(upper, lower, foot, ankle, forward.clone());
      foot.quaternion.copy(foot.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(orientation));
    }
  }

  private set(name: VRMHumanBoneName, x = 0, y = 0, z = 0): void { this.bones.get(name)?.pose.set(x, y, z); }
  private add(name: VRMHumanBoneName, x = 0, y = 0, z = 0): void {
    const pose = this.bones.get(name)?.pose;
    if (pose) { pose.x += x; pose.y += y; pose.z += z; }
  }

  private idlePose(): void {
    const breath = Math.sin(this.time * 1.9);
    this.set('spine', 0.018 + breath * 0.008);
    this.set('chest', -0.012 + breath * 0.012);
    this.set('head', -0.01, Math.sin(this.time * 0.5) * 0.035 * (1 - this.activity));
    this.offset.y = breath * 0.003;
    for (const side of ['left', 'right'] as const) {
      const sign = side === 'left' ? 1 : -1;
      this.set(`${side}UpperArm`, -0.035, 0, -sign * 1.43);
      this.set(`${side}LowerArm`, 0, -sign * 0.14);
      this.set(`${side}Hand`, 0.02, 0, sign * 0.04);
      this.set(`${side}UpperLeg`, -0.035);
      this.set(`${side}LowerLeg`, 0.07);
      this.set(`${side}Foot`, -0.035);
    }
  }

  /** A flat-ground, sagittal two-link solve; terrain height still belongs to
   * the character controller. Stance feet travel backwards at requested speed,
   * while only the returning foot lifts. The stair pose is then fitted to the actual collision surfaces. */
  private groundGaitPose(style: LocomotionStyle, gait: GroundGait): void {
    if (!this.legs.size) return;
    const dimensions = this.legs.get('left') ?? this.legs.get('right')!;
    const length = dimensions.thigh + dimensions.shin;
    const a = this.activity;
    const low = style === 'crouch' || style === 'sneak';
    const stairs = style === 'stairs-up' || style === 'stairs-down';
    const running = style === 'run' || style === 'sprint';
    const reverse = style === 'backward' ? -1 : 1;
    const span = gait.stride * length * gait.stance * a;
    const targets: { side: LegSide; z: number; lift: number; roll: number; toe: number }[] = [];
    let bodyHeight = Infinity;
    for (const side of ['left', 'right'] as const) {
      const t = (this.phase / TAU + (side === 'right' ? 0.5 : 0)) % 1;
      let z: number;
      let lift = 0;
      let roll = 0;
      let toe = 0;
      if (t < gait.stance) {
        const support = t / gait.stance;
        z = span * (0.5 - support);
        // A brief heel roll at contact, then the forefoot pushes off at the end.
        roll = gait.roll * (-Math.max(0, 1 - support * 5) + Math.max(0, (support - 0.72) / 0.28)) * a;
        toe = -Math.max(0, (support - 0.72) / 0.28) * gait.roll * 1.5 * a;
      } else {
        const swing = (t - gait.stance) / (1 - gait.stance);
        const cubic = swing * swing * (3 - 2 * swing);
        // Cubic Hermite return with the same backwards velocity as stance at
        // both ends, so contact has no sudden forward snap.
        const tangent = (1 - gait.stance) / gait.stance;
        z = span * (-0.5 + cubic - tangent * (2 * swing ** 3 - 3 * swing * swing + swing));
        lift = Math.pow(Math.sin(Math.PI * swing), 1.5) * gait.clearance * length * a;
        roll = gait.roll * Math.cos(Math.PI * swing) * a;
      }
      if (stairs) this.stairTargets.push({ side, clearance: lift });
      if (style === 'tiptoe') { roll += 0.68; toe -= 0.68; }
      // Leave room for toe/heel rotation without pushing the sole through the
      // rest support plane. The ankle itself is not the bottom of the foot.
      lift += Math.max(0, roll) * length * 0.15 + Math.max(0, -roll) * length * 0.06;
      const knee = 0.07 + (gait.knee - 0.07) * (low ? 1 : a);
      const reach = Math.sqrt(dimensions.thigh ** 2 + dimensions.shin ** 2 + 2 * dimensions.thigh * dimensions.shin * Math.cos(knee));
      bodyHeight = Math.min(bodyHeight, Math.sqrt(Math.max(0.01, reach * reach - z * z)) + lift);
      targets.push({ side, z: z * reverse, lift, roll: roll * reverse, toe });
    }
    if(low){
      // A low, quiet gait must not bob to the free foot's lift trajectory.
      const reach=Math.sqrt(dimensions.thigh**2+dimensions.shin**2+2*dimensions.thigh*dimensions.shin*Math.cos(gait.knee));
      bodyHeight=Math.sqrt(Math.max(0.01,reach*reach-(span*0.5)**2));
    }
    if (running) {
      const halfCycle = (this.phase / TAU) % 0.5;
      const contactHeight = Math.sqrt(Math.max(0.01, (length * 0.97) ** 2 - (span / 2) ** 2));
      const compressedHeight = length * Math.cos(gait.knee / 2);
      const supportHeight = halfCycle < gait.stance
        ? contactHeight + (compressedHeight - contactHeight) * Math.sin(Math.PI * halfCycle / gait.stance) ** 2
        : contactHeight + length * 0.09 * Math.sin(Math.PI * (halfCycle - gait.stance) / (0.5 - gait.stance)) ** 2;
      // The flight phase can rise; a supporting foot still limits extension.
      bodyHeight = Math.min(bodyHeight + length * 0.08 * a, supportHeight);
      bodyHeight = THREE.MathUtils.lerp(dimensions.height, bodyHeight, a);
    }
    this.offset.y = (bodyHeight - dimensions.height) / this.legHeight;
    this.offset.x = Math.sin(this.phase) * (style==='dance'?0.06:0.012) * a;
    const pelvisPitch=style==='sneak'?0.22:style==='crouch'?0.1:style==='sprint'?0.14*a:style==='run'?0.04*a:0;
    this.set('hips', pelvisPitch, Math.sin(this.phase) * (style==='dance'?0.2:0.025) * a, style==='dance'?Math.sin(this.phase)*0.045*a:0);
    for (const target of targets) {
      const leg = this.legs.get(target.side);
      if (!leg) continue;
      const y = leg.height + this.offset.y * this.legHeight - target.lift;
      const minReach = Math.sqrt(leg.thigh ** 2 + leg.shin ** 2 + 2 * leg.thigh * leg.shin * Math.cos(2.22));
      const distance = clamp(Math.hypot(y, target.z), minReach, leg.thigh + leg.shin - 0.0001);
      const knee = Math.acos(clamp((distance * distance - leg.thigh * leg.thigh - leg.shin * leg.shin) / (2 * leg.thigh * leg.shin), -1, 1));
      const hip = Math.atan2(-target.z, y) - Math.atan2(leg.shin * Math.sin(knee), leg.thigh + leg.shin * Math.cos(knee));
      this.set(`${target.side}UpperLeg`, hip-pelvisPitch);
      this.set(`${target.side}LowerLeg`, knee);
      this.set(`${target.side}Foot`, -hip - knee + target.roll);
      this.set(`${target.side}Toes`, target.toe);
      const sign = target.side === 'left' ? 1 : -1;
      // Keep the opposite arm forward as the leg advances; the old sine phase
      // put the arm and planted foot on unrelated portions of the cycle.
      const arm = Math.cos(this.phase + (target.side === 'right' ? Math.PI : 0));
      if (!['balance','wade','stairs-up','stairs-down','dance'].includes(style)) {
        this.set(`${target.side}UpperArm`, arm*(style==='sprint'?1.15:running?0.62:0.36)*a-(style==='sneak'?0.55:low?0.3:0.03),0,-sign*(style==='sneak'?1.05:low?1.2:1.43));
        this.set(`${target.side}LowerArm`,0,-sign*(style==='sprint'?1.48+arm*0.29*a:running?1.12+arm*0.15*a:low?0.9:0.2+Math.max(0,-arm)*0.25*a));
      }
    }
  }

  private gaitPose(style: LocomotionStyle): void {
    const a = this.activity;
    const p = this.phase;
    const running = style === 'run' || style === 'sprint';
    const low = style === 'sneak' || style === 'crouch';
    const stride = style === 'sprint' ? 0.95 : running ? 0.72 : style === 'march' ? 0.92 : low ? 0.28 : 0.45;
    const knee = running ? 1.45 : style === 'stairs-up' || style === 'wade' || style === 'march' ? 1.35 : 0.73;
    const bend = style === 'crouch' ? 0.68 : style === 'sneak' ? 0.35 : style === 'skate' ? 0.4 : 0.035;
    const direction = style === 'backward' ? -0.7 : 1;
    this.offset.x += Math.sin(p) * (running ? 0.028 : 0.018) * a;
    this.offset.y += (running ? 0.025 + Math.abs(Math.cos(p)) * 0.045 : -Math.abs(Math.sin(p)) * 0.035) * a;
    this.offset.y -= style === 'crouch' ? 0.26 : style === 'sneak' ? 0.11 : style === 'skate' ? 0.1 : 0;
    this.set('hips', running ? 0.07 * a : 0, Math.sin(p) * 0.075 * a, -Math.sin(p) * 0.035 * a);
    this.add('spine', (style==='sprint'?0.32:running?0.14:style==='sneak'?0.48:style==='crouch'?0.3:0.035) * (low ? 1 : a), -Math.sin(p) * 0.11 * a);
    this.add('chest', style==='sneak'?0.13:style==='crouch'?0.09:style==='sprint'?0.09*a:running?0.03*a:0, -Math.sin(p) * 0.06 * a);
    this.add('head', (style==='sprint'?-0.4:running?-0.18:style==='sneak'?-0.7:low?-0.36:0) * (low ? 1 : a));
    for (const side of ['left', 'right'] as const) {
      const sign = side === 'left' ? 1 : -1;
      const phase = p + (side === 'right' ? Math.PI : 0);
      const swing = Math.sin(phase);
      const lift = Math.pow(Math.max(0, Math.cos(phase)), 1.6);
      const hip = -bend - swing * stride * direction * a;
      const flex = bend * 2 + lift * knee * a;
      const heelRoll = (-Math.max(0, swing) * 0.12 + Math.max(0, -swing) * 0.22) * a;
      this.set(`${side}UpperLeg`, hip, 0, sign * 0.012);
      this.set(`${side}LowerLeg`, flex);
      this.set(`${side}Foot`, -hip - flex + heelRoll);
      this.set(`${side}Toes`, -Math.max(0, -swing) * 0.27 * a);
      this.set(`${side}UpperArm`, swing * (style==='sprint'?1.15:running?0.62:0.4) * a - (style==='sneak'?0.55:low?0.3:0.03), 0, -sign * (style==='sneak'?1.05:low?1.2:1.43));
      this.set(`${side}LowerArm`, 0, -sign * (style==='sprint'?1.5+swing*0.32*a:running?1.12+swing*0.15*a:low?0.9:0.17+Math.max(0,-swing)*0.28*a));
      this.set(`${side}Hand`, 0, sign * Math.sin(phase - 0.4) * 0.06 * a, sign * (running ? 0.12 : 0.03));
      if (style === 'stairs-up' || style === 'stairs-down') {
        this.set(`${side}UpperLeg`, -0.1 - (style === 'stairs-up' ? 0.72 : 0.48) * Math.max(0, swing) * a + Math.min(0, swing) * -0.18 * a);
        this.set(`${side}LowerLeg`, 0.22 + (style === 'stairs-up' ? 1.25 : 0.65) * lift * a);
        const upper = this.bones.get(`${side}UpperLeg`)?.pose.x ?? 0;
        const lower = this.bones.get(`${side}LowerLeg`)?.pose.x ?? 0;
        this.set(`${side}Foot`, -upper - lower + (style === 'stairs-down' ? 0.16 : 0));
        this.set(`${side}UpperArm`, swing * 0.26 * a, 0, -sign * 1.12);
        this.set(`${side}LowerArm`, 0, -sign * 0.5);
      }
      if (style === 'tiptoe') {
        this.add(`${side}Foot`, 0.34);
        this.set(`${side}Toes`, -0.32);
        this.set(`${side}LowerArm`, 0, -sign * 0.48);
      }
      if (style === 'balance' || style === 'wade') {
        this.set(`${side}UpperArm`, Math.sin(phase + 0.4) * 0.12 * a, 0, -sign * (style === 'balance' ? 0.22 : 0.78));
        this.set(`${side}LowerArm`, 0, -sign * 0.22);
        this.set(`${side}Hand`, -0.09, 0, sign * Math.sin(p + sign) * 0.16);
        if (style === 'balance') this.set(`${side}UpperLeg`, hip * 0.7, 0, -sign * 0.1);
      }
      if (style === 'march') {
        this.set(`${side}UpperLeg`, -Math.max(0, swing) * 1.1 * a + Math.max(0, -swing) * 0.12 * a);
        this.set(`${side}LowerArm`, 0, -sign * 1.1);
      }
    }
    if (style === 'stairs-up') { this.add('spine', 0.12); this.add('head', -0.1); }
    if (style === 'stairs-down') { this.offset.y -= 0.055; this.set('head', 0.16); }
    if (style === 'tiptoe') this.offset.y += 0.055;
    if (style === 'balance') { this.set('hips', 0, 0, Math.sin(p * 0.5) * 0.045); this.set('head', 0.12); }
    if (style === 'backward') { this.set('spine',0.06,0.28);this.set('chest',0.04,0.42);this.set('neck',0,0.72);this.set('head',0,1.02); }
    if (style === 'strafe-left' || style === 'strafe-right') this.strafePose(style === 'strafe-left' ? 1 : -1);
    if (style === 'crawl') this.crawlPose();
    if (style === 'ladder') this.ladderPose();
    if (style === 'swim') this.swimPose();
    if (style === 'hop') this.hopPose();
    if (style === 'skate') this.skatePose();
    if (style === 'limping') this.limpPose();
    if (style === 'dance') this.dancePose();
  }

  private strafePose(direction: number): void {
    const a=this.activity,cycle=this.phase/TAU;
    this.offset.set(Math.sin(this.phase)*0.035*a,-0.07-Math.abs(Math.sin(this.phase))*0.015*a,0);
    this.set('hips',0,0,-direction*0.025*a);this.set('spine',0.08,0,direction*0.025*a);
    for(const side of ['left','right'] as const){
      const sign=side==='left'?1:-1,lead=sign===direction;
      const t=(cycle+(lead?0:0.5))%1,swing=t<0.43,u=swing?t/0.43:(t-0.43)/0.57;
      const lateral=direction*(swing?(-0.5+u*u*(3-2*u)):(0.5-u))*0.5*a;
      const lift=swing?Math.sin(Math.PI*u)*a:0;
      // Lead foot opens; trailing foot closes. Adduction is capped to avoid crossing.
      const z=sign*clamp(sign*lateral,-0.10,0.38);
      this.set(`${side}UpperLeg`,-0.16-lift*0.4,0,z);
      this.set(`${side}LowerLeg`,0.32+lift*0.85);
      this.set(`${side}Foot`,-0.16-lift*0.45,0,-z);
      this.set(`${side}UpperArm`,-0.15+Math.sin(this.phase)*sign*0.1*a,0,-sign*1.12);
      this.set(`${side}LowerArm`,0,-sign*0.75);
    }
  }

  private crawlPose(): void {
    const a=this.activity,p=this.phase,body=1.43;
    this.offset.set(Math.sin(p)*0.035*a,-0.45+Math.cos(p*2)*0.02*a,0);
    this.set('hips',body,Math.sin(p)*0.04*a);this.set('spine',0.1,-Math.sin(p)*0.05*a);
    this.set('chest',0.02);this.set('neck',-0.34);this.set('head',-0.99);
    for(const side of ['left','right'] as const){
      const sign=side==='left'?1:-1,phase=p+(side==='right'?Math.PI:0);
      const wave=Math.sin(phase)*a,lift=Math.max(0,Math.cos(phase))*a;
      const thigh=-1.44-wave*0.5,knee=1.8+lift*0.45;
      this.set(`${side}UpperLeg`,thigh,0,sign*0.14);this.set(`${side}LowerLeg`,knee);
      // Toes trail behind the kneeling body, not vertically into the ground.
      this.set(`${side}Foot`,Math.PI-body-thigh-knee-0.12);this.set(`${side}Toes`,0.08);
      this.set(`${side}UpperArm`,-1.38-wave*0.58,0,-sign*1.37);
      this.set(`${side}LowerArm`,0,-sign*(0.18+Math.max(0,-Math.cos(phase))*1.0*a));
      this.set(`${side}Hand`,0,0,0);
    }
  }

  private ladderPose(): void {
    const a=this.activity,p=this.phase;
    this.offset.set(Math.sin(p)*0.03*a,-0.1+Math.sin(p*2)*0.04*a,0.025);
    this.set('hips',0.06,Math.sin(p)*0.035*a);this.set('spine',0.08);this.set('chest',-0.04);this.set('head',-0.26);
    for(const side of ['left','right'] as const){
      const sign=side==='left'?1:-1,wave=Math.sin(p+(side==='right'?Math.PI:0));
      const reach=(wave+1)*0.5,lift=Math.pow((1-wave)*0.5,1.3)*a;
      this.set(`${side}UpperLeg`,-0.22-lift*1.05);this.set(`${side}LowerLeg`,0.4+lift*1.35);
      this.set(`${side}Foot`,-0.18-lift*0.3);this.set(`${side}Toes`,-0.12);
      // Hands actually reach above shoulder height, then the elbow pulls the body up.
      this.set(`${side}UpperArm`,0.25+reach*0.08,0,sign*(0.4+reach*1.15));
      this.set(`${side}LowerArm`,0,-sign*(1.2-reach*1.1));
      this.set(`${side}Hand`,-0.12,sign*0.12,sign*0.08);
    }
  }

  private swimPose(): void {
    const a = this.activity;
    this.offset.set(0, -0.66 + Math.sin(this.time * 1.7) * 0.018, 0);
    this.set('hips', 1.48, 0, Math.sin(this.phase) * 0.12 * a);
    this.set('spine', 0.08, 0, Math.sin(this.phase) * 0.08 * a);
    this.set('chest', -0.03);
    this.set('neck', -0.13);
    this.set('head', -0.22, Math.max(0, Math.sin(this.phase)) * 0.4 * a);
    for (const side of ['left', 'right'] as const) {
      const sign = side === 'left' ? 1 : -1;
      const phase = this.phase + (side === 'right' ? Math.PI : 0);
      const kick = Math.sin(phase * 2 + (side === 'right' ? Math.PI : 0)) * a;
      this.set(`${side}UpperLeg`, kick * 0.19);
      this.set(`${side}LowerLeg`, 0.13 + Math.max(0, kick) * 0.3);
      this.set(`${side}Foot`, 1.05);
      this.set(`${side}UpperArm`, -1.55 - Math.sin(phase) * 1.12 * a, sign * Math.cos(phase) * 0.25 * a, -sign * (1.12 - Math.max(0, Math.cos(phase)) * 0.45 * a));
      this.set(`${side}LowerArm`, 0, -sign * (0.3 + Math.max(0, Math.cos(phase)) * 1.25 * a));
      this.set(`${side}Hand`, 0.04, -sign * 0.15, sign * 0.1);
    }
  }

  private hopPose(): void {
    const a = this.activity;
    const wave = Math.sin(this.phase);
    const compression = Math.max(0, -wave) * a;
    const flight = Math.max(0, wave) * a;
    this.offset.y = flight * 0.19 - compression * 0.17;
    this.set('hips', 0);
    this.set('spine', compression * 0.18);
    for (const side of ['left', 'right'] as const) {
      const sign = side === 'left' ? 1 : -1;
      this.set(`${side}UpperLeg`, -0.1 - compression * 0.62 - flight * 0.12);
      this.set(`${side}LowerLeg`, 0.2 + compression * 1.2 + flight * 0.25);
      this.set(`${side}Foot`, -0.1 - compression * 0.58 + flight * 0.3);
      this.set(`${side}UpperArm`, -flight * 1.15 + compression * 0.45, 0, -sign * 1.34);
      this.set(`${side}LowerArm`, 0, -sign * (0.25 + flight * 0.45));
    }
  }

  private skatePose(): void {
    const a = this.activity;
    const wave = Math.sin(this.phase);
    this.offset.x = wave * 0.1 * a;
    this.set('hips', 0.08, wave * 0.08 * a, -wave * 0.1 * a);
    this.set('spine', 0.22, -wave * 0.13 * a);
    this.set('head', -0.2);
    for (const side of ['left', 'right'] as const) {
      const sign = side === 'left' ? 1 : -1;
      const push = Math.max(0, wave * sign) * a;
      this.set(`${side}UpperLeg`, -0.36 + push * 0.48, sign * push * 0.2, sign * push * 0.38);
      this.set(`${side}LowerLeg`, 0.72 - push * 0.5);
      this.set(`${side}Foot`, -0.44 + push * 0.02, -sign * push * 0.1, -sign * push * 0.25);
      this.set(`${side}UpperArm`, -wave * sign * 0.65 * a, 0, -sign * 1.1);
      this.set(`${side}LowerArm`, 0, -sign * 0.85);
    }
  }

  private limpPose(): void {
    const a = this.activity;
    const weight = Math.max(0, Math.sin(this.phase));
    this.offset.y -= weight * 0.07 * a;
    this.offset.x = -0.04 * a;
    this.set('hips', 0.03, 0, -0.09 * a);
    this.set('spine', 0.04, 0, 0.1 * a);
    this.set('rightUpperLeg', -0.16 - Math.sin(this.phase + Math.PI) * 0.17 * a);
    this.set('rightLowerLeg', 0.28 + weight * 0.24 * a);
    this.set('rightFoot', -0.12 - weight * 0.18 * a);
    this.set('rightUpperArm', -0.15, 0, 1.37);
    this.set('rightLowerArm', 0, 0.6);
  }

  private dancePose(): void {
    const a=this.activity,p=this.phase,wave=Math.sin(p);
    this.offset.x=wave*0.085*a;this.offset.y=-0.025-Math.abs(Math.cos(p))*0.045*a;
    this.set('hips',0.04,wave*0.25*a,wave*0.09*a);this.set('chest',0,-wave*0.34*a);this.set('head',0,wave*0.13*a);
    for(const side of ['left','right'] as const){
      const sign=side==='left'?1:-1,step=Math.max(0,wave*sign)*a;
      const thigh=-0.1-step*0.8,knee=0.2+step*1.25;
      this.set(`${side}UpperLeg`,thigh,-sign*0.05,wave*0.11*a);this.set(`${side}LowerLeg`,knee);
      this.set(`${side}Foot`,-thigh-knee+step*0.1,0,-wave*0.09*a);this.set(`${side}Toes`,-step*0.15);
      this.set(`${side}UpperArm`,-0.5+wave*sign*0.65*a,0,-sign*(0.7+step*0.16));
      this.set(`${side}LowerArm`,0,-sign*(1.05+wave*sign*0.4*a));this.set(`${side}Hand`,wave*0.24*a,0,sign*0.16);
    }
  }

  private jumpPose(): void {
    const tuck = Math.sin(clamp(this.airTime / 0.65, 0, 1) * Math.PI);
    this.offset.set(0, -0.04 * tuck, 0);
    this.set('hips', 0.04);
    this.set('spine', 0.08);
    this.set('head', -0.09);
    for (const side of ['left', 'right'] as const) {
      const sign = side === 'left' ? 1 : -1;
      this.set(`${side}UpperLeg`, -0.15 - tuck * 0.47);
      this.set(`${side}LowerLeg`, 0.3 + tuck * 0.8);
      this.set(`${side}Foot`, 0.2 + tuck * 0.18);
      this.set(`${side}UpperArm`, -0.75 - tuck * 0.5, 0, -sign * 1.05);
      this.set(`${side}LowerArm`, 0, -sign * (0.45 + tuck * 0.4));
    }
  }
}
