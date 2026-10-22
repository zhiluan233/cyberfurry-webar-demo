import { Box3, DoubleSide, Matrix3, Mesh, MeshBasicMaterial, Raycaster, Vector3, type BufferGeometry } from 'three';

export type NavigationMode = 'pathfinding' | 'direct';
interface Collider { source: Mesh; probe: Mesh; box: Box3; }
interface SearchNode { x: number; z: number; point: Vector3; g: number; f: number; parent: SearchNode | null; }
interface Search {
  origin: Vector3;
  target: Vector3;
  cell: number;
  extent: number;
  open: SearchNode[];
  costs: Map<string, number>;
  closed: Set<string>;
  visited: number;
}

const DOWN = new Vector3(0, -1, 0);
const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
const PROBE_MATERIAL = new MeshBasicMaterial({ side: DoubleSide });

/** A bounded incremental A* over sampled, supported capsule positions. */
export class Navigator {
  mode: NavigationMode = 'pathfinding';
  /** Enable for surface-picked goals; player-follow and generated waypoints only specify X/Z. */
  requireTargetHeight = false;
  status = '等待目标';
  path: Vector3[] = [];
  private search: Search | null = null;
  private colliders: Collider[] = [];
  private readonly boundsVersions = new WeakMap<BufferGeometry, number>();
  private readonly ray = new Raycaster();
  private readonly normalMatrix = new Matrix3();
  private readonly normal = new Vector3();
  private readonly rayOrigin = new Vector3();
  private radius = 0.25;
  private height = 1.6;
  private step = 0.25;
  private sincePlan = Infinity;
  private sinceValidation = Infinity;
  private lastTarget: Vector3 | null = null;
  private previousMode: NavigationMode = 'pathfinding';
  private failed = false;

  reset(): void {
    this.search = null;
    this.path = [];
    this.colliders = [];
    this.lastTarget = null;
    this.sincePlan = Infinity;
    this.sinceValidation = Infinity;
    this.failed = false;
    this.status = '等待目标';
  }

  getDirection(position: Vector3, target: Vector3, world: { meshes: Mesh[] }, radius: number, height: number, maxStep: number, delta: number): Vector3 {
    if (![...position.toArray(), ...target.toArray(), radius, height, maxStep].every(Number.isFinite)) {
      this.status = '无效目标';
      return new Vector3();
    }
    if (this.previousMode !== this.mode) { this.reset(); this.previousMode = this.mode; }
    if (this.mode === 'direct') {
      this.status = '直线移动';
      return target.clone().sub(position).setY(0).normalize();
    }
    const dt = Number.isFinite(delta) ? Math.max(0, Math.min(delta, 0.1)) : 0;
    this.sincePlan += dt;
    this.sinceValidation += dt;
    const changedSize = Math.abs(this.radius - radius) > 0.005 || Math.abs(this.height - height) > 0.02 || Math.abs(this.step - maxStep) > 0.01;
    this.radius = Math.max(0.05, radius);
    this.height = Math.max(this.radius * 2, height);
    this.step = Math.max(0, maxStep);
    const changedWorld = world.meshes.length !== this.colliders.length || world.meshes.some((mesh, i) => mesh !== this.colliders[i]?.source);
    const movedTarget = !this.lastTarget || flatDistance(this.lastTarget, target) > Math.max(0.45, radius * 1.5);
    if (changedSize || changedWorld || !this.lastTarget || (movedTarget && this.sincePlan >= 0.45)
      || (this.failed && this.sincePlan >= 2.0) || (!this.search && this.sincePlan >= 4)) {
      this.begin(position, target, world.meshes);
    }
    if (this.search) this.expand();
    if (!this.path.length) return new Vector3();

    while (this.path.length > 1 && flatDistance(position, this.path[0]) < Math.max(0.1, this.radius * 0.65)) this.path.shift();
    if (flatDistance(position, this.path[0]) < 0.06) {
      if (this.path.length === 1) { this.status = '已抵达'; return new Vector3(); }
      this.path.shift();
    }
    // Recheck the next edge against live meshes. Changed XR surfaces cannot leave a stale route traversable.
    if (this.sinceValidation >= 0.18) {
      this.refreshColliders(world.meshes);
      this.sinceValidation = 0;
      if (!this.edge(position, this.path[0])) {
        this.path = [];
        this.begin(position, target, world.meshes);
        return new Vector3();
      }
    }
    this.status = this.search ? '重新规划中' : '沿路径移动';
    return this.path[0].clone().sub(position).setY(0).normalize();
  }

