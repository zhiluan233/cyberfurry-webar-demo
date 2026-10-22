import { Vector3 } from 'three';

export type BehaviorMode =
  | 'manual' | 'follow-player' | 'follow-cursor' | 'go-to'
  | 'random-patrol' | 'patrol-route' | 'wander' | 'orbit' | 'figure-eight'
  | 'flee' | 'approach-retreat' | 'guard' | 'pace' | 'escort' | 'search';

export const BEHAVIORS: ReadonlyArray<{ id: BehaviorMode; label: string; description: string }> = [
  { id: 'manual', label: '手动控制', description: '用摇杆或方向键自由移动。' },
  { id: 'follow-player', label: '跟随玩家', description: '跟随相机位置，保持设定的跟随距离。' },
  { id: 'follow-cursor', label: '跟随目标点', description: '持续追踪准星或点击选定的目标点。' },
  { id: 'go-to', label: '移动到目标点', description: '记住选定位置，抵达后停下。' },
  { id: 'random-patrol', label: '随机巡逻', description: '在出发点周围选择巡逻点，抵达后停留观察。' },
  { id: 'patrol-route', label: '四点巡逻', description: '沿出发点周围的四个路点循环巡逻，每个路点短暂停留。' },
  { id: 'wander', label: '漫步探索', description: '以当前朝向为基础缓慢改变方向，交替行走和休息。' },
  { id: 'orbit', label: '环绕目标', description: '围绕选定目标画圆，没有目标时围绕出发点。' },
  { id: 'figure-eight', label: '八字巡游', description: '依次经过八字曲线的路点，展示连续转弯和交叉。' },
  { id: 'flee', label: '保持距离', description: '玩家靠近时向远处退避，达到安全距离后停下。' },
  { id: 'approach-retreat', label: '接近与退避', description: '接近玩家后停留，再退回安全距离，循环往返。' },
  { id: 'guard', label: '定点守卫', description: '在岗位等待，附近有玩家时靠近查看，玩家离开后归位。' },
  { id: 'pace', label: '往返踱步', description: '在出发点两侧往返，在端点停顿后转身。' },
  { id: 'escort', label: '侧方伴行', description: '根据玩家的移动方向保持侧后方位置，陪同玩家前进。' },
  { id: 'search', label: '扩圈搜索', description: '围绕出发点逐圈检查路点，完成后返回中心重新搜索。' },
];

export interface BehaviorIntent {
  target: Vector3 | null;
  stopDistance?: number;
  activity?: string;
}

/** Produces goals only. Navigation and collision remain independent of behavior. */
export class BehaviorPlanner {
  mode: BehaviorMode = 'manual';
  completed = false;
  private readonly anchor = new Vector3();
  private readonly focus = new Vector3();
  private readonly previousPlayer = new Vector3();
  private readonly playerHeading = new Vector3(0, 0, -1);
  private target: Vector3 | null = null;
  private waypoint = 0;
  private pause = 0;
  private retreating = false;
  private heading = 0;
  private playerInitialized = false;
  private randomState = 0x4827a613;

  setMode(mode: BehaviorMode, position: Vector3, cursor: Vector3 | null): void {
    this.mode = mode;
    this.reset(position);
    this.focus.copy(cursor ?? position);
    this.focus.y = position.y;
    if (mode === 'go-to') this.target = cursor?.clone() ?? null;
  }

  reset(position: Vector3): void {
    this.anchor.copy(position);
    this.focus.copy(position);
    this.target = null;
    this.waypoint = 0;
    this.pause = 0;
    this.retreating = false;
    this.completed = false;
    this.playerInitialized = false;
    this.heading = 0;
  }

