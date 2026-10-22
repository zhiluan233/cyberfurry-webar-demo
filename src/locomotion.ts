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
  { id: 'sneak', label: '潜行', description: '降低重心，轻柔落脚，手臂收拢保持警觉。', speedMultiplier: 0.55, capsuleScale: 0.83 },
  { id: 'crouch', label: '蹲行', description: '持续屈髋屈膝，小步前行，踝关节补偿。', speedMultiplier: 0.42, capsuleScale: 0.68 },
  { id: 'crawl', label: '四肢爬行', description: '低姿态交叉支撑，手掌着地、肘膝交替回收。', speedMultiplier: 0.34, capsuleScale: 0.52 },
  { id: 'ladder', label: '攀爬梯子', description: '交替向上抓握，屈肘拉升、抬膝寻找踏棍。', speedMultiplier: 0.4, capsuleScale: 1 },
  { id: 'stairs-up', label: '上楼梯', description: '抬腿越阶，前脚掌承重，伸膝抬升身体。', speedMultiplier: 0.64, capsuleScale: 1 },
  { id: 'stairs-down', label: '下楼梯', description: '前脚探阶，支撑腿屈膝缓冲，手臂辅助平衡。', speedMultiplier: 0.58, capsuleScale: 1 },
  { id: 'backward', label: '后退', description: '脚尖先探地，缩短步幅，肩颈侧转观察。', speedMultiplier: 0.62, capsuleScale: 1 },
  { id: 'strafe-left', label: '向左侧移', description: '左脚打开、右脚并拢，屈膝横向转移重心。', speedMultiplier: 0.7, capsuleScale: 1 },
  { id: 'strafe-right', label: '向右侧移', description: '右脚打开、左脚并拢，上身朝向保持稳定。', speedMultiplier: 0.7, capsuleScale: 1 },
  { id: 'hop', label: '双脚跳行', description: '双腿同步预蹲、伸展腾空、屈膝吸收落地。', speedMultiplier: 0.78, capsuleScale: 1 },
  { id: 'swim', label: '自由泳', description: '水平俯卧、左右滚转、曲肘划水和交替打腿。', speedMultiplier: 0.72, capsuleScale: 0.42 },
  { id: 'balance', label: '平衡木', description: '双臂展开，脚尖沿中线落下，躯干微调平衡。', speedMultiplier: 0.42, capsuleScale: 1 },
  { id: 'march', label: '高抬腿', description: '大幅抬膝，伸直支撑腿，对侧屈肘前摆。', speedMultiplier: 0.76, capsuleScale: 1 },
  { id: 'tiptoe', label: '踮脚', description: '提踵、前脚掌轻落，保持柔和的膝踝弹性。', speedMultiplier: 0.48, capsuleScale: 1 },
  { id: 'wade', label: '涉水', description: '高抬脚跨过水面，缓慢落脚，手臂向外平衡。', speedMultiplier: 0.45, capsuleScale: 1 },
  { id: 'skate', label: '滑步', description: '交替向侧后方蹬伸，屈膝滑行与骨盆侧移。', speedMultiplier: 1.45, capsuleScale: 0.9 },
  { id: 'limping', label: '跛行', description: '不对称支撑时间、右腿减负、肩部补偿。', speedMultiplier: 0.5, capsuleScale: 1 },
  { id: 'dance', label: '律动步', description: '交叉踏步，肩髋反向扭转，手腕与肘关节律动。', speedMultiplier: 0.65, capsuleScale: 1 },
];

const BONE_NAMES: VRMHumanBoneName[] = [
  'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
  'leftShoulder', 'rightShoulder', 'leftUpperArm', 'rightUpperArm',
  'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand',
  'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg',
  'leftFoot', 'rightFoot', 'leftToes', 'rightToes',
];
type BoneState = { node: THREE.Object3D; rotation: THREE.Quaternion; position: THREE.Vector3; pose: THREE.Euler };
const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;

/** Animates normalized humanoid bones, with +Z forward and a T-pose rest pose.
 * Rotations are relative to captured rest transforms, never accumulated frame to frame.
 * Missing optional bones (toes, chest, shoulders, etc.) are safely ignored.
 */
export class ProceduralLocomotion {
  private readonly bones = new Map<VRMHumanBoneName, BoneState>();
  private readonly rotation = new THREE.Quaternion();
  private readonly offset = new THREE.Vector3();
  private readonly targetPosition = new THREE.Vector3();
  private phase = 0;
  private time = 0;
  private activity = 0;
  private wasGrounded = true;
  private airTime = 0;
  private landing = 0;
  private readonly legHeight: number;

