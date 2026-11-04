# Rà soát mô phỏng robot & phương án không gian 3D
## Robot Math Lab — Virtual Robot Track

> Mục tiêu: giữ nguyên logic toán học hiện tại, nâng phần “chạy mô phỏng” từ canvas 2D thành không gian 3D trực quan, an toàn và vẫn chạy tốt trên máy tính bảng của học sinh.

> **Trạng thái:** Phần 3D đã được triển khai (KinematicsModel, renderer 3D, camera, fallback 2D, build script). Xem [`docs/3d-simulation.md`](./3d-simulation.md) để biết kiến trúc, cách thêm task mới và cách build/kiểm thử.

---

## 1. Kết luận nhanh

- Mô phỏng hiện tại là **2D canvas**, chạy đúng logic động học (quãng đường = vận tốc × thời gian) và đã có đầy đủ readout, kết quả, âm thanh.
- Điểm yếu lớn nhất không phải “thiếu 3D”, mà là **physics và rendering đang nằm chung** trong `SimulationEngine`. Nếu vẽ 3D trực tiếp vào class này sẽ rất khó bảo trì và dễ làm sai kết quả toán.
- Phương án đề xuất:
  1. Tách **KinematicsModel** (thuần toán, không DOM/canvas).
  2. Giữ **2D renderer** làm fallback.
  3. Thêm **Simulation3DEngine** dùng Three.js, chỉ đảm nhận hiển thị.
  4. Bật 3D bằng feature flag, mặc định có thể vẫn là 2D trong giai đoạn pilot.
- Thời gian dự kiến: **MVP task 1 khoảng 1 tuần**; hoàn thiện 3 task + mobile/accessibility khoảng **2–3 tuần** cho 1 lập trình viên.

---

## 2. Hiện trạng

### 2.1 Luồng chạy hiện tại

```
Step 3 (nhập speed/time)
  → openTrackView()
  → initSimulation()
      → new SimulationEngine('robot-canvas', task config)
      → setRobots([...])
  → executeSimulationRun()
      → kiểm tra speed/time
      → bot.velocity = speed
      → bot.target = speed * time
      → sim.start()
      → mỗi frame: updatePhysics(dt) + render() + onTick()
      → onFinish(): so sánh speed*time với task.targetDistance
      → hiện result card + readouts
```

### 2.2 Thành phần liên quan

| File | Vai trò |
|---|---|
| `js/simulation-engine.js` | Physics + vẽ canvas 2D + ruler + robot vector |
| `js/task-engine.js` | Khởi tạo simulation, nút Run, readouts, result card |
| `js/tasks/task1-reach.js` | 50m track, target 42m, speed 7m/s |
| `js/tasks/task2-fix.js` | 1400m track, target 1200m, trial 240s → 960m |
| `js/tasks/task3-new.js` | 1700m track, target 1500m, speed 5m/s |
| `css/style.css` | Khung track, canvas, destination flag, readouts |
| `index.html` | Load engine bằng script thường (không phải ES module) |

### 2.3 Điểm mạnh

- Logic động học đơn giản, dễ kiểm chứng: `x = v * t`, có hỗ trợ multi-stage và chế độ đối đầu (chưa dùng).
- Readout và kết quả được tính từ cùng một nguồn `speed * time`; không phụ thuộc animation.
- Có `history` để vẽ đồ thị sau này.
- Test hồi quy task 1/2/3 đang pass.

---

## 3. Phát hiện khi rà soát

