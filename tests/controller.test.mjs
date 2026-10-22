import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { CharacterController } from '../src/character-controller.ts';
import { LOCOMOTION_STYLES } from '../src/locomotion.ts';
import { BEHAVIORS } from '../src/behaviors.ts';
import { MToonMaterial } from '@pixiv/three-vrm';
import { setLegacyShadeCompatibility } from '../src/material-compat.ts';
const baseConfig = JSON.parse(readFileSync(new URL('../public/config/character.json', import.meta.url)));
function setup() {
  const config = structuredClone(baseConfig);
  const character = new CharacterController(new THREE.Scene(), config, () => {});
  const floor = new THREE.Mesh(new THREE.BoxGeometry(60, 0.2, 60), new THREE.MeshBasicMaterial()); floor.position.y = -0.1; floor.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 1.65, 5);
  const world = {meshes:[floor]};
  character.position.set(0,0,0); character.grounded = true;
  return {character, config, camera, world};
}
function tick(s, frames=120) { for(let i=0;i<frames;i++) s.character.update(1/60,s.camera,new THREE.Vector3(3,0,1),s.world); }
test('zero speed freezes every behavior and gait, including vertical ladder routes',()=>{
  const s=setup(); s.config.character.moveSpeedMetersPerSecond=0;
  for(const style of LOCOMOTION_STYLES) for(const behavior of BEHAVIORS) {
    s.character.position.set(0,0,0); s.character.setLocomotion(style.id); s.character.setMode(behavior.id,new THREE.Vector3(4,0,1));
    tick(s,30); assert.ok(s.character.position.length()<1e-7,style.id+' / '+behavior.id); assert.equal(s.character.motionState,'idle');
  }
  s.character.startRoute([new THREE.Vector3(),new THREE.Vector3(0,2,0)],'ladder'); tick(s);
  assert.deepEqual(s.character.position.toArray(),[0,0,0]);
});
test('go-to arrives and stops; direct movement remains blocked by a wall',()=>{
  const s=setup(); s.character.setMode('go-to',new THREE.Vector3(1,0,0)); tick(s,180);
  assert.equal(s.character.mode,'manual'); assert.ok(Math.abs(s.character.position.x-1)<.2);
  const wall=new THREE.Mesh(new THREE.BoxGeometry(.3,2,4),new THREE.MeshBasicMaterial()); wall.position.set(2,1,0); wall.updateMatrixWorld(true); s.world.meshes.push(wall);
  s.character.setNavigationMode('direct'); s.character.setMode('go-to',new THREE.Vector3(3,0,0)); tick(s,240);
  assert.ok(s.character.position.x<1.65); assert.equal(s.character.motionState,'idle');
});
test('gizmo manipulation pauses physics and movement then resumes gravity without stale tasks',()=>{
  const s=setup(); s.character.setMode('random-patrol',null); s.character.beginManipulation(); s.character.position.set(1,2,3);
  tick(s); assert.deepEqual(s.character.position.toArray(),[1,2,3]); assert.equal(s.character.mode,'manual');
  s.character.endManipulation(); tick(s); assert.ok(Math.abs(s.character.position.y)<1e-6); assert.equal(s.character.position.x,1);
});
test('ground and ladder demonstration routes reach their final waypoint',()=>{
  const s=setup(); s.character.startRoute([new THREE.Vector3(),new THREE.Vector3(1,0,0),new THREE.Vector3(1,0,1)]); tick(s,300);
  assert.equal(s.character.routeActive,false); assert.ok(s.character.position.distanceTo(new THREE.Vector3(1,0,1))<.15);
  s.character.setLocomotion('ladder'); s.character.startRoute([new THREE.Vector3(),new THREE.Vector3(0,1,0),new THREE.Vector3()],'ladder'); tick(s,360);
  assert.equal(s.character.routeActive,false); assert.ok(s.character.position.length()<.15);
});
test('legacy shade repair is reversible and preserves authored maps, tint, and VRM1',()=>{
  const scene=new THREE.Group(); const legacy=new MToonMaterial(); legacy.map=new THREE.Texture(); legacy.shadeColorFactor.setRGB(.9,.8,.7);
  const authored=new MToonMaterial(); authored.map=new THREE.Texture(); authored.shadeMultiplyTexture=new THREE.Texture(); const original=authored.shadeMultiplyTexture;
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(),[legacy,authored]));
  assert.equal(setLegacyShadeCompatibility(scene,true,false),0); assert.equal(legacy.shadeMultiplyTexture,null);
  assert.equal(setLegacyShadeCompatibility(scene,true,true),1); assert.equal(legacy.shadeMultiplyTexture,legacy.map); assert.equal(authored.shadeMultiplyTexture,original);
  assert.deepEqual(legacy.shadeColorFactor.toArray(),[.9,.8,.7]);
  assert.equal(setLegacyShadeCompatibility(scene,false,true),1); assert.equal(legacy.shadeMultiplyTexture,null);
  setLegacyShadeCompatibility(scene,true,true); assert.equal(legacy.shadeMultiplyTexture,legacy.map);
});