  constructor(getBone: (name: VRMHumanBoneName) => THREE.Object3D | null) {
    for (const name of BONE_NAMES) {
      const node = getBone(name);
      if (node) this.bones.set(name, { node, rotation: node.quaternion.clone(), position: node.position.clone(), pose: new THREE.Euler() });
    }
    const hips = this.bones.get('hips')?.node;
    const foot = this.bones.get('leftFoot')?.node ?? this.bones.get('rightFoot')?.node;
    if (hips && foot) {
      const hipPosition = hips.getWorldPosition(new THREE.Vector3());
      const footPosition = foot.getWorldPosition(new THREE.Vector3());
      const parentScale = hips.parent?.getWorldScale(new THREE.Vector3()).y ?? 1;
      this.legHeight = Math.max(0.1, Math.abs(hipPosition.y - footPosition.y) / Math.max(0.001, Math.abs(parentScale)));
    } else this.legHeight = Math.max(0.5, hips?.position.y ?? 0.9);
  }

  reset(): void {
    for (const bone of this.bones.values()) {
      bone.node.quaternion.copy(bone.rotation);
      bone.node.position.copy(bone.position);
    }
    this.phase = this.time = this.activity = this.airTime = this.landing = 0;
    this.wasGrounded = true;
  }

  update(deltaSeconds: number, style: LocomotionStyle, moving: boolean, grounded: boolean, speed: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    const delta = Math.min(deltaSeconds, 0.05);
    const active = moving && Number.isFinite(speed) && speed > 0.001;
    this.activity = THREE.MathUtils.damp(this.activity, active ? 1 : 0, 10, delta);
    this.time += delta;
    const cadence = style === 'sprint' ? 2.9 : style === 'run' ? 2.3 : style === 'hop' ? 1.55
      : style === 'crawl' || style === 'ladder' || style === 'swim' ? 0.85
        : style === 'sneak' || style === 'crouch' || style === 'balance' ? 0.95 : 1.4;
    const multiplier = LOCOMOTION_STYLES.find(entry => entry.id === style)?.speedMultiplier ?? 1;
    // Account for each style's travel speed so slow locomotion does not shuffle rapidly.
    const speedRatio = Number.isFinite(speed) ? clamp(speed / (1.5 * multiplier), 0.35, 1.8) : 1;
    this.phase = (this.phase + delta * TAU * cadence * Math.sqrt(speedRatio) * this.activity) % TAU;
    for (const bone of this.bones.values()) bone.pose.set(0, 0, 0);
    this.offset.set(0, 0, 0);
    this.idlePose();
    this.gaitPose(style);

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
    const blend = 1 - Math.exp(-delta * 16);
    for (const [name, bone] of this.bones) {
      this.rotation.setFromEuler(bone.pose).premultiply(bone.rotation);
      bone.node.quaternion.slerp(this.rotation, blend);
      if (name === 'hips') {
        this.targetPosition.copy(bone.position).addScaledVector(this.offset, this.legHeight);
        bone.node.position.lerp(this.targetPosition, blend);
      }
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
    this.add('spine', (running ? 0.18 : low ? 0.23 : 0.035) * (low ? 1 : a), -Math.sin(p) * 0.11 * a);
    this.add('chest', running ? 0.05 * a : 0, -Math.sin(p) * 0.06 * a);
    this.add('head', (running ? -0.17 : low ? -0.19 : 0) * (low ? 1 : a));
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
      this.set(`${side}UpperArm`, swing * (running ? 0.88 : 0.4) * a - (low ? 0.2 : 0.03), 0, -sign * (low ? 1.32 : 1.43));
      this.set(`${side}LowerArm`, 0, -sign * (running ? 1.35 + swing * 0.2 * a : low ? 0.7 : 0.17 + Math.max(0, -swing) * 0.28 * a));
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
    if (style === 'backward') { this.set('neck', 0, 0.19); this.set('head', 0, 0.25); }
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
    const a = this.activity;
    const wave = Math.sin(this.phase);
    this.offset.x = wave * 0.055 * a;
    this.offset.y = -0.055 - Math.abs(wave) * 0.025 * a;
    this.set('hips', 0, 0, -direction * 0.035 * a);
    this.set('spine', 0.08, 0, direction * 0.035 * a);
    for (const side of ['left', 'right'] as const) {
      const sign = side === 'left' ? 1 : -1;
      const lead = sign === direction;
      const lift = Math.max(0, lead ? wave : -wave) * a;
      this.set(`${side}UpperLeg`, -0.18 - lift * 0.1, 0, direction * wave * 0.28 * a);
      this.set(`${side}LowerLeg`, 0.36 + lift * 0.35);
      this.set(`${side}Foot`, -0.18 - lift * 0.25, 0, -direction * wave * 0.25 * a);
      this.set(`${side}UpperArm`, -0.15, 0, -sign * 1.12);
      this.set(`${side}LowerArm`, 0, -sign * 0.75);
    }
  }

  private crawlPose(): void {
    const a = this.activity;
    this.offset.set(Math.sin(this.phase) * 0.03 * a, -0.5 + Math.cos(this.phase * 2) * 0.015 * a, 0);
    this.set('hips', 1.28, Math.sin(this.phase) * 0.045 * a);
    this.set('spine', 0.1, -Math.sin(this.phase) * 0.06 * a);
    this.set('chest', 0.02);
    this.set('neck', -0.35);
    this.set('head', -0.85);
    for (const side of ['left', 'right'] as const) {
      const sign = side === 'left' ? 1 : -1;
      const phase = this.phase + (side === 'right' ? Math.PI : 0);
      const wave = Math.sin(phase) * a;
      const lift = Math.max(0, Math.cos(phase)) * a;
      this.set(`${side}UpperLeg`, -1.5 - wave * 0.21, 0, sign * 0.13);
      this.set(`${side}LowerLeg`, 1.88 + lift * 0.08);
      this.set(`${side}Foot`, -1.6 - lift * 0.08);
      this.set(`${side}Toes`, 0.3);
      this.set(`${side}UpperArm`, -1.46 + wave * 0.32, 0, -sign * 1.38);
      this.set(`${side}LowerArm`, 0, -sign * (0.22 + Math.max(0, -Math.cos(phase)) * 0.65 * a));
      this.set(`${side}Hand`, 0.1, sign * 0.16, -sign * 1.02);
    }
  }

  private ladderPose(): void {
    const a = this.activity;
    this.offset.set(Math.sin(this.phase) * 0.028 * a, -0.08 + Math.sin(this.phase * 2) * 0.028 * a, 0.02);
    this.set('hips', 0.07, Math.sin(this.phase) * 0.05 * a);
    this.set('spine', 0.1);
    this.set('chest', -0.06);
    this.set('head', -0.28);
    for (const side of ['left', 'right'] as const) {
      const sign = side === 'left' ? 1 : -1;
      const wave = Math.sin(this.phase + (side === 'right' ? Math.PI : 0)) * a;
      this.set(`${side}UpperLeg`, -0.6 - wave * 0.4);
      this.set(`${side}LowerLeg`, 0.9 + wave * 0.45);
      this.set(`${side}Foot`, -0.3 - wave * 0.05);
      this.set(`${side}UpperArm`, -2.25 + wave * 0.48, 0, -sign * 1.22);
      this.set(`${side}LowerArm`, 0, -sign * (0.68 + wave * 0.4));
      this.set(`${side}Hand`, 0, sign * 0.18, sign * 0.22);
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
    const a = this.activity;
    const wave = Math.sin(this.phase);
    this.offset.x = wave * 0.08 * a;
    this.offset.y = -0.04 - Math.abs(Math.cos(this.phase)) * 0.07 * a;
    this.set('hips', 0.04, wave * 0.23 * a, wave * 0.08 * a);
    this.set('chest', 0, -wave * 0.32 * a);
    this.set('head', 0, wave * 0.13 * a);
    for (const side of ['left', 'right'] as const) {
      const sign = side === 'left' ? 1 : -1;
      const step = Math.max(0, wave * sign) * a;
      this.set(`${side}UpperLeg`, -0.23 - step * 0.35, -sign * 0.08, wave * 0.16 * a);
      this.set(`${side}LowerLeg`, 0.46 + step * 0.3);
      this.set(`${side}Foot`, -0.23 + step * 0.05);
      this.set(`${side}UpperArm`, -0.45 + wave * sign * 0.45 * a, 0, -sign * 0.75);
      this.set(`${side}LowerArm`, 0, -sign * (1.1 + wave * sign * 0.35 * a));
      this.set(`${side}Hand`, wave * 0.22 * a, 0, sign * 0.2);
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