| # | Mức | Vị trí | Vấn đề | Đề xuất |
|---|---|---|---|---|
| 1 | Cao | `SimulationEngine.drawEnvironment` + `setRobots` | Robot mặc định `trackY = 0.4` nhưng mặt đường bắt đầu ở `0.65h` → robot “bay” phía trên đường, không nằm trên track. | Đặt lane Y rõ ràng (`0.78–0.85`) hoặc truyền `trackY` từ task; khi lên 3D dùng cao độ lane cố định. |
| 2 | Cao | `css/style.css` `.track-destination-flag::after` | Vạch đích cao **cố định 290px**, trong khi canvas cao 380/290/230px → lệch hoặc tràn khỏi canvas trên mobile. | Dùng `height: 100%` hoặc tính theo chiều cao canvas; tốt nhất chuyển marker đích vào scene 3D. |
| 3 | Cao | `simulation-engine.js` | Physics và render bị trộn trong cùng class (`updatePhysics` + `drawEnvironment/drawRobot`). | Tách `KinematicsModel`; renderer 2D/3D chỉ đọc state. Đây là điều kiện tiên quyết để làm 3D an toàn. |
| 4 | Trung bình | `task-engine.js` `executeSimulationRun` | `sim.onFinish` được gán **sau** `sim.start()`. Hiện chưa lỗi vì RAF chạy frame sau, nhưng là race tiềm ẩn. | Gán `onFinish` trước `start()`. |
| 5 | Trung bình | `task-engine.js` `initSimulation` | `onTick = (state) => ...` nhưng engine gọi `onTick(elapsedSimTime, robots)`; tham số `state` không dùng. | Chuẩn hoá signature `onTick(elapsedSeconds, robots)`, bỏ tham số thừa. |
| 6 | Trung bình | `SimulationEngine.unitsToPixels` | `ratio` bị clamp `[0,1]`: nếu `speed*time > trackLength`, robot dừng ở cuối track nhưng `position` thực vẫn lớn hơn; readout và hình ảnh không khớp. | Thêm “runway” 8–10% hoặc hiển thị vùng off-track; 3D phải phản ánh đúng vị trí overshoot. |
| 7 | Trung bình | `resizeCanvas`, `openTrackView` | DPR chỉ cache một lần; resize canvas dựa vào `setTimeout(60)` sau khi mở view; không có `ResizeObserver`. | Dùng `ResizeObserver` + cập nhật DPR; gọi resize trong `requestAnimationFrame`. |
| 8 | Trung bình | DOM flag + canvas | Vị trí đích tồn tại ở 2 nơi: canvas (vạch đỏ) và DOM (`.track-destination-flag`). Dễ lệch khi đổi kích thước/lên 3D. | Một nguồn duy nhất: scene 3D giữ marker; 2D fallback dùng DOM nhưng tính theo % chiều cao. |
| 9 | Thấp | `executeSimulationRun` | Dùng `alert()` khi input sai → chặn UI, không thân thiện, không tốt cho screen reader. | Dùng status box + `aria-live="polite"`; focus vào input lỗi. |
| 10 | Thấp | `index.html` + `simulation-engine.js` | Toàn bộ engine đang dùng script thường/global; thêm Three.js dạng ES module sẽ cần loader/import map và thứ tự nạp rõ ràng. | Dùng lazy-load module + fallback 2D; giữ API toàn cục `window.Simulation3DEngine`. |
| 11 | Thấp | `SimulationEngine` | Chưa có xử lý WebGL/context loss, quality tiers, reduced motion. | Thiết kế mới cần các phần này ngay từ đầu. |
| 12 | Thấp | `simulation-engine.js` | Màu sắc hard-code, không dùng token của app. | Dùng palette chung (`--primary`, `--accent-*`) khi vẽ 3D/2D. |

> Các lỗi #1 và #2 nên được sửa trước khi làm 3D, vì nếu bê nguyên logic hiển thị sang 3D sẽ rất khó đối chiếu.

---

## 4. Kiến trúc đề xuất

### 4.1 Tách mô hình động học khỏi renderer

```
TaskEngine
   │
   ├── KinematicsModel (thuần JS, không DOM)
   │      ├── robots: position, velocity, target, stages
   │      ├── elapsedSimTime, isFinished, history
   │      └── update(dt) / reset() / setRobots()
   │
   ├── Simulation2DRenderer (canvas hiện tại, fallback)
   └── Simulation3DRenderer (Three.js)
```

**Lợi ích:**
- Kết quả toán không phụ thuộc WebGL.
- Test model bằng Node, không cần browser.
- Có thể giữ 2D fallback lâu dài.
- Dễ thêm chế độ race/opposite/multistage sau này.

### 4.2 Interface chung cho renderer

```js
// Mọi renderer đều có API tối thiểu:
class SimulationRenderer {
  constructor(containerId, options) {}
  setRobots(configs) {}
  start() {}
  pause() {}
  reset() {}
  resize() {}
  destroy() {}

  // optional: dùng cho 2D fallback
  projectUnitsToScreen(units) { return { x, y, visible }; }
}
```

`TaskEngine` chỉ cần đổi chỗ khởi tạo:

```js
const use3D = window.RMLFeatures?.simulation3D && window.Simulation3DEngine;
this.sim = use3D
  ? new Simulation3DEngine('canvas-container', options)
  : new SimulationEngine('robot-canvas', options);
```

Với 3D, ẩn `#destination-flag` DOM và để beacon 3D đảm nhận; với 2D, giữ nguyên.

### 4.3 Feature flag & fallback