  private begin(position: Vector3, target: Vector3, meshes: Mesh[]): void {
    this.refreshColliders(meshes);
    this.search = null;
    this.path = [];
    this.failed = false;
    this.lastTarget = target.clone();
    this.sincePlan = 0;
    this.sinceValidation = 0;
    if (!meshes.length) { this.fail('等待可行走的环境表面'); return; }
    const start = this.supported(position.x, position.z, position.y);
    if (!start || !this.clear(start)) { this.fail('起点缺少支撑或空间不足'); return; }
    // Small cells preserve clearance; an explicit finite region bounds work even on huge AR planes.
    const cell = Math.min(0.45, Math.max(0.22, this.radius * 1.25));
    const distance = flatDistance(start, target);
    const extent = Math.min(28, Math.max(7, distance * 0.65 + 5));
    if (Math.abs(target.x - start.x) > extent * 1.75 || Math.abs(target.z - start.z) > extent * 1.75) {
      this.fail('目标超出当前寻路范围'); return;
    }
    // A straight supported edge is also a valid pathfinding result and avoids needless grids on open ground.
    const direct = this.edge(start, target);
    if (direct && this.matchesTargetHeight(direct, target)) { this.path = [direct]; this.status = '沿路径移动'; return; }
    const first: SearchNode = { x: 0, z: 0, point: start, g: 0, f: distance, parent: null };
    this.search = { origin: start, target: target.clone(), cell, extent, open: [first], costs: new Map([[this.key(first), 0]]), closed: new Set(), visited: 0 };
    this.status = '正在规划路径';
  }

  private expand(): void {
    const search = this.search;
    if (!search) return;
    const deadline = performance.now() + 5;
    let count = 0;
    while (search.open.length && count < 32 && performance.now() < deadline) {
      const node = heapPop(search.open)!;
      const key = this.key(node);
      if (search.closed.has(key)) continue;
      search.closed.add(key);
      search.visited += 1;
      count += 1;
      if (search.visited > 6500) { this.fail('没有可达路径（搜索范围已检查）'); return; }
      if (flatDistance(node.point, search.target) < search.cell * 1.6) {
        const end = this.edge(node.point, search.target);
        if (end && this.matchesTargetHeight(end, search.target)) {
          const reverse = [end];
          let cursor: SearchNode | null = node;
          while (cursor?.parent) { reverse.push(cursor.point.clone()); cursor = cursor.parent; }
          this.path = reverse.reverse();
          this.search = null;
          this.status = '沿路径移动';
          return;
        }
      }
      for (const [dx, dz] of DIRECTIONS) {
        const x = node.x + dx;
        const z = node.z + dz;
        const wx = search.origin.x + x * search.cell;
        const wz = search.origin.z + z * search.cell;
        const midpointX = (search.origin.x + search.target.x) / 2;
        const midpointZ = (search.origin.z + search.target.z) / 2;
        if (Math.abs(wx - midpointX) > search.extent || Math.abs(wz - midpointZ) > search.extent) continue;
        const point = this.supported(wx, wz, node.point.y);
        if (!point) continue;
        const next: SearchNode = { x, z, point, g: node.g + search.cell * Math.hypot(dx, dz) + Math.abs(point.y - node.point.y) * 0.4, f: 0, parent: node };
        const nextKey = this.key(next);
        if (search.closed.has(nextKey) || (search.costs.get(nextKey) ?? Infinity) <= next.g) continue;
        // Sweep both the body and support along diagonals; corner cutting is not allowed.
        if (!this.edge(node.point, point)) continue;
        next.f = next.g + flatDistance(point, search.target);
        search.costs.set(nextKey, next.g);
        heapPush(search.open, next);
      }
    }
    if (!search.open.length) this.fail('没有可达路径');
  }

  private supported(x: number, z: number, referenceY: number): Vector3 | null {
    const lift = this.step + 0.075;
    this.rayOrigin.set(x, referenceY + lift, z);
    this.ray.set(this.rayOrigin, DOWN);
    this.ray.near = 0;
    this.ray.far = lift + Math.max(this.step, 0.45) + 0.12;
    let ground = -Infinity;
    for (const collider of this.colliders) {
      const b = collider.box;
      if (x < b.min.x - 0.001 || x > b.max.x + 0.001 || z < b.min.z - 0.001 || z > b.max.z + 0.001 || b.max.y < referenceY - this.ray.far) continue;
      for (const hit of this.ray.intersectObject(collider.probe, false)) {
        if (!hit.face) continue;
        this.normalMatrix.getNormalMatrix(collider.probe.matrixWorld);
        this.normal.copy(hit.face.normal).applyMatrix3(this.normalMatrix).normalize();
        if (this.normal.y >= 0.55 && hit.point.y <= referenceY + this.step + 0.035 && hit.point.y > ground) ground = hit.point.y;
      }
    }
    return Number.isFinite(ground) ? new Vector3(x, ground, z) : null;
  }

