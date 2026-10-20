# CyberFurry WebAR Demo

一个面向 Android Chrome / ARCore 的 WebXR VRM 角色 Demo，同时包含可在 PC 和普通移动浏览器运行的 low-poly 调试场景。

- 部分代码由AI开发

## 已实现

- 从本地选择 `.vrm` / `.glb` 文件。`@pixiv/three-vrm`
- 打开本地 `.vrma`，在当前 VRM 角色上循环预览，支持暂停、继续和停止后恢复默认动作。
- 从 `public/assets/animation` 加载 `idle.vrma`、`walk.vrma`、`jump.vrma`。
- 触摸摇杆控制角色，以当前相机朝向作为移动坐标系。
- PC 调试场景中使用 WASD 移动自由相机，拖动画面转向，Q/E 升降。
- 画面中央发射射线，命中位置显示世界空间光标。
- “放置角色”会尝试创建 WebXR Anchor，并把角色生成在光标上方后让其落地。
- 手动、跟随玩家、实时跟随光标、走到光标点四种模式。
- Plane Detection 生成平面碰撞网格。
- CPU Depth Sensing 生成低分辨率实时三角网格，作为碰撞和深度遮挡 Agent。
- 深度不可用时自动退化为 Plane Detection / Hit Test 锚点地板碰撞。
- 调试菜单可调整胶囊半径、高度、移动速度，并显示碰撞网格。
- 不支持 AR 时自动显示 low-poly 默认场景，AR 启动按钮仍会保留。

## 运行

```bash
npm install
npm run dev
```

浏览器访问终端输出的地址。生产构建：

```bash
npm run build
npm run preview
```

构建结果直接输出到 `public/`，可将该目录作为静态站点部署。生成的 JS/CSS 位于 `public/assets/app/`，已有的 `public/config/` 和 `public/assets/animation/` 会保留。

## Android 真机测试

要求：

- 支持 ARCore 的 Android 设备。
- Google Chrome 和 Google Play Services for AR 已更新。
- 页面运行于 HTTPS 且证书有效。

局域网的普通 HTTP 地址不能启动 WebXR。开发时可以使用 HTTPS 部署，也可以通过 USB 使用 ADB 把电脑端口映射：

```bash
adb reverse tcp:5173 tcp:5173
```

然后在手机 Chrome 打开 `http://localhost:5173`。

## 自定义 VRMA 动画

临时预览：先选择本地 VRM 角色，再点击“打开 VRMA 动画”选择 `.vrma` 文件，动画会立即应用到场上的角色并循环播放。“暂停 / 继续”控制播放，“停止预览”恢复 idle / walk / jump 默认动作。预览期间仍可移动、放置角色，默认动作不会覆盖预览；更换角色会清除预览。文件仅在当前浏览器中读取，不会上传。

动画文件路径：

```text
public/assets/animation/idle.vrma
public/assets/animation/walk.vrma
public/assets/animation/jump.vrma
```

动画路径、循环方式、淡入时间和角色参数都在 [`public/config/character.json`](public/config/character.json) 中配置。

无效动画会导致回退到预设动作。

## 深度碰撞实现说明

每隔一段时间对 WebXR CPU 深度图降采样，把深度像素反投影到 XR 参考空间，再连接深度连续的相邻采样点形成三角网格。该网格同时承担：

1. 角色胶囊的地面探测与前向障碍物射线碰撞。
2. `colorWrite=false` 的深度预写入，从而让真实环境遮挡虚拟角色。

相关精度和性能参数位于 `environment.depthMesh`：

- `sampleColumns` / `sampleRows`：网格分辨率。
- `updateIntervalMilliseconds`：重建间隔。
- `maximumDepthMeters`：最大有效距离。
- `maximumEdgeDeltaMeters`：相邻深度差超过此值时不生成三角形，减少跨物体拉丝。

这是便于实验的低成本碰撞代理，不等同于原生 ARKit/ARCore 的持久化房间重建。快速移动、反光表面、低纹理区域或较远物体都可能产生空洞和噪声。

## 浏览器能力降级

WebXR 的每个扩展都通过 `optionalFeatures` 请求。实际能力按运行时决定：

1. Depth Sensing + Plane Detection：深度障碍物、平面、遮挡全部开启。
2. Plane Detection + Hit Test：使用平面网格和放置点地板代理。
3. 只有 Hit Test：仍可放置角色，锁定点会创建有限大小的地板代理。
4. 无 WebXR：进入 low-poly 调试场景，其他角色功能保持一致。

## 主要文件

```text
src/main.ts                    会话、界面、相机与主循环
src/character-controller.ts   VRM、VRMA、移动状态机和胶囊碰撞
src/xr-environment.ts          Hit Test、Anchor、Plane 和 Depth Mesh
src/nature-scene.ts            非 AR 调试环境
public/config/character.json   参数和动画配置
```

## 限制

- WebXR Depth Sensing、Plane Detection 和 Anchors 都取决于 Chrome、ARCore 与具体设备；不能仅根据浏览器版本保证可用。
- 当前碰撞控制器使用胶囊多高度射线和向下地面探测，适合角色演示，不是完整刚体物理引擎。
- 深度网格更新频率刻意较低；调高分辨率或刷新频率会明显增加手机负载。
