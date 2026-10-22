import test from 'node:test';
import assert from 'node:assert/strict';
import { Object3D, PerspectiveCamera } from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { endGizmoDrag } from '../src/preview-controls.ts';

test('cancelling the installed Three gizmo clears dragging even after disabled/detached', () => {
  const gizmo = new TransformControls(new PerspectiveCamera());
  gizmo.attach(new Object3D());
  let ended = 0;
  gizmo.addEventListener('dragging-changed', event => { if (!event.value) ended++; });
  gizmo.axis = 'X'; gizmo.dragging = true;
  gizmo.detach(); gizmo.enabled = false;
  assert.equal(gizmo.dragging, true, 'vendor detach alone leaves the drag active');
  endGizmoDrag(gizmo);
  assert.equal(gizmo.dragging, false);
  assert.equal(gizmo.axis, null);
  assert.equal(ended, 1);
  endGizmoDrag(gizmo);
  assert.equal(ended, 1, 'blur and lost capture can both fire without duplicate completion');
});
