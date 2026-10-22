import * as THREE from 'three';
import type { VRMHumanBoneName } from '@pixiv/three-vrm';

/** A lightweight articulated, normalized T-pose rig. No model download required. */
export function createDemoCharacter(): { scene: THREE.Group; getBone: (name: VRMHumanBoneName) => THREE.Object3D | null } {
  const scene = new THREE.Group();
  scene.name = 'Articulated locomotion demonstrator';
  const bones = new Map<VRMHumanBoneName, THREE.Object3D>();
  const shell = new THREE.MeshStandardMaterial({ color: 0x42bfaf, roughness: 0.66, metalness: 0.1 });
  const lightShell = new THREE.MeshStandardMaterial({ color: 0xd2ddd3, roughness: 0.75 });
  const joints = new THREE.MeshStandardMaterial({ color: 0x233c42, roughness: 0.7, metalness: 0.15 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xf0b653, roughness: 0.6 });
  const visor = new THREE.MeshStandardMaterial({ color: 0x102a38, roughness: 0.3, metalness: 0.25 });
  const eye = new THREE.MeshBasicMaterial({ color: 0xb7ffe3 });

  function bone(name: VRMHumanBoneName, parent: THREE.Object3D, x: number, y: number, z = 0): THREE.Group {
    const node = new THREE.Group();
    node.name = name;
    node.position.set(x, y, z);
    parent.add(node);
    bones.set(name, node);
    return node;
  }
  function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function sphere(parent: THREE.Object3D, radius: number, material = joints): void {
    mesh(parent, new THREE.SphereGeometry(radius, 12, 8), material);
  }
  function segment(parent: THREE.Object3D, end: THREE.Vector3, radius: number, material: THREE.Material): void {
    const length = end.length();
    const piece = mesh(parent, new THREE.CapsuleGeometry(radius, Math.max(0.01, length - radius * 2.2), 4, 10), material);
    piece.position.copy(end).multiplyScalar(0.5);
    piece.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().normalize());
  }

  const hips = bone('hips', scene, 0, 0.89);
  mesh(hips, new THREE.SphereGeometry(0.17, 16, 12), joints, 0, 0.025).scale.set(1, 0.65, 0.65);
  const spine = bone('spine', hips, 0, 0.11);
  mesh(spine, new THREE.CapsuleGeometry(0.105, 0.07, 4, 12), joints, 0, 0.035);
  const chest = bone('chest', spine, 0, 0.17);
  mesh(chest, new THREE.SphereGeometry(0.19, 16, 12), shell, 0, 0.055).scale.set(1, 0.85, 0.63);
  // Warm center badge and pale chest panel make the body's forward direction legible.
  mesh(chest, new THREE.BoxGeometry(0.16, 0.12, 0.025), lightShell, 0, 0.075, 0.109);
  mesh(chest, new THREE.BoxGeometry(0.055, 0.045, 0.03), accent, 0, 0.075, 0.127);
  const upperChest = bone('upperChest', chest, 0, 0.13);
  const neck = bone('neck', upperChest, 0, 0.055);
  sphere(neck, 0.055);
  const head = bone('head', neck, 0, 0.115);
  mesh(head, new THREE.SphereGeometry(0.13, 20, 16), lightShell, 0, 0.035).scale.set(0.88, 1.12, 0.93);
  mesh(head, new THREE.SphereGeometry(0.103, 16, 10), visor, 0, 0.04, 0.07).scale.set(0.92, 0.5, 0.65);
  for (const x of [-0.04, 0.04]) mesh(head, new THREE.BoxGeometry(0.027, 0.016, 0.015), eye, x, 0.045, 0.133);
  // Two small ears keep the mannequin recognizable at overview-camera distances.
  for (const x of [-0.08, 0.08]) {
    const ear = mesh(head, new THREE.ConeGeometry(0.043, 0.105, 4), shell, x, 0.17, -0.007);
    ear.rotation.z = -Math.sign(x) * 0.15;
  }
  for (const side of ['left', 'right'] as const) {
    const sign = side === 'left' ? 1 : -1;
    const shoulder = bone(`${side}Shoulder`, upperChest, sign * 0.12, -0.025);
    const upperArm = bone(`${side}UpperArm`, shoulder, sign * 0.085, 0);
    sphere(upperArm, 0.066, shell);
    segment(upperArm, new THREE.Vector3(sign * 0.255, 0, 0), 0.052, lightShell);
    const elbow = bone(`${side}LowerArm`, upperArm, sign * 0.255, 0);
    sphere(elbow, 0.055);
    // Visible yellow joint caps make elbow/knee articulation easy to inspect.
    mesh(elbow, new THREE.SphereGeometry(0.036, 10, 8), accent, 0, 0, 0.036).scale.z = 0.45;
    segment(elbow, new THREE.Vector3(sign * 0.225, 0, 0), 0.047, shell);
    const hand = bone(`${side}Hand`, elbow, sign * 0.225, 0);
    sphere(hand, 0.037);
    mesh(hand, new THREE.BoxGeometry(0.09, 0.045, 0.074), lightShell, sign * 0.045, 0);
    mesh(hand, new THREE.CapsuleGeometry(0.017, 0.04, 3, 8), joints, sign * 0.04, 0, 0.045).rotation.z = sign * Math.PI / 3;

    const thigh = bone(`${side}UpperLeg`, hips, sign * 0.098, -0.015);
    sphere(thigh, 0.065);
    segment(thigh, new THREE.Vector3(0, -0.39, 0), 0.067, shell);
    const knee = bone(`${side}LowerLeg`, thigh, 0, -0.39);
    sphere(knee, 0.059);
    mesh(knee, new THREE.SphereGeometry(0.041, 12, 8), accent, 0, 0, 0.046).scale.z = 0.45;
    segment(knee, new THREE.Vector3(0, -0.39, 0), 0.053, lightShell);
    const foot = bone(`${side}Foot`, knee, 0, -0.39);
    sphere(foot, 0.043);
    mesh(foot, new THREE.BoxGeometry(0.105, 0.065, 0.15), joints, 0, -0.035, 0.015);
    const toes = bone(`${side}Toes`, foot, 0, -0.03, 0.085);
    mesh(toes, new THREE.BoxGeometry(0.108, 0.055, 0.09), shell, 0, -0.005, 0.035);
  }
  scene.updateMatrixWorld(true);
  return { scene, getBone: name => bones.get(name) ?? null };
}