- `window.RMLFeatures = { simulation3D: false }` trong giai đoạn đầu.
- Bật thử bằng `?sim=3d` hoặc `localStorage.rml_sim_mode = '3d'`.
- Nếu:
  - WebGL không khả dụng,
  - module Three.js tải lỗi,
  - FPS thấp kéo dài,
  - context lost không phục hồi,
  → tự động quay về 2D và hiện thông báo nhẹ.
- Không để học sinh bị kẹt màn hình trắng.

---

## 5. Thiết kế không gian 3D

### 5.1 Art direction

Đề xuất: **“Sparky’s Space Lab”** — đường đua trên một trạm không gian nhỏ, đồng bộ với splash rocket/ngôi sao của app.

- Phong cách: low-poly, đồ chơi, bo tròn, màu pastel.
- Palette: indigo `#4f46e5`, violet `#7c3aed`, pink `#ec4899`, cyan `#22d3ee`, amber `#fbbf24`, mint `#34d399`; nền trời tím than.
- Ánh sáng: hemisphere + directional, bóng mềm; phát sáng nhẹ ở mắt robot, đích đến và vạch lane.
- Tránh chi tiết rối mắt: học sinh cần đọc **khoảng cách**, không phải ngắm cảnh.

Phương án thay thế:
- “Robot City” (đường phố, nhà cửa) — nhiều asset hơn.
- “Green Park Track” (công viên, cây) — gần gũi nhưng kém “space lab”.

### 5.2 Scene graph

```
Scene
├── Environment
│   ├── Starfield (Points, dịu, không nhấp nháy mạnh)
│   ├── 2–3 hành tinh low-poly
│   ├── Floating platform / asteroid base
│   ├── Fog + background gradient
│   └── Props: crates, cones, mini satellite
├── Track
│   ├── Runway (bo tròn, có lane line)
│   ├── Start gate
│   ├── Finish arch (nếu track có đích cuối)
│   ├── Distance markers (sprite số + vạch)
│   └── Target beacon (vòng sáng + cờ + nhãn “42m / 1200m / 1500m”)
├── Robot “Alpha Bot”
│   ├── Body / head / visor / eyes
│   ├── Wheels hoặc tracks
│   ├── Antenna + đèn trạng thái
│   └── Shadow blob
├── Effects
│   ├── Dust khi chạy
│   ├── Confetti khi đúng đích
│   └── Scan ring khi đến đích
└── Lights
    ├── HemisphereLight
    ├── DirectionalLight (đổ bóng)
    └── PointLight ở target/robot (tuỳ chọn)
```

### 5.3 Ánh xạ toán học → 3D

Không dùng tỉ lệ 1m = 1 unit (track 1700m sẽ quá dài). Dùng chiều dài hiển thị cố định:

```js
const TRACK_WORLD_LENGTH = 40;                 // đơn vị Three.js
const worldFromUnits = (units) =>
  -TRACK_WORLD_LENGTH / 2 + (units / trackLength) * TRACK_WORLD_LENGTH;
```

- `position` (mét) vẫn là nguồn chân lý từ `KinematicsModel`.
- Chỉ đổi sang world position khi render.
- `targetDistance` → beacon ở đúng tỉ lệ.
- Nếu `speed*time > trackLength`, thêm **runway 8–10%** phía sau vạch đích để robot không bị “dính” vào cuối track; hiển thị vùng off-track bằng màu cảnh báo.
- Không làm tròn vị trí theo pixel; dùng số thực, chỉ format khi hiển thị readout.

### 5.4 Robot

- Dựng procedural bằng Three.js (Box/Capsule/Sphere) để:
  - không cần file GLB,
  - dễ đổi màu theo theme,
  - nhẹ và đồng bộ phong cách vector hiện tại.
- Bộ phận: thân, đầu, kính, 2 mắt phát sáng, 2 bánh/track, ăng-ten, đèn trạng thái.
- Animation:
  - bánh quay theo `deltaDistance / wheelRadius`,
  - thân nhún nhẹ khi chạy,
  - đèn đổi màu: xanh khi đang chạy, vàng khi sắp tới, xanh lá khi đúng đích, đỏ/cam khi lệch.
- Nhãn tên + vận tốc: sprite hoặc DOM overlay; ưu tiên sprite để không tạo nhiều DOM node.

### 5.5 Camera

Ba chế độ, chuyển mượt:

1. **Toàn cảnh (mặc định khi mở track)** — thấy trọn track, target và robot; phù hợp task 2 quan sát 960m vs 1200m.
2. **Theo robot** — camera bám sau/trên robot, lerp có damping; phù hợp task 1/3.
3. **Cận cảnh đích** — tự bật khi robot dừng hoặc khi bấm “Xem đích”; phù hợp khoảnh khắc kết quả.

