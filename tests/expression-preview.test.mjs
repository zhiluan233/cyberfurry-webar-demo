import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { VRMExpression, VRMExpressionManager, VRMExpressionMorphTargetBind } from '@pixiv/three-vrm';
import { ExpressionPreview } from '../src/expression-preview.ts';

function setup(names) {
  const manager = new VRMExpressionManager();
  const mesh = new THREE.Mesh();
  mesh.morphTargetInfluences = names.map(() => 0);
  for (const [index, name] of names.entries()) {
    const expression = new VRMExpression(name);
    expression.addBind(new VRMExpressionMorphTargetBind({ primitives: [mesh], index, weight: 1 }));
    manager.registerExpression(expression);
  }
  return { manager, mesh, preview: new ExpressionPreview(manager) };
}

test('official and custom sliders combine with VRMA weights without changing the animation baseline', () => {
  const { manager, mesh, preview } = setup(['happy', 'earsPerk']);
  assert.deepEqual(preview.keys, [{ name: 'happy', preset: true }, { name: 'earsPerk', preset: false }]);
  manager.setValue('happy', 0.25);
  preview.setWeight('happy', 0.5);
  preview.setWeight('earsPerk', 0.4);
  for (let frame = 0; frame < 10; frame++) preview.update(1 / 60);
  assert.deepEqual(mesh.morphTargetInfluences, [0.75, 0.4]);
  assert.equal(manager.getValue('happy'), 0.25);

  manager.setValue('happy', 0.75);
  preview.update(1 / 60);
  assert.deepEqual(mesh.morphTargetInfluences, [1, 0.4]);
  preview.reset();
  preview.update(0);
  assert.deepEqual(mesh.morphTargetInfluences, [0.75, 0]);
});

test('the speech test cycles available vowels while keeping other sliders applied', () => {
  const { manager, mesh, preview } = setup(['aa', 'ih', 'happy']);
  manager.getExpression('happy').overrideMouth = 'block';
  preview.setWeight('happy', 0.7);
  preview.speaking = true;
  preview.update(0.095);
  assert.deepEqual(mesh.morphTargetInfluences, [0.8, 0, 0.7]);
  preview.update(0.19);
  assert.deepEqual(mesh.morphTargetInfluences, [0, 0.8, 0.7]);
  preview.update(0.19);
  assert.deepEqual(mesh.morphTargetInfluences, [0.8, 0, 0.7]);
  assert.ok(manager.mouthExpressionNames.includes('aa'));
  preview.speaking = false;
  preview.update(0);
  assert.deepEqual(mesh.morphTargetInfluences, [0, 0, 0.7]);
});

test('speech uses recognizable custom mouth shapes on models without vowel presets', () => {
  const { mesh, preview } = setup(['mouthOpen', 'earsPerk']);
  assert.equal(preview.canSpeak, true);
  assert.equal(setup(['earsPerk']).preview.canSpeak, false);
  preview.speaking = true;
  preview.update(0.095);
  assert.deepEqual(mesh.morphTargetInfluences, [0.8, 0]);
  preview.reset();
  preview.update(0);
  assert.equal(preview.speaking, false);
  assert.deepEqual(mesh.morphTargetInfluences, [0, 0]);
});
