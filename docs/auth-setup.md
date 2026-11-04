# Đăng nhập, tài khoản học sinh và theo dõi truy cập
## Robot Math Lab — Vercel Functions + Neon Postgres

> Cập nhật: 2026-10-26. Phương án này thay thế phần PHP trong `docs/backend-php-plan.md` cho môi trường Vercel hiện tại.

---

## 1. Vì sao không dùng PHP trên Vercel?

`robotmathlab.vercel.app` đang là site static trên Vercel. Vercel **không có runtime PHP chính thức**; muốn dùng PHP phải dựng VPS/shared hosting riêng rồi nối sang, kéo theo CORS, cookie cross-site và vận hành thêm.

Phương án đã chọn:

```
Trình duyệt
   │ HTTPS, cùng origin
   ▼
Vercel
├── /                 → index.html + js/css hiện tại
├── /admin.html       → dashboard giáo viên/quản trị
└── /api/*            → Vercel Functions (Node.js)
                         │
                         ▼
                  Neon Postgres (Singapore)
```

Ưu điểm:
- API cùng domain với frontend → cookie `HttpOnly` hoạt động đơn giản, không CORS.
- Không cần quản trị server.
- 100 người dùng đồng thời nằm trong khả năng thoải mái của Vercel Functions + Neon pooler.
- Dễ mở rộng sau này (đồng bộ log học tập, quản lý giáo viên, export CSV).

---

## 2. Thành phần đã thêm

| File / thư mục | Vai trò |
|---|---|
| `db/schema.sql` | Bảng `classes`, `accounts`, `auth_sessions`, `login_events`, `app_metrics`, `rate_limits` |
| `lib/http.js` | JSON response, đọc body, cookie, hash IP, kiểm tra same-origin |
| `lib/password.js` | Hash/verify mật khẩu bằng `scrypt` |
| `lib/validate.js` | Chuẩn hoá username, tên hiển thị, mã lớp (tuỳ chọn) |
| `lib/auth.js` | Tạo/đọc session, CSRF, cookie, phân quyền |
| `lib/rate-limit.js` | Rate limit theo cửa sổ cố định trong Postgres |
| `lib/metrics.js` | Đếm online, peak, phạm vi lớp của giáo viên |
| `api/auth/register.js` | Đăng ký học sinh (không bắt buộc mã lớp) |
| `api/auth/login.js` | Đăng nhập username/mật khẩu |
| `api/auth/me.js` | Lấy tài khoản hiện tại + CSRF token |
| `api/auth/logout.js` | Đăng xuất, thu hồi session |
| `api/auth/heartbeat.js` | Cập nhật hiện diện để đếm online |
| `api/admin/stats.js` | Thống kê online/peak/login/tài khoản |
| `api/admin/classes.js` | Tạo lớp + mã tham gia |
| `api/health.js` | Kiểm tra API + DB |
| `js/auth.js` | Màn hình đăng nhập/đăng ký, chặn app trước khi auth |
| `css/auth.css` | Giao diện gate + dòng tài khoản trong Settings |
| `admin.html`, `js/admin.js`, `css/admin.css` | Dashboard quản trị |
| `scripts/migrate.mjs` | Chạy schema |
| `scripts/seed.mjs` | Tạo admin + lớp demo (+ giáo viên tuỳ chọn) |
| `tests/*.test.mjs` | Test hash mật khẩu và validation |

---

## 3. Tạo Neon Postgres

