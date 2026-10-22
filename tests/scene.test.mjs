import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { CharacterController } from '../src/character-controller.ts';
import { createNatureScene } from '../src/nature-scene.ts';
import { LOCOMOTION_STYLES } from '../src/locomotion.ts';
import { BEHAVIORS } from '../src/behaviors.ts';

const baseConfig = JSON.parse(readFileSync(new URL('../public/config/character.json', import.meta.url)));
const nature = createNatureScene();
nature.group.updateMatrixWorld(true);
const world = { meshes: nature.colliders };

function setup() {
  const character = new CharacterController(new THREE.Scene(), structuredClone(baseConfig), () => {});
  const camera = new THREE.PerspectiveCamera();
  return { character, camera };
}
function tick(character, camera, frames, collisionWorld = world) {
  for (let i = 0; i < frames; i += 1) character.update(1 / 60, camera, null, collisionWorld);
}

test('the shared demonstration map includes every gait and every behavior', () => {
  for (const style of LOCOMOTION_STYLES) assert.ok(nature.stations.some(station => station.style === style.id), `missing gait ${style.id}`);
  for (const behavior of BEHAVIORS) assert.ok(nature.stations.some(station => station.behavior === behavior.id), `missing behavior ${behavior.id}`);
  assert.equal(new Set(nature.stations.map(station => station.id)).size, nature.stations.length, 'station IDs must be unique');
});

for (const station of nature.stations.filter(item => !item.behavior)) {
  test(`physical scene route reaches its destination: ${station.id}`, () => {
    const { character, camera } = setup();
    camera.position.copy(station.cameraPosition);
    character.setLocomotion(station.style);
    character.startRoute(station.waypoints, station.traversal);
    let frames = 0;
    for (; frames < 60 * 120 && character.routeActive; frames += 1) tick(character, camera, 1);
    assert.equal(character.routeActive, false, `${station.id} stalled at ${character.position.toArray()}: ${character.navigator.status}`);
    assert.ok(character.position.distanceTo(station.waypoints.at(-1)) < 0.2, `${station.id} stopped away from its final waypoint`);
  });
}

test('direct movement stops a standing character at the crawl tunnel roof, while crawling passes', () => {
  const station = nature.stations.find(item => item.id === 'crawl-tunnel');
  const { character, camera } = setup();
  character.setNavigationMode('direct');
  character.setLocomotion('walk');
  character.startRoute(station.waypoints);
  tick(character, camera, 900);
  assert.equal(character.routeActive, true, 'standing capsule must not pass through the thin roof between horizontal samples');
  assert.ok(character.position.z < 10, 'standing character must stop at tunnel entrance');
  character.setLocomotion('crawl');
  tick(character, camera, 1800);
  assert.equal(character.routeActive, false, 'reduced capsule must traverse the tunnel');
});

test('gizmo release lands on an elevated platform and leaves no old movement task', () => {
  const { character, camera } = setup();
  const platform = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 4), new THREE.MeshBasicMaterial());
  platform.position.y = 1.9;
  platform.updateMatrixWorld(true);
  character.setMode('random-patrol', null);
  character.beginManipulation();
  character.position.set(0, 4, 0);
  tick(character, camera, 30, { meshes: [platform] });
  assert.equal(character.position.y, 4);
  character.endManipulation();
  tick(character, camera, 180, { meshes: [platform] });
  assert.equal(character.mode, 'manual');
  assert.ok(Math.abs(character.position.y - 2) < 0.00001);
  assert.equal(character.position.x, 0);
  assert.equal(character.position.z, 0);
});
