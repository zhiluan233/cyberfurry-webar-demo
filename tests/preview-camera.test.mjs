import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ArmSpread } from '../src/arm-spread.ts';
import { FIRST_PERSON_LAYER, THIRD_PERSON_LAYER, PreviewCamera } from '../src/preview-camera.ts';
import { createDemoCharacter } from '../src/demo-character.ts';

test('perspective follow moves camera and orbit target without changing framing', () => {
  const camera = new THREE.PerspectiveCamera();
  const preview = new PreviewCamera(camera);
  const target = new THREE.Vector3(1, 2, 3);
  camera.position.set(4, 5, 6);
  camera.lookAt(target);
  const rotation = camera.quaternion.clone();
  const relative = camera.position.clone().sub(target);
  preview.rebaseFollow(new THREE.Vector3(1, 0, 2));
  preview.follow(new THREE.Vector3(4, 0.2, 1), target);
  assert.ok(camera.position.clone().sub(target).distanceTo(relative) < 1e-10);
  assert.ok(camera.quaternion.angleTo(rotation) < 1e-6);
  assert.deepEqual(target.toArray(), [4, 2.2, 2]);
});

test('first person uses forward and height offsets and restores the observer on exit', () => {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.03, 80);
  camera.position.set(2, 1.5, -3);
  camera.rotation.set(-0.2, 0.3, 0, 'YXZ');
  const originalRotation = camera.quaternion.clone();
  const preview = new PreviewCamera(camera);
  preview.enterFirstPerson();
  preview.updateFirstPerson(new THREE.Vector3(4, 1.4, 2), Math.PI / 2, 0.12, 0.04);
  assert.ok(camera.position.distanceTo(new THREE.Vector3(4.12, 1.44, 2)) < 1e-8);
  assert.deepEqual(preview.observerPosition.toArray(), [2, 1.5, -3]);
  assert.ok(camera.layers.isEnabled(FIRST_PERSON_LAYER));
  assert.ok(!camera.layers.isEnabled(THIRD_PERSON_LAYER));
  preview.look(0, 150);
  preview.updateFirstPerson(new THREE.Vector3(), Math.PI / 2, 0.12, 0.04);
  assert.ok(camera.getWorldDirection(new THREE.Vector3()).y < -0.5);
  preview.exitFirstPerson();
  assert.deepEqual(camera.position.toArray(), [2, 1.5, -3]);
  assert.ok(camera.quaternion.angleTo(originalRotation) < 1e-6);
  assert.equal(camera.fov, 60);
  assert.equal(camera.near, 0.03);
  assert.ok(!camera.layers.isEnabled(FIRST_PERSON_LAYER));
  assert.ok(camera.layers.isEnabled(THIRD_PERSON_LAYER));
});

test('arm spread remains symmetric and reversible through repeated pose updates', () => {
  const { getBone } = createDemoCharacter();
  const left = getBone('leftUpperArm');
  const right = getBone('rightUpperArm');
  left.rotation.z = -1.4;
  right.rotation.z = 1.4;
  const initial = [left.quaternion.clone(), right.quaternion.clone()];
  const layer = new ArmSpread(getBone, new THREE.Quaternion());
  layer.set(20);
  assert.ok(left.rotation.z > -1.4 && right.rotation.z < 1.4);
  const opened = left.quaternion.clone();
  for (let frame = 0; frame < 120; frame++) {
    layer.restore();
    layer.apply();
  }
  assert.ok(left.quaternion.angleTo(opened) < 1e-6);
  layer.set(0);
  assert.ok(left.quaternion.angleTo(initial[0]) < 1e-6);
  assert.ok(right.quaternion.angleTo(initial[1]) < 1e-6);
});