  private clear(point: Vector3): boolean {
    const footClearance = Math.min(this.height * 0.25, Math.max(0.06, this.step + 0.045));
    const heights = [footClearance, this.height * 0.5, this.height - 0.035];
    const near = this.colliders.filter(({ box }) => box.max.y > point.y + footClearance && box.min.y < point.y + this.height
      && box.min.x < point.x + this.radius && box.max.x > point.x - this.radius
      && box.min.z < point.z + this.radius && box.max.z > point.z - this.radius);
    for (const collider of near) {
      // A spawn inside a solid box must not be mistaken for a clear position merely because its faces are distant.
      if (collider.source.geometry.type === 'BoxGeometry') {
        const local = collider.probe.worldToLocal(point.clone().add(new Vector3(0, this.height * 0.5, 0)));
        if (collider.source.geometry.boundingBox?.containsPoint(local)) return false;
      }
      for (const y of heights) {
        this.rayOrigin.set(point.x, point.y + y, point.z);
        for (const [x, z] of DIRECTIONS) {
          const direction = new Vector3(x, 0, z).normalize();
          this.ray.set(this.rayOrigin, direction);
          this.ray.near = 0;
          this.ray.far = this.radius + 0.025;
          if (this.ray.intersectObject(collider.probe, false).some(hit => hit.distance <= this.ray.far)) return false;
        }
      }
      // Ceilings can cover the entire capsule without intersecting a horizontal spoke.
      this.rayOrigin.set(point.x, point.y + footClearance, point.z);
      this.ray.set(this.rayOrigin, new Vector3(0, 1, 0));
      this.ray.near = 0;
      this.ray.far = this.height - footClearance;
      if (this.ray.intersectObject(collider.probe, false).length) return false;
    }
    return true;
  }

  /** Returns the grounded end point only when the entire edge is supported and clear. */
  private edge(from: Vector3, to: Vector3): Vector3 | null {
    const distance = flatDistance(from, to);
    const samples = Math.ceil(distance / Math.max(0.1, Math.min(0.22, this.radius * 0.65)));
    // Large goals use A* rather than performing unbounded synchronous raycasts.
    if (samples > 180) return null;
    let previous = this.supported(from.x, from.z, from.y);
    if (!previous) return null;
    for (let i = 1; i <= Math.max(1, samples); i += 1) {
      const t = i / Math.max(1, samples);
      const p = this.supported(from.x + (to.x - from.x) * t, from.z + (to.z - from.z) * t, previous.y);
      if (!p || p.y - previous.y > this.step + 0.035 || previous.y - p.y > Math.max(this.step, 0.45) || !this.clear(p)) return null;
      previous = p;
    }
    return previous;
  }

  private refreshColliders(meshes: Mesh[]): void {
    this.colliders = meshes.map(source => {
      source.updateWorldMatrix(true, false);
      const positionAttribute = source.geometry.getAttribute('position');
      const attributeVersion = positionAttribute && 'data' in positionAttribute ? positionAttribute.data.version : positionAttribute?.version ?? 0;
      if (!source.geometry.boundingBox || this.boundsVersions.get(source.geometry) !== attributeVersion) {
        source.geometry.computeBoundingBox();
        this.boundsVersions.set(source.geometry, attributeVersion);
      }
      const probe = new Mesh(source.geometry, PROBE_MATERIAL);
      probe.matrixAutoUpdate = false;
      probe.matrix.copy(source.matrixWorld);
      probe.matrixWorld.copy(source.matrixWorld);
      const box = source.geometry.boundingBox?.clone().applyMatrix4(source.matrixWorld) ?? new Box3();
      return { source, probe, box };
    });
  }

  private key(node: SearchNode): string { return `${node.x},${node.z},${Math.round(node.point.y * 10)}`; }
  private matchesTargetHeight(ground: Vector3, target: Vector3): boolean {
    return !this.requireTargetHeight || Math.abs(ground.y - target.y) <= Math.max(0.12, this.step + 0.04);
  }
  private fail(message: string): void { this.search = null; this.path = []; this.failed = true; this.status = message; }
}

function flatDistance(a: Vector3, b: Vector3): number { return Math.hypot(a.x - b.x, a.z - b.z); }

function heapPush(heap: SearchNode[], node: SearchNode): void {
  heap.push(node);
  let i = heap.length - 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (heap[parent].f <= node.f) break;
    heap[i] = heap[parent];
    i = parent;
  }
  heap[i] = node;
}

function heapPop(heap: SearchNode[]): SearchNode | undefined {
  const first = heap[0];
  const last = heap.pop();
  if (!heap.length || !last) return first;
  let i = 0;
  while (i * 2 + 1 < heap.length) {
    let child = i * 2 + 1;
    if (child + 1 < heap.length && heap[child + 1].f < heap[child].f) child += 1;
    if (last.f <= heap[child].f) break;
    heap[i] = heap[child];
    i = child;
  }
  heap[i] = last;
  return first;
}
