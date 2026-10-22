import type { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

/** detach()/enabled=false do not end a Three transform drag. Always finish it first. */
export function endGizmoDrag(control: TransformControls): void {
  if (control.dragging) control.pointerUp(null);
}
