# Mô phỏng 3D — Sparky's Space Lab

Tài liệu này ghi lại phần đã triển khai của mô phỏng 3D. Bản thiết kế và đánh giá
ban đầu nằm ở [`docs/3d-simulation-plan.md`](./3d-simulation-plan.md).

## 1. Trạng thái

- Đã tách toán học khỏi renderer: `js/kinematics-model.js` là nguồn duy nhất cho
  vị trí, vận tốc, trạng thái hoàn thành và lịch sử mô phỏng.
- `js/simulation-engine.js` vẫn là renderer 2D (fallback).
- `js/simulation-3d.js` là renderer Three.js theo phong cách **Space Lab**, robot
  low-poly procedural, không cần tải GLB/texture ngoài.
- `js/simulation-3d-loader.js` tải bundle 3D theo nhu cầu, kiểm tra WebGL và giữ
  đường lui 2D.
- `js/task-engine.js` dùng chung HUD, luồng Run/Finish và nút camera cho cả 2D và
  3D. Task 1, 2, 3 đều chạy được; task mới chỉ cần cấu hình task, không sửa
  renderer.
- Camera mặc định là toàn cảnh; nút **Theo robot** chuyển sang camera bám đuôi.
  Ở chế độ bám đuôi, các biển khoảng cách và tên robot được ẩn để HUD không bị
  rối; biển đích vẫn hiển thị.
- Ngôn ngữ của biển đích được cập nhật khi học sinh đổi VI/EN giữa chừng.

## 2. Kiến trúc

```
task config (trackLength, targetDistance, unit, robotSpeed)
        │
        ▼
KinematicsModel  ──►  SimulationEngine (2D canvas)
        │          └►  Simulation3DEngine (Three.js)
        │
        ▼
TaskEngine: HUD, Run/Finish, result card, camera UI, log/telemetry
```

| File | Vai trò |
|---|---|
| `js/kinematics-model.js` | Toán học thuần: `update(dt)`, `reset()`, `history`, nhiều robot, multi-stage |
| `js/simulation-engine.js` | Renderer 2D + ruler + robot vector; vẫn là fallback |
| `js/simulation-3d.js` | Renderer 3D: track, robot, planet, star field, camera, hiệu ứng |
| `js/simulation-3d-loader.js` | Feature flag, kiểm tra WebGL, lazy `import()` |
| `js/simulation-3d.bundle.js` | Kết quả build của `npm run build:3d` (được commit để Vercel phục vụ tĩnh) |
| `js/task-engine.js` | Khởi tạo engine, chạy mô phỏng, HUD, result card, camera |
| `tests/manual/3d-smoke.html` | Trang smoke test thủ công cho renderer 3D |

## 3. Cách thêm task mới

Chỉ cần thêm file task trong `js/tasks/` với các trường hiện có:

```js
{
  id: 'task4-example',
  trackLength: 900,        // tổng chiều dài đường đua, cùng đơn vị với targetDistance
  targetDistance: 750,     // vạch đích
  unit: 'm',
  speedUnit: 'm/s',
  timeUnit: 's',
  robotSpeed: 5,           // vận tốc mặc định để gợi ý
  // ... các bước Polya, hints, step4 như task hiện tại
}
```

Renderer 3D tự tính:

- tỉ lệ `units → world z` từ `trackLength`;
- vị trí beacon đích từ `targetDistance`;
- bước chia thước và số biển khoảng cách (track dài > 1000 dùng bước rộng hơn);
- nhãn đơn vị (`m`, `km`, ...);
- vận tốc/robot từ `robotSpeed` và giá trị học sinh nhập ở Step 3.

Không hard-code pixel hay chiều dài track trong renderer. Nếu sau này cần nhiều
robot hoặc chặng (multi-stage), `KinematicsModel` đã hỗ trợ `stages` và mảng
robot; renderer 3D xếp robot theo làn và camera follow bám robot đầu tiên.

## 4. Feature flag và fallback

- Mặc định bật 3D.
- `?sim=2d` trên URL để buộc dùng 2D.
- Loader cũng đọc `localStorage.rml_sim_mode` (giá trị `2d` hoặc `3d`) nếu có.
- Tự động fallback 2D khi:
  - trình duyệt không có WebGL;
  - bundle 3D tải lỗi;
  - WebGL context bị mất (`handleSimulationFatal`).
- Khi 3D hoạt động: canvas 2D và `#destination-flag` được ẩn; khi fallback, chúng
  được hiện lại và cờ đích 2D được định vị lại theo kích thước canvas thật.

## 5. Hiệu năng

- Bundle 3D chỉ được tải khi mở track hoặc preload trong lúc học sinh làm bài.
- Pixel ratio bị giới hạn: low 1.15, medium 1.5, high 1.75.
- Tự giảm độ phân giải render (tối đa còn 0.72) nếu FPS trung bình < 42 trong
  lúc robot chạy; khóa mức sau khi đã ổn định.
- Cảnh idle render khoảng 30 FPS; lúc chạy hoặc chuyển camera mới render đủ.
- Dash trên đường đua dùng `InstancedMesh`; không dùng shadow map, không tải
  texture ngoài; robot và biển được tạo procedural.
- Cảnh tham chiếu chỉ khoảng 53 draw call và ~4.2k triangle (task 3), rất nhẹ so
  với các scene 3D thông thường.
- Tôn trọng `prefers-reduced-motion`: tắt bob, xoay sao, nhấp nháy ring và confetti.

## 6. Build và kiểm thử

```bash
npm install
npm run build:3d          # cập nhật js/simulation-3d.bundle.js
npm test                  # unit tests
node test-track-flow.js   # regression 3 task + track flow
node test-splash-welcome.js
```

CI chạy `npm run build:3d` rồi `git diff --exit-code -- js/simulation-3d.bundle.js`
để chắc chắn bundle đã commit khớp với source.

Smoke test thủ công (không chạy trên Vercel vì `/tests/*` bị redirect):

```bash
npx serve .
# mở http://localhost:3000/tests/manual/3d-smoke.html
```

## 7. Giới hạn hiện tại

- Camera follow bám robot đầu tiên; chưa có UI chọn robot cho race nhiều robot.
- Chưa có asset GLB; robot là procedural để giữ bundle nhỏ và không phụ thuộc CDN.
- Chưa có nút chuyển 3D/2D trong UI; dùng `?sim=2d` hoặc fallback tự động.
- Việc đăng nhập production vẫn cần cấu hình Neon + biến môi trường Vercel; xem
  [`docs/auth-setup.md`](./auth-setup.md).