1. Vào [neon.tech](https://neon.tech), tạo project.
2. Chọn region **Singapore (`ap-southeast-1`)** để gần Việt Nam.
3. Tạo database `neondb` (mặc định).
4. Lấy hai connection string:
   - **Pooled** (host có `-pooler`) → dùng cho runtime Vercel.
   - **Direct** (không có `-pooler`) → dùng cho migration/seed.

Ví dụ:

```dotenv
DATABASE_URL=postgresql://user:pass@ep-xxxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
DIRECT_URL=postgresql://user:pass@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

> Luôn dùng pooled URL cho `DATABASE_URL` trên Vercel. Code đã đặt `prepare: false` để tương thích PgBouncer/Neon pooler.

---

## 4. Cấu hình biến môi trường

Tạo `.env.local` từ `.env.example`:

```powershell
Copy-Item .env.example .env.local
```

Điền tối thiểu:

```dotenv
DATABASE_URL=postgresql://...-pooler.../neondb?sslmode=require
DIRECT_URL=postgresql://.../neondb?sslmode=require
IP_HASH_PEPPER=<chuỗi-ngẫu-nhiên-32-byte>
APP_ORIGIN=https://robotmathlab.vercel.app
SESSION_TTL_HOURS=12
CONSENT_VERSION=2026-10-v1
MAX_ONLINE_ALERT=100
```

Tạo pepper:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Trên Vercel → Project → Settings → Environment Variables, thêm các biến sau cho **Production** (và Preview nếu cần):

| Biến | Bắt buộc | Ghi chú |
|---|---|---|
| `DATABASE_URL` | Có | Pooled Neon URL |
| `IP_HASH_PEPPER` | Có | Không đổi sau khi bắt đầu thu dữ liệu |
| `APP_ORIGIN` | Nên có | `https://robotmathlab.vercel.app` |
| `SESSION_TTL_HOURS` | Không | Mặc định 12 |
| `CONSENT_VERSION` | Nên có | Phiên bản consent hiện tại |
| `MAX_ONLINE_ALERT` | Không | Ngưỡng cảnh báo, mặc định 100 |

Không cần đưa `DIRECT_URL` lên runtime Vercel; biến này chỉ dùng cho script local.

---

## 5. Chạy migration và seed

```powershell
npm install
npm run db:migrate
npm run db:seed
```

`db:seed` sẽ:
- Tạo tài khoản admin (mặc định `admin`).
- Tạo lớp demo + mã tham gia.
- In mật khẩu admin một lần duy nhất.
- Tạo giáo viên nếu có `TEACHER_USERNAME` / `TEACHER_PASSWORD`.

Ví dụ kết quả:

```
Admin created: admin / xxxxxxxxxxxx
Class: Lớp Demo | join code: AB3K9Q
Admin dashboard: /admin.html
```

**Lưu mật khẩu ngay.** Nếu quên:

```powershell
$env:RESET_ADMIN_PASSWORD="1"
$env:ADMIN_PASSWORD="matkhaumoi123"
npm run db:seed
```

---

## 6. Deploy

Nếu repo đã nối Vercel với GitHub, chỉ cần push lên `main`. Nếu deploy bằng CLI:

```powershell
npx vercel --prod
```

Workflow cũ deploy GitHub Pages đã được thay bằng `.github/workflows/ci.yml` (chỉ chạy test + migrate schema). GitHub Pages không chạy được API/Vercel Functions, nên không dùng Pages cho bản có đăng nhập. Vercel Git Integration (hoặc `npx vercel --prod`) chịu trách nhiệm deploy.

Kiểm tra:

```powershell
curl.exe https://robotmathlab.vercel.app/api/health
```

Kỳ vọng:

```json
{ "status": "ok", "db": true, "time": "..." }
```

Sau đó mở:

- `https://robotmathlab.vercel.app/` → màn hình đăng nhập.
- `https://robotmathlab.vercel.app/admin.html` → đăng nhập admin.

> `vercel.json` đặt function region `sin1` (Singapore). Nếu gói Vercel không hỗ trợ region này, xoá `"regions"` và deploy lại.

---

## 7. Luồng sử dụng

### Quản trị viên / giáo viên

1. Vào `/admin.html`, đăng nhập.
2. (Tuỳ chọn) Tạo lớp để nhóm tài khoản và xem thống kê riêng. Học sinh hiện **không cần mã lớp** khi đăng ký.
3. Theo dõi:
   - Đang online (heartbeat 2 phút gần nhất).
   - Đỉnh online trong ngày.
   - Đăng nhập thành công / thất bại hôm nay.
   - Tổng tài khoản, danh sách lớp, tài khoản đang online.

### Học sinh

1. Mở trang chủ → chọn **Tạo tài khoản**.
2. Nhập tên hiển thị, username, mật khẩu, tick consent.
3. Tài khoản được tạo và đăng nhập ngay; tài khoản mới chưa thuộc lớp nào.
4. Lần sau đăng nhập bằng username/mật khẩu.
5. Trong **Cài đặt** có thông tin tài khoản và nút **Đăng xuất**.

### Quy tắc username

- 3–24 ký tự.
- Chỉ `a-z`, `0-9`, `_`.
- Bắt đầu bằng chữ hoặc số.
- Không dùng các tên dành riêng như `admin`, `teacher`, `root`, `system`.

Tên hiển thị (tiếng Việt có dấu) là trường riêng, không dùng làm username.

---

## 8. API

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| `POST` | `/api/auth/register` | public + same-origin | Đăng ký học sinh (mã lớp không bắt buộc) |
| `POST` | `/api/auth/login` | public + same-origin | Đăng nhập |
| `GET` | `/api/auth/me` | session | Tài khoản + CSRF token |
| `POST` | `/api/auth/logout` | session + CSRF | Đăng xuất |
| `POST` | `/api/auth/heartbeat` | session + CSRF | Cập nhật online |
| `GET` | `/api/admin/stats` | admin/teacher | Thống kê truy cập |
| `POST` | `/api/admin/classes` | admin/teacher + CSRF | Tạo lớp |
| `GET` | `/api/health` | public | Kiểm tra DB |

Cookie phiên:
- Production: `__Host-rml_session` (HttpOnly, Secure, SameSite=Lax).
- Preview/local: `rml_session`.
- Token thô chỉ nằm trong cookie; DB chỉ lưu SHA-256.

CSRF:
- `me` trả `csrf_token`.
- Các request thay đổi trạng thái gửi header `X-CSRF-Token`.
- Ngoài ra còn kiểm tra `Origin` trùng host.

---

## 9. Cách đo “online” và 100 người dùng

- Sau khi đăng nhập, trình duyệt gửi heartbeat mỗi **60 giây** (và khi tab quay lại foreground).
- Một tài khoản được tính online nếu có session chưa thu hồi, chưa hết hạn và `last_seen_at` trong **2 phút** gần nhất.
- `app_metrics.peak_online` lưu đỉnh theo ngày (giờ Việt Nam).
- **Không chặn cứng** khi vượt 100; dashboard hiển thị cảnh báo theo `MAX_ONLINE_ALERT`.

Với 100 người đồng thời:
- Heartbeat: ~1.7 request/giây.
- Sự kiện học tập (giai đoạn sau): nên batch 5–10 giây/lần.
- Neon pooler + Vercel Functions chịu được burst đăng nhập đầu giờ.
- Rate limit đăng nhập theo IP đặt **600/15 phút** để không chặn cả lớp dùng chung một IP NAT của trường; giới hạn theo username là **10/15 phút**.

Nếu cần kiểm thử tải, dùng k6/Artillery với kịch bản:
1. 100 VU đăng nhập.
2. Mỗi VU heartbeat mỗi 60 giây.
3. Đo p95 < 500 ms, tỷ lệ lỗi < 1%.

---

## 10. Bảo mật và quyền riêng tư

- Mật khẩu: `scrypt` (N=16384, r=8, p=1), salt ngẫu nhiên, so sánh constant-time.
- Không lưu mật khẩu thô, không log token.
- Session token 32 byte ngẫu nhiên; DB lưu hash SHA-256; thu hồi được khi logout.
- Cookie `HttpOnly`, `Secure`, `SameSite=Lax`; production dùng tiền tố `__Host-`.
- CSRF token + kiểm tra `Origin`.
- Rate limit đăng nhập/đăng ký/heartbeat.
- IP chỉ lưu dạng hash có pepper; không lưu IP thô.
- Học sinh không cần email/số điện thoại.
- Consent bắt buộc khi đăng ký; lưu `consent_version` + thời điểm.
- Dashboard chỉ trả dữ liệu trong phạm vi lớp của giáo viên; admin xem toàn bộ.
- API trả lỗi generic, không lộ stack trace.

> Đây là hệ thống cho trẻ em: nên có phiếu đồng thuận của phụ huynh/nhà trường và chính sách thời gian lưu dữ liệu (ví dụ 12 tháng) trước khi thu chính thức.

---

## 11. Vận hành

| Việc | Cách làm |
|---|---|
| Backup | Neon có PITR/branch; định kỳ tạo branch snapshot trước đợt thu dữ liệu |
| Xem log | Vercel → Project → Logs; lọc `/api/auth/*` |
| Health check | UptimeRobot gọi `/api/health` mỗi 5 phút |
| Dọn rate limit | Code tự xoá row cũ với xác suất 1%/request; có thể chạy SQL định kỳ |
| Xoá tài khoản | `update accounts set status='disabled' ...` hoặc xoá cascade session |
| Đổi mật khẩu admin | `RESET_ADMIN_PASSWORD=1 ADMIN_PASSWORD=... npm run db:seed` |
| Reset mật khẩu học sinh/giáo viên | `npm run user:reset-password -- <username> <new-password>` (chạy local, dùng `DIRECT_URL`) |

---

## 12. Giới hạn hiện tại và bước tiếp theo

1. **Gate phía client không phải security boundary.** App tĩnh vẫn có thể tải trực tiếp, nhưng dữ liệu thật nằm sau API và yêu cầu session. Nếu cần chặn cả việc dùng app, thêm Vercel Middleware kiểm tra cookie (chỉ là lớp UX, không thay thế API auth).
2. **Nhật ký học tập trong `localStorage` đã được lọc theo tài khoản.** Session mới có `accountId`; journal chỉ hiển thị phiên của tài khoản đang đăng nhập. Log cũ (không có `accountId`) sẽ bị ẩn sau khi đăng nhập để tránh lộ dữ liệu trên máy dùng chung. Bước tiếp theo: đồng bộ log lên server và có công cụ gán log cũ cho đúng tài khoản.
3. **Chưa có API đồng bộ log học tập.** Schema hiện tại tập trung vào auth/access. Có thể thêm `learning_sessions` + `learning_events` và endpoint batch như phương án PHP cũ.
4. **Chưa có UI quản lý tài khoản/giáo viên.** Hiện tạo giáo viên qua seed hoặc SQL. Có thể thêm `api/admin/accounts` + màn hình quản lý.
5. **Chưa có reset mật khẩu tự phục vụ.** Học sinh quên mật khẩu → giáo viên/admin chạy `npm run user:reset-password -- <username> <new-password>` hoặc thêm mã reset một lần trong giai đoạn sau. Lệnh này thu hồi toàn bộ session cũ của tài khoản.
6. **Vercel Hobby** có giới hạn fair-use. Nếu trường dùng chính thức/quy mô lớn, cân nhắc Vercel Pro và theo dõi invocation/GB-hours.

---

## 13. Checklist kiểm thử

- [ ] `/api/health` trả `db: true`.
- [ ] Đăng ký không cần mã lớp → thành công.
- [ ] Đăng ký username trùng → 409.
- [ ] Đăng ký thành công → vào app, header hiện đúng tên.
- [ ] Đăng xuất → quay lại gate, không vào được app nếu chưa đăng nhập lại.
- [ ] Sai mật khẩu 11 lần → 429.
- [ ] Admin login → thấy online/peak/logins.
- [ ] Tạo lớp (tuỳ chọn) → lớp xuất hiện trong dashboard (dùng cho nhóm tài khoản sau này).
- [ ] Giáo viên chỉ thấy lớp mình; admin thấy tất cả.
- [ ] Tắt tab 2 phút → online giảm.
- [ ] Cookie có `HttpOnly`, `Secure`, `SameSite=Lax`.
- [ ] `curl https://.../api/admin/stats` không cookie → 401.
- [ ] `curl https://.../api/auth/register` với `Origin` lạ → 403.

---

## 14. Xử lý sự cố

| Triệu chứng | Kiểm tra |
|---|---|
| `503 DB_NOT_CONFIGURED` | `DATABASE_URL` chưa set trên Vercel |
| `503` từ `/api/health` | Neon project bị pause, sai mật khẩu, hoặc dùng direct URL thay vì pooled |
| Đăng nhập xong vẫn quay lại gate | Cookie bị chặn; kiểm tra HTTPS, cùng domain, `__Host-`; xem DevTools → Application → Cookies |
| `CSRF_INVALID` | Tab cũ sau khi session hết hạn; tải lại trang |
| Rate limit oan cho cả lớp | Tăng giới hạn IP trong `api/auth/login.js` hoặc dùng per-username |
| Không thấy dashboard | Tài khoản role `student`; dùng admin/teacher |
| Seed báo thiếu biến | Chưa có `.env.local` hoặc chưa điền `DIRECT_URL` |

---

## 15. Lệnh nhanh

```powershell
npm install
npm run db:migrate
npm run db:seed
npm run user:reset-password -- hocsinh01 matkhaumoi123
npm test
npx vercel dev        # test local (cần Vercel CLI)
npx vercel --prod     # deploy
```
