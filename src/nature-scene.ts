import * as THREE from 'three';

export interface DemoStation {
  id: string;
  label: string;
  description: string;
  style: string;
  waypoints: THREE.Vector3[];
  behavior?: string;
  traversal?: 'ground' | 'ladder' | 'swim';
  cameraPosition: THREE.Vector3;
}

export interface NatureSceneResult {
  group: THREE.Group;
  colliders: THREE.Mesh[];
  stations: DemoStation[];
}

const point = (x: number, z: number, y = 0) => new THREE.Vector3(x, y, z);

function ellipseRoute(x: number, z: number, rx: number, rz: number, count = 24, y = 0): THREE.Vector3[] {
  return Array.from({ length: count + 1 }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    return point(x + Math.cos(angle) * rx, z + Math.sin(angle) * rz, y);
  });
}

/** A continuous, metre-scale park. Only solid surfaces enter the collision world. */
export function createNatureScene(): NatureSceneResult {
  const group = new THREE.Group();
  group.name = 'Locomotion garden · 运动实验公园';
  const colliders: THREE.Mesh[] = [];
  const stations: DemoStation[] = [];
  const material = (color: number, roughness = 0.92) => new THREE.MeshStandardMaterial({ color, roughness });
  const grass = material(0x709974);
  const darkGrass = material(0x527e60);
  const sand = material(0xcec7ac);
  const stone = material(0xa7b9b5);
  const paleStone = material(0xd3d9cd);
  const slate = material(0x38585f);
  const wood = material(0xa6744f);
  const darkWood = material(0x72533e);
  const metal = material(0x3c6666, 0.6);
  const white = material(0xe5eee3);
  const coral = material(0xe39a77);
  const mint = material(0x94d7b9);
  const trackMaterial = material(0x6b8e9d);

  const add = <T extends THREE.Mesh>(mesh: T, solid = false): T => {
    mesh.castShadow = solid;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (solid) {
      mesh.userData.isEnvironmentCollider = true;
      colliders.push(mesh);
    }
    return mesh;
  };
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material, solid = true) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    return add(mesh, solid);
  };
  const disk = (x: number, z: number, radius: number, mat: THREE.Material, y = 0.012) => {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 64), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    return add(mesh);
  };
  const path = (x: number, z: number, w: number, d: number, mat = sand) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.009, z);
    return add(mesh);
  };
  const line = (points: THREE.Vector3[], color: number, radius = 0.018) => {
    const curve = new THREE.CatmullRomCurve3(points);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(24, points.length * 4), radius, 4, false), material(color));
    add(mesh);
  };
  const pole = (x: number, z: number, height: number, radius: number, mat: THREE.Material, y = 0, solid = true) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 8), mat);
    mesh.position.set(x, y + height / 2, z);
    return add(mesh, solid);
  };
  const sign = (x: number, z: number, title: string, subtitle: string, color = '#b6dfcb') => {
    // The geometry can also be validated in Node without requiring a canvas implementation.
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#173937';
    ctx.fillRect(0, 0, 768, 256);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 12, 256);
    ctx.font = 'bold 50px "Microsoft YaHei", sans-serif';
    ctx.fillText(title, 40, 106, 685);
    ctx.fillStyle = '#d3e3d8';
    ctx.font = '27px "Microsoft YaHei", sans-serif';
    ctx.fillText(subtitle, 40, 172, 685);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.83), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
    board.position.set(x, 1.24, z);
    board.rotation.y = Math.atan2(-x, -z);
    add(board);
    pole(x, z, 1.25, 0.045, metal);
  };
  const bench = (x: number, z: number, yaw = 0) => {
    const benchGroup = new THREE.Group();
    const pieces = [
      [0, 0.44, 0, 1.65, 0.12, 0.52, wood],
      [0, 0.8, -0.23, 1.65, 0.43, 0.09, wood],
      [-0.58, 0.2, 0, 0.09, 0.4, 0.42, metal],
      [0.58, 0.2, 0, 0.09, 0.4, 0.42, metal],
    ] as const;
    for (const [px, py, pz, w, h, d, mat] of pieces) {
      const piece = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      piece.position.set(px, py, pz);
      piece.castShadow = true;
      piece.receiveShadow = true;
      piece.userData.isEnvironmentCollider = true;
      colliders.push(piece);
      benchGroup.add(piece);
    }
    benchGroup.position.set(x, 0, z);
    benchGroup.rotation.y = yaw;
    group.add(benchGroup);
  };
  const planter = (x: number, z: number, w: number, d: number, height = 0.65) => {
    box(x, height / 2, z, w, height, d, paleStone);
    box(x, height + 0.12, z, w * 0.86, 0.25, d * 0.82, darkGrass, false);
    for (let i = 0; i < 5; i += 1) {
      const flower = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), i % 2 ? coral : mint);
      flower.position.set(x - w * 0.32 + w * 0.16 * i, height + 0.27, z + Math.sin(i * 2) * d * 0.22);
      add(flower);
    }
  };
  const station = (entry: DemoStation) => stations.push(entry);

  // Flat continuous ground avoids decorative terrain lifting or trapping the character.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(42, 42), grass);
  ground.rotation.x = -Math.PI / 2;
  ground.name = 'Continuous park ground · y=0';
  add(ground, true);
  path(0, 0, 5.4, 37);
  path(0, 0, 37, 4.5);
  path(8.5, -4.6, 13, 2.4);
  path(-9, 9.4, 13, 2.1);
  path(7.6, 7, 16.2, 2.1);
  disk(0, 0, 4.4, paleStone);
  line(ellipseRoute(0, 0, 3.8, 3.8, 64, 0.029), 0x799b8b, 0.028);
  line(ellipseRoute(0, 0, 2.4, 2.4, 48, 0.031), 0x99b6a7, 0.018);
  const eightRoute = Array.from({ length: 41 }, (_, i) => {
    const phase = i / 40 * Math.PI * 2;
    return point(Math.sin(phase) * 3.2, Math.sin(phase * 2) * 1.8);
  });
  line(eightRoute.map(p => p.clone().setY(0.035)), 0xb2bda8, 0.018);
  sign(-3.8, 4.5, '运动实验公园', 'LOCOMOTION GARDEN · 21 种步态');
  bench(-4.3, 1.7, Math.PI / 2);
  bench(4.3, 1.7, -Math.PI / 2);
  station({ id: 'garden-walk', label: '漫步 · 中央广场', description: '平坦步道观察脚掌落地、膝盖缓冲和手臂反向摆动。', style: 'walk', waypoints: [point(-2.7, 3), point(-2.7, -2.7), point(2.7, -2.7), point(2.7, 3)], cameraPosition: point(8, 11, 7) });
  station({ id: 'garden-march', label: '行进 · 仪仗步道', description: '高抬膝与屈肘摆臂，沿广场南侧整齐行进。', style: 'march', waypoints: [point(-3, 5.8), point(3, 5.8), point(3, 3)], cameraPosition: point(7, 11, 5) });
  station({ id: 'garden-dance', label: '舞步 · 广场舞台', description: '低重心侧移、交替点步与手臂节奏，观察全身协调。', style: 'dance', waypoints: ellipseRoute(0, 0, 1.8, 1.8), cameraPosition: point(6, 8, 4) });

  // Two-lane oval: painted markings never obstruct movement.
  const trackShape = new THREE.Shape();
  trackShape.absellipse(-11, 0, 5.2, 8.3, 0, Math.PI * 2, false, 0);
  const trackHole = new THREE.Path();
  trackHole.absellipse(-11, 0, 3.2, 6.3, 0, Math.PI * 2, true, 0);
  trackShape.holes.push(trackHole);
  const track = new THREE.Mesh(new THREE.ShapeGeometry(trackShape, 96), trackMaterial);
  track.rotation.x = -Math.PI / 2;
  track.position.y = 0.016;
  add(track);
  for (const [rx, rz] of [[3.35, 6.45], [4.2, 7.3], [5.05, 8.15]]) {
    line(ellipseRoute(-11, 0, rx, rz, 80, 0.037), 0xd1e4dd, 0.02);
  }
  path(-15.15, 0, 1.8, 0.12, white).position.y = 0.04;
  path(-15.15, 0.28, 1.8, 0.12, white).position.y = 0.04;
  for (let i = 0; i < 5; i += 1) pole(-11, -3 + i * 1.5, 0.36, 0.08, coral, 0, false);
  sign(-16.8, -6.9, '01 / 环形跑道', 'RUN · SPRINT · 步频与腾空');
  bench(-17.8, 1.7, Math.PI / 2);
  station({ id: 'track-run', label: '跑步 · 林间跑道', description: '完整椭圆赛道，观察前倾、屈肘、后蹬与腾空。', style: 'run', waypoints: ellipseRoute(-11, 0, 4.2, 7.3), cameraPosition: point(-20, 11, 10) });
  station({ id: 'track-sprint', label: '冲刺 · 外圈加速', description: '大幅摆臂、高抬腿与更长腾空阶段。', style: 'sprint', waypoints: ellipseRoute(-11, 0, 4.7, 7.8), cameraPosition: point(-21, 4, 7) });

  // A direct line crosses the three walls, while alternating gaps form a valid navigation path.
  path(0, -11.9, 8.8, 11.2, paleStone);
  box(-4.45, 0.38, -11.8, 0.22, 0.76, 10.7, stone);
  box(4.45, 0.38, -11.8, 0.22, 0.76, 10.7, stone);
  for (let i = 0; i < 3; i += 1) {
    const x = i % 2 ? 1 : -1;
    const z = -8.7 - i * 3;
    box(x, 0.7, z, 5.1, 1.4, 0.45, slate);
    box(x, 1.43, z, 5.2, 0.08, 0.54, mint, false);
    disk(i % 2 ? -3.1 : 3.1, z, 0.35, coral, 0.025);
  }
  disk(0, -6.7, 0.5, mint, 0.027);
  disk(0, -16.5, 0.5, coral, 0.027);
  sign(5.6, -7.6, '02 / 寻路花园', 'NAVIGATION · 直线与绕障对比');
  station({ id: 'navigation-maze', label: '绕障 · 寻路迷宫', description: '起终点直线穿过三道墙。切换寻路/移动模式对比自动绕障与直线受阻。', style: 'walk', waypoints: [point(0, -6.7), point(0, -16.5)], cameraPosition: point(12, -4, 12) });

  // Real stair colliders have exactly 20 cm rises; their painted nosings are decorative.
  path(10, -9.1, 4.8, 10.4);
  for (let i = 0; i < 8; i += 1) {
    const height = (i + 1) * 0.2;
    const z = -6.25 - i * 0.5;
    box(10, height / 2, z, 3.2, height, 0.5, i % 2 ? paleStone : stone).name = `Stair ${i + 1} · rise 0.20m`;
    box(10, height + 0.006, z + 0.19, 3.18, 0.012, 0.055, white, false);
  }
  box(10, 0.8, -11.35, 3.2, 1.6, 2.7, paleStone);
  for (const x of [8.26, 11.74]) {
    for (let i = 0; i < 5; i += 1) pole(x, -6.2 - i * 1.25, 0.75, 0.045, metal, Math.min(1.6, 0.2 + i * 0.5));
    const rail = box(x, 1.57, -8.05, 0.07, 0.07, 4.25, metal, false);
    rail.rotation.x = Math.atan2(1.4, 3.5);
  }
  sign(12.8, -5.7, '03 / 台阶观景台', 'STAIRS · 20 cm 真实台阶');
  const upStairs = [point(10, -5.3), ...Array.from({ length: 8 }, (_, i) => point(10, -6.25 - i * 0.5, (i + 1) * 0.2)), point(10, -11.4, 1.6)];
  station({ id: 'stairs-ascent', label: '上楼梯 · 观景台', description: '逐级登上 20 cm 实体台阶，强调抬膝、脚尖净空与髋部重心转移。', style: 'stairs-up', waypoints: upStairs, cameraPosition: point(16, -2, 6) });
  station({ id: 'stairs-descent', label: '下楼梯 · 缓冲落脚', description: '从平台逐级下行，用弯膝与踝部缓冲控制落脚。', style: 'stairs-down', waypoints: [...upStairs].reverse().map(p => p.clone()), cameraPosition: point(16, -2, 6) });

  // Ladder routes explicitly include vertical travel instead of treating the platform as ground.
  box(15.1, 2.28, -14, 3.5, 0.24, 3.8, wood);
  for (const x of [13.55, 16.65]) for (const z of [-15.65, -12.35]) pole(x, z, 2.3, 0.1, darkWood);
  for (const x of [14.55, 15.65]) pole(x, -11.98, 3.05, 0.045, metal);
  for (let i = 0; i < 10; i += 1) box(15.1, 0.17 + i * 0.25, -11.98, 1.12, 0.055, 0.065, wood);
  for (const x of [13.45, 16.75]) {
    box(x, 2.9, -14, 0.06, 0.06, 3.8, metal);
    pole(x, -15.85, 0.65, 0.04, metal, 2.4);
    pole(x, -12.15, 0.65, 0.04, metal, 2.4);
  }
  box(15.1, 2.9, -15.85, 3.3, 0.06, 0.06, metal);
  sign(17.9, -10.5, '04 / 攀爬瞭望台', 'LADDER · 交替抓握与蹬梯');
  station({ id: 'ladder-lookout', label: '爬梯 · 瞭望台', description: '交替抓握梯级并抬膝蹬梯，垂直登上 2.4 m 平台后原路下降。', style: 'ladder', traversal: 'ladder', waypoints: [point(15.1, -10.85), point(15.1, -11.65), point(15.1, -11.65, 2.4), point(15.1, -13.1, 2.4), point(15.1, -11.65, 2.4), point(15.1, -11.65)], cameraPosition: point(20, -6, 6) });

  // Covered passages have real roofs: a standing capsule cannot walk straight through.
  path(0.2, 11.2, 2.8, 7.2);
  for (const x of [-0.92, 1.32]) box(x, 0.52, 11.2, 0.18, 1.04, 4.8, stone);
  box(0.2, 1.08, 11.2, 2.42, 0.24, 4.8, wood).name = 'Crawl tunnel roof · clearance 0.96m';
  for (let i = 0; i < 6; i += 1) box(0.2, 1.21, 9.05 + i * 0.85, 2.45, 0.04, 0.06, darkWood, false);
  line([point(0.2, 8, 0.026), point(0.2, 14.6, 0.026)], 0xe0d3a0, 0.045);
  path(4.3, 10.9, 2.6, 7.3);
  for (const z of [9, 10.9, 12.8]) {
    box(3.25, 0.725, z, 0.16, 1.45, 0.24, metal);
    box(5.35, 0.725, z, 0.16, 1.45, 0.24, metal);
    box(4.3, 1.53, z, 2.25, 0.16, 0.36, mint).name = 'Crouch arch · clearance 1.45m';
  }
  sign(-2.2, 8.1, '05 / 低姿态通道', 'CRAWL · CROUCH · 实体限高');
  station({ id: 'crawl-tunnel', label: '爬行 · 低矮隧道', description: '0.96 m 净高通道，前臂支撑、屈膝推进与对侧手脚交替。', style: 'crawl', waypoints: [point(0.2, 7.8), point(0.2, 14.6)], cameraPosition: point(-6, 16, 4) });
  station({ id: 'crouch-arches', label: '蹲行 · 三重矮门', description: '穿过 1.45 m 净高拱门，保持屈膝低重心与小步幅。', style: 'crouch', waypoints: [point(4.3, 7.6), point(4.3, 14.4)], cameraPosition: point(9, 17, 4.7) });

  // Quiet garden with cover, tiptoe markings and a recovery path.
  path(11.5, 2.5, 10.6, 6.3, sand);
  for (const z of [1.5, 3.5]) {
    planter(9.1, z, 1.25, 1.4, 0.8);
    planter(13, z, 1.35, 1.4, 1.05);
  }
  for (let i = 0; i < 9; i += 1) disk(6.5 + i * 0.65, -0.15, 0.13, mint, 0.027);
  bench(15.6, -2.1);
  bench(8.7, -2.1);
  sign(17.4, 5.7, '06 / 静谧花园', 'SNEAK · TIPTOE · RECOVERY');
  station({ id: 'sneak-cover', label: '潜行 · 花箱掩体', description: '在高低花箱之间保持弯膝、内收手臂与轻柔落脚。', style: 'sneak', waypoints: [point(7, -0.1), point(7, 5), point(11, 5), point(11, -0.1), point(15.2, -0.1), point(15.2, 5)], cameraPosition: point(20, 10, 7) });
  station({ id: 'tiptoe-path', label: '踮脚 · 静音步道', description: '前脚掌着地、脚跟抬起，观察踝关节与微屈膝。', style: 'tiptoe', waypoints: [point(6.5, -0.15), point(11.7, -0.15)], cameraPosition: point(15, 6, 4) });
  station({ id: 'recovery-walk', label: '跛行 · 康复步道', description: '一侧短支撑、另一侧补偿步幅，配合上身轻微侧倾。', style: 'limping', waypoints: [point(6, -4.5), point(16.5, -4.5)], cameraPosition: point(14, 2, 4.5) });

  // Water is transparent decoration; the continuous ground is the real pond bottom.
  const pondBed = disk(12.1, 12.1, 1, material(0x5e978e), 0.018);
  pondBed.scale.set(4.5, 3.3, 1);
  const waterMaterial = new THREE.MeshStandardMaterial({ color: 0x5eb6bf, roughness: 0.2, metalness: 0.08, transparent: true, opacity: 0.66, depthWrite: false });
  const water = disk(12.1, 12.1, 1, waterMaterial, 0.36);
  water.scale.set(4.5, 3.3, 1);
  water.name = 'Shallow swimming pond · water 0.36m / bed 0m';
  line(ellipseRoute(12.1, 12.1, 4.58, 3.38, 72, 0.045), 0xa5b6a4, 0.08);
  for (let i = 0; i < 10; i += 1) {
    const angle = i / 10 * Math.PI;
    const x = 12.1 + Math.cos(angle) * 4.6;
    const z = 12.1 + Math.sin(angle) * 3.5;
    for (let j = 0; j < 3; j += 1) pole(x + j * 0.13, z, 0.55 + (j % 2) * 0.2, 0.018, darkGrass, 0, false);
  }
  for (let i = 0; i < 3; i += 1) {
    const lily = disk(9.2 + i * 2.1, 13.8 + i % 2 * 0.2, 0.27, darkGrass, 0.374);
    lily.scale.y = 0.7;
  }
  sign(17.7, 8.6, '07 / 浅水湿地', 'SWIM · WADE · 水中姿态');
  station({ id: 'pond-swim', label: '游泳 · 浅水湿地', description: '水平身体姿态、轮流划臂与屈膝打水；水面为演示材质。', style: 'swim', traversal: 'swim', waypoints: ellipseRoute(12.1, 12.1, 2.9, 1.7, 24, 0.12), cameraPosition: point(20, 20, 7) });
  station({ id: 'pond-wade', label: '涉水 · 湿地岸线', description: '高抬膝跨过水面，前伸手臂维持平衡，脚落在真实池底。', style: 'wade', waypoints: [point(9.5, 11.3), point(14.9, 11.3), point(14.9, 12.6), point(9.5, 12.6)], cameraPosition: point(19, 18, 5) });

  // The 0.76 m balance beam accommodates a default capsule and has 0.20 m approach steps.
  path(-10.4, 11.3, 11.3, 2.6);
  box(-10.4, 0.3, 11.3, 5.6, 0.6, 0.76, wood);
  for (const side of [-1, 1]) {
    box(-10.4 + side * 3.2, 0.2, 11.3, 0.8, 0.4, 0.9, wood);
    box(-10.4 + side * 4, 0.1, 11.3, 0.8, 0.2, 1.1, wood);
  }
  line([point(-13.15, 11.3, 0.61), point(-7.65, 11.3, 0.61)], 0xe7dba9, 0.022);
  const balanceRoute = [point(-15.4, 11.3), point(-14.4, 11.3, 0.2), point(-13.6, 11.3, 0.4), point(-12.8, 11.3, 0.6), point(-8, 11.3, 0.6), point(-7.2, 11.3, 0.4), point(-6.4, 11.3, 0.2), point(-5.4, 11.3)];
  const hopRoute = Array.from({ length: 8 }, (_, i) => point(-15.4 + i * 1.25, 15.1 + i % 2 * 0.6, 0.16));
  for (const p of hopRoute) {
    const steppingStone = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.72, 0.16, 8), stone);
    steppingStone.position.set(p.x, 0.08, p.z);
    add(steppingStone, true);
    disk(p.x, p.z, 0.16, white, 0.167);
  }
  sign(-16.9, 9.5, '08 / 平衡与跳石', 'BALANCE · HOP · 重心控制');
  station({ id: 'balance-bridge', label: '平衡 · 独木桥', description: '双臂展开、踝部修正与短步支撑，沿 0.76 m 宽实体桥前进。', style: 'balance', waypoints: balanceRoute, cameraPosition: point(-17, 18, 5) });
  station({ id: 'hop-stones', label: '跳步 · 溪畔跳石', description: '交替压低重心、蹬地与弯膝落地，沿八块低矮跳石前进。', style: 'hop', waypoints: [point(-16.7, 15.1), ...hopRoute, point(-5.5, 15.7)], cameraPosition: point(-12, 21, 5) });

  // Flat court supports lateral movement and skating, with cones outside its travel lines.
  path(-13, -13.5, 8.8, 6.1, material(0xadc3bd));
  for (let i = 0; i < 5; i += 1) path(-13, -15.4 + i, 7.8, 0.035, white).position.y = 0.025;
  line(ellipseRoute(-13, -13.5, 3.45, 2.15, 48, 0.03), 0x759f94, 0.03);
  for (const x of [-17.2, -8.8]) for (const z of [-16.5, -10.5]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.45, 8), coral);
    cone.position.set(x, 0.225, z);
    add(cone, true);
  }
  sign(-17.8, -9, '09 / 多向步态练习场', 'STRAFE · BACKWARD · SKATE');
  station({ id: 'court-backward', label: '倒退 · 多向练习场', description: '身体保持反向朝向，短步后撤并通过脚踝完成触地。', style: 'backward', waypoints: [point(-16, -15.4), point(-10, -15.4)], cameraPosition: point(-13, -7, 4.5) });
  station({ id: 'court-strafe-left', label: '左侧移 · 多向练习场', description: '面向侧方的并步移动，膝盖弯曲并保持躯干稳定。', style: 'strafe-left', waypoints: [point(-16, -13.4), point(-10, -13.4)], cameraPosition: point(-13, -7, 4.5) });
  station({ id: 'court-strafe-right', label: '右侧移 · 多向练习场', description: '镜像侧移节奏，观察领步腿与跟随腿的不同落脚阶段。', style: 'strafe-right', waypoints: [point(-10, -12.4), point(-16, -12.4)], cameraPosition: point(-13, -7, 4.5) });
  station({ id: 'court-skate', label: '滑行 · 椭圆练习场', description: '交替向外蹬腿、屈膝滑行与上身侧向重心转移。', style: 'skate', waypoints: ellipseRoute(-13, -13.5, 3.45, 2.15), cameraPosition: point(-20, -6, 7) });

  // Behavior stations provide [spawn, optional focus], not a prerecorded movement route.
  // Every planner is demonstrated in the same central interaction plaza or navigation garden.
  for (const x of [-2.5, 2.5]) for (const z of [-2.5, 2.5]) disk(x, z, 0.14, coral, 0.03);
  sign(4.2, 4.8, '10 / 行为互动广场', '15 种行为 · 移动相机 / 双击目标');
  station({ id: 'behavior-manual', label: '手动 · 自由探索', description: '使用方向键或屏幕摇杆移动角色；拖动场景调整视角，也可开启 Gizmo 放置角色。', style: 'walk', behavior: 'manual', waypoints: [point(0, 0)], cameraPosition: point(6, 8, 6) });
  station({ id: 'behavior-follow-player', label: '跟随玩家 · 互动广场', description: '角色靠近当前相机后保持距离。移动相机可观察持续跟随；寻路模式会绕开障碍。', style: 'walk', behavior: 'follow-player', waypoints: [point(0, -1)], cameraPosition: point(0, 3.5, 4) });
  station({ id: 'behavior-follow-cursor', label: '跟随目标 · 追踪练习', description: '先跟随广场目标，双击地面重新设置目标点，观察角色即时改变目的地。', style: 'walk', behavior: 'follow-cursor', waypoints: [point(-2.5, 2.5), point(2.5, -2.5)], cameraPosition: point(7, 9, 6) });
  station({ id: 'behavior-go-to', label: '指定目标 · 迷宫终点', description: '记住迷宫另一端的目标，抵达后停下。切换寻路/移动模式观察绕障或直线受阻。', style: 'walk', behavior: 'go-to', waypoints: [point(0, -6.7), point(0, -16.5)], cameraPosition: point(12, -4, 12) });
  station({ id: 'behavior-random-patrol', label: '随机巡逻 · 广场巡视', description: '在广场周围随机选取目的地，抵达后短暂停留，再继续巡视；遇障时自动寻路。', style: 'walk', behavior: 'random-patrol', waypoints: [point(0, 0)], cameraPosition: point(8, 10, 8) });
  station({ id: 'behavior-patrol', label: '四点巡逻 · 广场巡线', description: '以广场中央为基点，依次巡视四个珊瑚色标记，抵达路点后停留观察。', style: 'walk', behavior: 'patrol-route', waypoints: [point(0, 0)], cameraPosition: point(8, 10, 8) });
  station({ id: 'behavior-wander', label: '漫步探索 · 林荫步道', description: '保持大致朝向并随机改变方向，交替行走和休息，离出发点过远时返回。', style: 'walk', behavior: 'wander', waypoints: [point(0, 0)], cameraPosition: point(8, 10, 8) });
  station({ id: 'behavior-orbit', label: '环绕目标 · 广场圆环', description: '围绕广场中心持续巡回，可配合不同步态观察连续转弯。', style: 'walk', behavior: 'orbit', waypoints: [point(2.4, 0), point(0, 0)], cameraPosition: point(8, 10, 8) });
  station({ id: 'behavior-figure-eight', label: '八字巡游 · 交叉路线', description: '以广场中心为交点，沿八字路线连续改变方向，展示平滑转弯。', style: 'walk', behavior: 'figure-eight', waypoints: [point(0, 0), point(0, 0)], cameraPosition: point(8, 10, 8) });
  station({ id: 'behavior-flee', label: '保持距离 · 接近退避', description: '相机初始位于警戒距离内，角色主动退至安全距离。再次靠近相机会触发退避。', style: 'run', behavior: 'flee', waypoints: [point(0, 0)], cameraPosition: point(0, 2.4, 3.5) });
  station({ id: 'behavior-approach-retreat', label: '接近退避 · 往返互动', description: '角色接近相机、停留观察，再退回安全距离；移动相机可改变互动方向。', style: 'walk', behavior: 'approach-retreat', waypoints: [point(0, -1.5)], cameraPosition: point(0, 3, 4) });
  station({ id: 'behavior-guard', label: '定点守卫 · 广场岗位', description: '相机在岗位附近时角色靠近查看，移远相机后角色返回原位等待。', style: 'walk', behavior: 'guard', waypoints: [point(0, 0)], cameraPosition: point(0, 3, 3.2) });
  station({ id: 'behavior-pace', label: '往返踱步 · 广场横线', description: '沿广场左右两端往返，在端点暂停后转身；适合比较倒退、潜行等步态。', style: 'walk', behavior: 'pace', waypoints: [point(0, 0)], cameraPosition: point(6, 8, 5) });
  station({ id: 'behavior-escort', label: '侧方伴行 · 陪伴练习', description: '移动相机，角色会根据玩家前进方向保持在侧后方，随玩家转弯调整位置。', style: 'walk', behavior: 'escort', waypoints: [point(-2.5, 0)], cameraPosition: point(0, 3, 5.5) });
  station({ id: 'behavior-search', label: '扩圈搜索 · 三环巡视', description: '以广场中心为原点，从内向外检查三圈路点，再返回中央重新搜索。', style: 'walk', behavior: 'search', waypoints: [point(0, 0)], cameraPosition: point(8, 10, 9) });

  // Perimeter planting keeps the demonstration routes clear and the central floor predictable.
  const foliage = [0x477c5b, 0x548966, 0x679976].map(color => material(color));
  for (let i = 0; i < 28; i += 1) {
    const angle = i / 28 * Math.PI * 2;
    const boundaryRadius = 19.3 / Math.max(Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle)));
    const x = Math.cos(angle) * boundaryRadius;
    const z = Math.sin(angle) * boundaryRadius;
    if (Math.abs(x) < 4 && z > 0) continue;
    const height = 2 + i % 4 * 0.18;
    pole(x, z, height, 0.17, darkWood);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.12, 0), foliage[i % 3]);
    crown.position.set(x, height + 0.57, z);
    crown.scale.y = 1.25;
    crown.rotation.y = i * 0.7;
    add(crown).castShadow = true;
  }
  for (const side of [-1, 1]) {
    for (let i = -5; i <= 5; i += 1) {
      pole(side * 20.4, i * 3.8, 0.7, 0.045, metal);
      if (Math.abs(i) > 0) pole(i * 3.8, side * 20.4, 0.7, 0.045, metal);
    }
    box(side * 20.4, 0.5, 0, 0.045, 0.06, 38.2, metal);
    box(-10.7, 0.5, side * 20.4, 17.8, 0.06, 0.045, metal);
    box(10.7, 0.5, side * 20.4, 17.8, 0.06, 0.045, metal);
  }
  group.updateMatrixWorld(true);
  return { group, colliders, stations };
}