Ràng buộc:
- OrbitControls chỉ bật ở chế độ Toàn cảnh; giới hạn góc/polar/zoom, không cho pan vô hạn.
- `prefers-reduced-motion`: tắt lerp/bob/confetti; camera cắt thẳng.
- Không tự xoay camera khi học sinh đang đọc.

### 5.6 HUD & tương tác

Giữ nguyên HUD hiện tại (distance / speed / time, status, result card). Thêm trong track:

- Chip chọn camera: `Toàn cảnh` / `Theo robot` / `Cận cảnh đích`.
- Chip chất lượng: `Nhẹ` / `Đẹp` (ẩn trên desktop mạnh).
- Nút Run/Rerun/Continue giữ nguyên.
- Loading state: “Sparky đang chuẩn bị đường đua…”.
- Lỗi WebGL: “Thiết bị chưa hỗ trợ 3D — đang dùng chế độ 2D”.
- Chạm vào robot/target (mobile) hiện tooltip khoảng cách; không phụ thuộc hover.

### 5.7 Hành vi sư phạm cần giữ

- Robot **không tự động chạy tới đích**. Nó chạy đúng `speed * time`; nếu sai, dừng non hoặc vượt.
- Target beacon luôn đứng yên ở `targetDistance`.
- Task 2: phải nhìn rõ robot dừng ở 960m và đích 1200m; không được “tự sửa” cho khớp.
- Task 3: target 1500m, track 1700m; đủ chỗ cho overshoot nhẹ.
- Readout số liệu phải cập nhật theo `KinematicsModel`, không theo vị trí world đã làm tròn.

---

## 6. Công nghệ & tích hợp

### 6.1 Chọn Three.js

| Phương án | Ưu | Nhược |
|---|---|---|
| **Three.js (khuyến nghị)** | Nhẹ, phổ biến, đủ cho scene low-poly; OrbitControls; dễ tìm tài liệu | Cần thêm thư viện ~600KB; cần quản lý import |
| Babylon.js | Nhiều tính năng sẵn | Nặng hơn, overkill |
| CSS 3D | Không dependency | Không phải không gian 3D thật, khó camera/track |
| Unity/PlayCanvas | Rất mạnh | Quá nặng cho web giáo dục, build phức tạp |

### 6.2 Cách nhúng không cần build

Repo hiện không có bundler. Cách ít rủi ro:

```html
<script type="importmap">
{
  "imports": {
    "three": "./js/vendor/three/three.module.js",
    "three/addons/": "./js/vendor/three/addons/"
  }
}
</script>
```

```js
// js/simulation-3d.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

class Simulation3DEngine { /* ... */ }
window.Simulation3DEngine = Simulation3DEngine;
```

- Vendor `three.module.js` + `OrbitControls.js` trong `js/vendor/three/` để không phụ thuộc CDN/offline.
- Lazy-load module khi mở track lần đầu:
  ```js
  const { Simulation3DEngine } = await import('./simulation-3d.js');
  ```
- Nếu sau này thêm Vite/esbuild thì chuyển sang `npm install three` và bundle; không cần đổi kiến trúc.

> Lưu ý CSP: nếu sau này bật CSP, import map là script inline — cần nonce/hash hoặc chuyển sang bundle. Hiện Vercel chưa đặt CSP nên chưa vướng.

### 6.3 File dự kiến

```
js/kinematics-model.js          # model thuần, dùng chung 2D/3D
js/simulation-engine.js         # 2D renderer (refactor dần)
js/simulation-3d.js             # Three.js renderer
js/simulation-3d-loader.js      # lazy load + fallback
js/vendor/three/three.module.js
js/vendor/three/addons/controls/OrbitControls.js
assets/3d/                      # chỉ nếu dùng GLB/texture
```

---

## 7. Hiệu năng, mobile, accessibility

### 7.1 Ngân sách hiệu năng

- 1 robot, 1 track, < 100 draw calls, < 50k triangles.
- Pixel ratio tối đa 1.75; shadow map 1024; không post-processing giai đoạn đầu.
- Tắt shadow/giảm particle trên tablet yếu.
- Pause RAF khi tab ẩn; dispose geometry/material/texture khi đổi task.
- Tự hạ quality nếu FPS < 45 trong 2 giây; fallback 2D nếu < 25 kéo dài.
- Không tạo object mới trong vòng lặp render.

### 7.2 Mobile

- Canvas chiếm toàn bộ chiều rộng card; camera FOV rộng hơn một chút.
- Nút camera/chất lượng đủ lớn (≥ 44px).
- OrbitControls hỗ trợ chạm; không yêu cầu hover.
- Thử nghiệm trên iPad/Android tầm trung, không chỉ desktop.