  update(delta: number, position: Vector3, cameraPosition: Vector3, cursor: Vector3 | null): BehaviorIntent {
    const dt = Number.isFinite(delta) ? Math.max(0, Math.min(delta, 0.1)) : 0;
    const player = cameraPosition.clone();
    player.y = position.y;
    if (this.playerInitialized) {
      const movement = player.clone().sub(this.previousPlayer);
      movement.y = 0;
      if (movement.lengthSq() > 0.0004) this.playerHeading.lerp(movement.normalize(), Math.min(1, dt * 5)).normalize();
    }
    this.previousPlayer.copy(player);
    this.playerInitialized = true;

    if (this.mode === 'manual') return { target: null, activity: '手动控制' };
    if (this.mode === 'follow-player') return { target: player, activity: '跟随玩家' };
    if (this.mode === 'follow-cursor') return { target: cursor?.clone() ?? null, activity: cursor ? '跟随目标点' : '等待目标点' };
    if (this.mode === 'go-to') {
      if (this.target && flatDistance(position, this.target) <= 0.18 && Math.abs(position.y - this.target.y) < 0.3) {
        this.target = null;
        this.completed = true;
      }
      return { target: this.target?.clone() ?? null, stopDistance: 0.15, activity: this.completed ? '已抵达目标' : this.target ? '前往指定位置' : '请先选择目标点' };
    }
    if (this.mode === 'escort') {
      const side = new Vector3(-this.playerHeading.z, 0, this.playerHeading.x);
      return { target: player.clone().addScaledVector(side, 1.35).addScaledVector(this.playerHeading, -0.7), stopDistance: 0.35, activity: '侧方伴行' };
    }
    if (this.mode === 'flee') {
      const distance = flatDistance(position, player);
      if (distance > 4.5) this.retreating = false;
      else if (distance < 3) this.retreating = true;
      return { target: this.retreating ? this.awayFrom(player, position, 5) : null, stopDistance: 0.3, activity: this.retreating ? '退至安全距离' : '保持警戒' };
    }
    if (this.mode === 'guard') {
      if (flatDistance(player, this.anchor) < 4) {
        return { target: flatDistance(position, player) > 1.8 ? player : null, stopDistance: 1.8, activity: '查看来访者' };
      }
      return { target: flatDistance(position, this.anchor) > 0.3 ? this.anchor.clone() : null, stopDistance: 0.25, activity: '守卫岗位' };
    }
    if (this.pause > 0) {
      this.pause = Math.max(0, this.pause - dt);
      return { target: null, activity: '停留观察' };
    }
    if (this.mode === 'approach-retreat') {
      const distance = flatDistance(position, player);
      if ((!this.retreating && distance <= 1.6) || (this.retreating && distance >= 4.6)) {
        this.retreating = !this.retreating;
        this.pause = 1.3;
        return { target: null, activity: '观察玩家' };
      }
      return { target: this.retreating ? this.awayFrom(player, position, 5) : player, stopDistance: this.retreating ? 0.2 : 1.5, activity: this.retreating ? '退回远处' : '接近玩家' };
    }

    const arrived = this.target !== null && flatDistance(position, this.target) < 0.24 && Math.abs(position.y - this.target.y) < 0.3;
    // An obstruction is not an arrival. Autonomous goals keep their identity
    // until reached, so navigation retries and temporary manipulation can resume.
    if (arrived) {
      this.target = null;
      this.waypoint += 1;
      this.pause = ['orbit', 'figure-eight'].includes(this.mode) ? 0 : this.mode === 'wander' ? 1.5 + this.random() * 2 : 0.8;
      if (this.pause) return { target: null, activity: '抵达路点 · 观察' };
    }
    if (!this.target) {
      this.target = this.nextWaypoint(position);
    }
    return { target: this.target.clone(), stopDistance: 0.18, activity: `${BEHAVIORS.find(item => item.id === this.mode)?.label ?? '巡逻'} · 路点 ${this.waypoint + 1}` };
  }

  private nextWaypoint(position: Vector3): Vector3 {
    const p = this.anchor.clone();
    switch (this.mode) {
      case 'random-patrol': {
        const angle = this.random() * Math.PI * 2;
        const radius = 1.2 + Math.sqrt(this.random()) * 3.8;
        return p.add(new Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
      }
      case 'patrol-route': {
        const points = [[-2.5, -2.5], [2.5, -2.5], [2.5, 2.5], [-2.5, 2.5]];
        const [x, z] = points[this.waypoint % points.length];
        return p.add(new Vector3(x, 0, z));
      }
      case 'wander': {
        this.heading += (this.random() - 0.5) * Math.PI;
        if (flatDistance(position, this.anchor) > 4) this.heading = Math.atan2(this.anchor.z - position.z, this.anchor.x - position.x);
        return position.clone().add(new Vector3(Math.cos(this.heading), 0, Math.sin(this.heading)).multiplyScalar(1.2 + this.random() * 1.6));
      }
      case 'orbit': {
        const angle = (this.waypoint % 24) * Math.PI / 12;
        return this.focus.clone().add(new Vector3(Math.cos(angle) * 2.4, 0, Math.sin(angle) * 2.4));
      }
      case 'figure-eight': {
        const angle = (this.waypoint % 32) * Math.PI / 16;
        return this.focus.clone().add(new Vector3(Math.sin(angle) * 3.2, 0, Math.sin(angle * 2) * 1.8));
      }
      case 'pace': return p.add(new Vector3(this.waypoint % 2 ? -2.5 : 2.5, 0, 0));
      case 'search': {
        const step = this.waypoint % 37;
        if (step === 36) return p;
        const ring = Math.floor(step / 12) + 1;
        const angle = (step % 12) * Math.PI / 6;
        return p.add(new Vector3(Math.cos(angle) * ring * 1.4, 0, Math.sin(angle) * ring * 1.4));
      }
      default: return p;
    }
  }

  private awayFrom(player: Vector3, position: Vector3, distance: number): Vector3 {
    const away = position.clone().sub(player);
    away.y = 0;
    if (away.lengthSq() < 0.001) away.set(Math.cos(this.heading), 0, Math.sin(this.heading));
    return player.clone().addScaledVector(away.normalize(), distance);
  }

  private random(): number {
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 0x100000000;
  }
}

function flatDistance(a: Vector3, b: Vector3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
