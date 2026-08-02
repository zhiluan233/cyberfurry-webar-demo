import * as THREE from 'three';

export interface NatureSceneResult {
  group: THREE.Group;
  colliders: THREE.Mesh[];
}

function seededRandom(seed = 42): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function markCollider(mesh: THREE.Mesh, colliders: THREE.Mesh[]): THREE.Mesh {
  mesh.userData.isEnvironmentCollider = true;
  colliders.push(mesh);
  return mesh;
}

export function createNatureScene(): NatureSceneResult {
  const group = new THREE.Group();
  group.name = 'Low-poly debug world';
  const colliders: THREE.Mesh[] = [];
  const random = seededRandom();

  const groundMat = new THREE.MeshStandardMaterial({ color: 0x4e9d62, roughness: 0.96, flatShading: true });
  const ground = markCollider(new THREE.Mesh(new THREE.PlaneGeometry(36, 36, 18, 18), groundMat), colliders);
  const position = ground.geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const edge = Math.max(0, (Math.hypot(x, y) - 7) / 11);
    position.setZ(i, Math.sin(x * 0.45) * Math.cos(y * 0.35) * 0.08 + edge * edge * 1.6);
  }
  position.needsUpdate = true;
  ground.geometry.computeVertexNormals();
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const hillMat = new THREE.MeshStandardMaterial({ color: 0x397a53, flatShading: true, roughness: 1 });
  for (let i = 0; i < 7; i += 1) {
    const angle = (i / 7) * Math.PI * 2;
    const distance = 11 + random() * 3;
    const hill = new THREE.Mesh(new THREE.ConeGeometry(3.2 + random() * 1.8, 4 + random() * 2, 7), hillMat);
    hill.position.set(Math.cos(angle) * distance, 1.5, Math.sin(angle) * distance);
    hill.rotation.y = random() * Math.PI;
    hill.castShadow = true;
    hill.receiveShadow = true;
    group.add(hill);
  }

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6c4931, flatShading: true, roughness: 1 });
  const crownMats = [0x2f8050, 0x36925c, 0x287247].map(color => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 1 }));
  const treePositions = [
    [-3.5, -2.2], [3.6, -1.6], [-5.2, -7.0], [5.7, -6.4], [-7.0, 2.8], [7.2, 3.2], [-1.3, -9.2],
  ];
  treePositions.forEach(([x, z], index) => {
    const trunk = markCollider(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 2.1, 7), trunkMat), colliders);
    trunk.position.set(x, 1.05, z);
    trunk.castShadow = true;
    group.add(trunk);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(1.15, 2.4, 7), crownMats[index % crownMats.length]);
    crown.position.set(x, 2.8, z);
    crown.rotation.y = random() * Math.PI;
    crown.castShadow = true;
    group.add(crown);
  });

  const rockMat = new THREE.MeshStandardMaterial({ color: 0x7b8f86, flatShading: true, roughness: 0.95 });
  const rockPositions = [[-1.8, -3.8], [2.2, -4.6], [4.8, 1.5], [-4.7, 1.1], [0.9, -7.1]];
  rockPositions.forEach(([x, z], index) => {
    const rock = markCollider(new THREE.Mesh(new THREE.DodecahedronGeometry(0.45 + (index % 3) * 0.14, 0), rockMat), colliders);
    rock.position.set(x, 0.34, z);
    rock.scale.y = 0.72;
    rock.rotation.set(random(), random() * Math.PI, random());
    rock.castShadow = true;
    rock.receiveShadow = true;
    group.add(rock);
  });

  const path = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 13),
    new THREE.MeshStandardMaterial({ color: 0xb8aa79, roughness: 1, flatShading: true }),
  );
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.012, -3.5);
  path.receiveShadow = true;
  group.add(path);

  return { group, colliders };
}