### 7.3 Accessibility

- Giữ readout và status bằng text; `aria-live="polite"` cho trạng thái/kết quả.
- Canvas có `role="img"` và mô tả: “Đường đua 50m, robot đang ở 21m, đích 42m”.
- Nút camera/chất lượng có label rõ; không chỉ dùng icon.
- `prefers-reduced-motion`: tắt bob/confetti/camera lerp.
- Fallback 2D tự động; không bắt buộc WebGL để hoàn thành bài.
- Màu target/robot không chỉ dựa vào màu: có nhãn và hình dạng khác nhau.

---

## 8. Kiểm thử

| Loại | Nội dung |
|---|---|
| Unit | `KinematicsModel`: task 1 → 42m/6s; task 2 trial → 960m; task 3 → 1500m; overshoot; multi-stage |
| Scene | Robot world position tại t=0, giữa, kết thúc khớp tỉ lệ; target beacon đúng |
| E2E | Task 1/2/3: mở track, run, readout, result card, rerun, continue |
| Visual | Playwright screenshot tại thời điểm cố định; so sánh có ngưỡng |
| Fallback | WebGL bị chặn/context lost → tự chuyển 2D, không mất kết quả |
| Performance | 60fps desktop, ≥30fps tablet; đo draw calls/triangles |
| Accessibility | Keyboard, screen reader readout, reduced motion |
| Regression | `node test-track-flow.js`, `node test-splash-welcome.js`, `npm test` |

---

## 9. Lộ trình

| Giai đoạn | Thời lượng | Việc chính | Kết quả |
|---|---|---|---|
| 0. Ổn định 2D | 1–2 ngày | Sửa trackY, flag height, onFinish, resize; tách `KinematicsModel` | 2D ổn định + model test được |
| 1. Khung 3D | 3–4 ngày | Three.js, track, robot procedural, camera toàn cảnh, run task 1 | Task 1 chạy 3D sau feature flag |
| 2. Hoàn thiện scene | 4–6 ngày | Marker, target beacon, camera follow, effects, task 2/3 | 3 task chạy 3D |
| 3. Mobile & a11y | 2–3 ngày | Quality tiers, fallback, reduced motion, screen reader | Chạy tốt trên tablet |
| 4. Pilot | 1 tuần | Thử 1 lớp, thu feedback, tinh chỉnh | Quyết định bật mặc định |

**MVP tối thiểu:** Phase 0 + 1 (khoảng 1 tuần) đã có không gian 3D cho task 1 và fallback 2D.

---

## 10. Rủi ro & giảm thiểu

| Rủi ro | Giảm thiểu |
|---|---|
| Tablet trường yếu, WebGL chậm | Quality tiers + fallback 2D + đo FPS thực tế |
| Bundle Three.js làm chậm tải | Lazy-load, vendor cache, chỉ tải khi mở track |
| Camera gây chóng mặt | Mặc định toàn cảnh, không tự xoay, reduced motion |
| Sai lệch toán do làm tròn world | Model là nguồn chân lý; render chỉ map vị trí |
| Lỗi context lost | Bắt event, thử restore, fallback 2D |
| Asset 3D bản quyền | Dựng procedural/low-poly nội bộ |
| Tăng độ phức tạp bảo trì | Tách model/renderer, interface rõ, test model |
| CSP/offline sau này | Vendor module; nếu bật CSP thì bundle hoặc nonce |

---

## 11. Cần chốt trước khi code

1. **Phong cách:** Space Lab (khuyến nghị) / Robot City / Green Park?
2. **Camera mặc định:** Toàn cảnh + nút theo robot (khuyến nghị) hay chỉ theo robot?
3. **Robot:** procedural low-poly (khuyến nghị) hay GLB có sẵn?
4. **Phạm vi:** làm task 1 trước để pilot, hay cả 3 task ngay?
5. **Mặc định:** bật 3D cho tất cả hay chỉ bật khi `?sim=3d` trong giai đoạn thử?
6. **Thiết bị mục tiêu:** laptop/PC, iPad, hay cả tablet Android cũ?
7. **Có cần giữ 2D fallback lâu dài** (khuyến nghị) hay chỉ 3D?

---

## 12. Đề xuất bước tiếp theo

1. Chốt 7 điểm ở mục 11.
2. Làm Phase 0: sửa 3 lỗi hiển thị + tách `KinematicsModel` + test lại 3 task.
3. Dựng scene 3D tối giản cho task 1 sau feature flag.
4. Đo FPS trên thiết bị thật trước khi mở rộng task 2/3.
