# Kế hoạch Database — Robot Math Lab (bản standalone, sau khi gỡ auth)

> Cập nhật: 05/11/2026
> Trạng thái hiện tại của repo (commit `87644d2`):
> - Không còn màn hình đăng nhập/đăng ký — vào trang là học được ngay.
> - Toàn bộ dữ liệu học tập (nhật ký PS1–PS11, gợi ý, từ điển) đang nằm ở `localStorage` của từng máy.
> - Production **chưa có database**: `/api/health` trả `503` (chưa cấu hình Neon hoặc chưa tạo DB).
> - `db/schema.sql` vẫn còn bảng auth cũ (accounts, classes, auth_sessions, login_events) nhưng **không endpoint nào dùng**.

---

## 1. Câu hỏi quyết định trước khi thiết kế

Database chỉ nên tồn tại nếu nó phục vụ một mục đích thật. Có 3 phương án:

| Phương án | Mô tả | Chi phí | Khi nào chọn |
|---|---|---|---|
| **A. Không cần DB** | Giữ nguyên 100% static + localStorage. Xoá phần auth leftover. | 0 | Chỉ demo/chạy lớp, không cần số liệu |
| **B. DB nghiên cứu ẩn danh** (khuyến nghị) | Gửi nhật ký học tập (sự kiện PS1–PS11, gợi ý, từ điển, thời gian, kết quả) lên Neon dưới dạng ẩn danh + bảng đồng ý (consent) | Nhỏ (Neon Free/Launch) | Đây là dự án NCKH — cần dữ liệu để phân tích |
| **C. Tài khoản tuỳ chọn + đồng bộ** | Thêm lại tài khoản (không bắt buộc) để đồng bộ nhật ký/tiến độ giữa các thiết bị, chia lớp | Trung bình | Khi cần báo cáo theo từng học sinh/giáo viên |

**Khuyến nghị: phương án B.** Trang web không cần DB để chạy (yêu cầu hiện tại là standalone), nhưng với mục tiêu nghiên cứu khoa học thì phần dữ liệu học tập đang bị "kẹt" trong localStorage mới là thứ đáng lưu. Phương án B không đụng vào giao diện, không bắt học sinh đăng nhập, và dữ liệu vẫn ẩn danh.

Phần còn lại của tài liệu thiết kế chi tiết cho phương án B, kèm ghi chú để nâng cấp lên C sau này nếu cần.

---

## 2. Nguyên tắc thiết kế

1. **Trang web chạy độc lập với DB.** Mất mạng hay DB lỗi → site vẫn học bình thường; việc gửi dữ liệu chỉ là "cố gắng tốt nhất" (fire-and-forget).
2. **Ẩn danh tối đa.** Không lưu tên thật, không lưu email, không lưu IP thô (chỉ lưu hash). Định danh bằng `install_id` (UUID ngẫu nhiên tự sinh ở máy học sinh, lưu localStorage).
3. **Có sự đồng ý (consent).** Là dữ liệu trẻ em (lớp 5) → chỉ gửi khi người dùng (phụ huynh/giáo viên đại diện) đã tick đồng ý trong app; lưu phiên bản consent để truy vết.
4. **Đúng mục đích nghiên cứu.** Chỉ gửi các sự kiện đã có sẵn trong `LogEngine`, không gửi bất kỳ nội dung tự do nào khác.
5. **Server-side only.** Không có cách nào truy cập DB trực tiếp từ trình duyệt; mọi ghi đều qua 1 endpoint `/api/events` được validate chặt.

---

## 3. Sơ đồ tổng thể

```
Trình duyệt (localStorage)
   ├─ LogEngine: sessions + events (PS1–PS11, HINT, VOCAB, ...)
   └─ TelemetryClient (mới, nhỏ): flush batch ẩn danh
              │ POST /api/events (bắt buộc same-origin, rate-limit)
              ▼
Vercel Function (serverless)
   ├─ validate body (kích thước, mã sự kiện allowlist, bỏ PII)
   ├─ upsert learning_sessions + learning_events (dedupe theo uid)
   └─ ghi app_metrics / rate_limits
              ▼
Neon Postgres (pooled connection, transaction mode)
```

---

## 4. Bảng dữ liệu (phương án B)

### 4.1 Bảng giữ lại từ schema cũ (đã có, dùng cho mục mới)

```sql
-- đếm online theo ngày (đã có trong db/schema.sql)
create table if not exists app_metrics (
  metric_date date primary key,
  peak_online integer not null default 0,
  updated_at  timestamptz not null default now()
);

-- rate limit (đã có) — dùng lại để chống spam endpoint /api/events
create table if not exists rate_limits (
  bucket       text not null,
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (bucket, window_start)
);
```

### 4.2 Bảng mới — sự đồng ý nghiên cứu

```sql
create table if not exists consents (
  id              bigserial primary key,
  install_id      text not null,
  consent_version text not null,
  granted_at      timestamptz not null default now(),
  revoked_at      timestamptz,
  unique (install_id, consent_version)
);
```

- `install_id`: UUID do máy tự sinh (không phải tên, không phải username).
- Mỗi lần đổi `CONSENT_VERSION` → học sinh được hỏi lại; bản cũ giữ lại để đối chiếu.

### 4.3 Bảng mới — phiên học tập (1 dòng / 1 lần làm nhiệm vụ)

```sql
create table if not exists learning_sessions (
  id               bigserial primary key,
  session_uid      text not null unique,     -- id phiên do client sinh (ses_...)
  install_id       text not null,
  task_id          text not null,            -- task1-reach | task2-fix | task3-new | ...
  task_title       text,
  language         text not null check (language in ('vi', 'en')),
  started_at       timestamptz,
  completed_at     timestamptz,
  total_time_s     integer not null default 0,
  total_attempts   integer not null default 0,
  backward_steps   integer not null default 0,
  hints_opened     integer not null default 0,
  max_hint_level   integer not null default 0,
  vocab_lookups    integer not null default 0,
  final_success    boolean,
  summary          jsonb not null default '{}'::jsonb,  -- các chỉ số khác của FeedbackEngine
  ip_hash          text,                    -- hash IP (không lưu IP thô)
  ua_hash          text,                    -- hash user-agent
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists learning_sessions_install_idx on learning_sessions (install_id, started_at desc);
create index if not exists learning_sessions_task_idx     on learning_sessions (task_id, started_at desc);
create index if not exists learning_sessions_started_idx  on learning_sessions (started_at desc);
```

### 4.4 Bảng mới — sự kiện học tập (1 dòng / 1 event PS1–PS11…)

```sql
create table if not exists learning_events (
  id               bigserial primary key,
  session_id       bigint not null references learning_sessions(id) on delete cascade,
  client_event_uid text not null unique,    -- evt_... do client sinh → chống gửi trùng khi retry
  install_id       text not null,
  task_id          text,
  code             text not null,           -- PS1..PS11, STEP_TRANSITION, HINT_REQUESTED,
                                            -- VOCAB_LOOKUP, JOURNAL_VIEWED, TASK_REFLECTION,
                                            -- INPUT_VALIDATION_FAILED, SESSION_STARTED/COMPLETED
  label            text,
  step             integer,
  relative_time_ms integer,
  payload          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists learning_events_session_idx on learning_events (session_id, created_at);
create index if not exists learning_events_install_idx on learning_events (install_id, created_at desc);
create index if not exists learning_events_task_code_idx on learning_events (task_id, code);
```

**Ghi chú dedupe:** client gửi lại batch khi mạng lỗi → `client_event_uid unique` + `on conflict do nothing` giúp không trùng dữ liệu.

### 4.5 Bảng cho tương lai (chỉ tạo khi chọn phương án C)

Khi cần đồng bộ tiến độ giữa thiết bị hoặc báo cáo theo lớp, thêm:

```sql
-- task_progress: tiến độ cao nhất của mỗi install_id với mỗi nhiệm vụ
create table if not exists task_progress (
  install_id   text not null,
  task_id      text not null,
  best_step    integer not null default 0,
  completed_at timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (install_id, task_id)
);
```

Còn bảng `accounts`/`classes`/`auth_sessions`/`login_events` cũ: **đề xuất không tạo mới** trong DB production (vì chưa có DB nào được tạo từ trước). Chỉ cần tạo lại khi thật sự quay lại phương án C.

---

## 5. Endpoint `/api/events`

### 5.1 Hợp đồng API

```http
POST /api/events
Content-Type: application/json
X-Install-Id: <uuid>          (hoặc để trong body)

Body (≤ 128 KB):
{
  "installId": "uuid-v4",
  "consentVersion": "2026-11-v1",
  "language": "vi",
  "sessions": [
    {
      "sessionUid": "ses_...",
      "taskId": "task1-reach",
      "taskTitle": "Reach the Goal",
      "startedAt": "2026-11-05T08:00:00Z",
      "completedAt": "2026-11-05T08:12:00Z",
      "totalTimeSeconds": 720,
      "totalAttempts": 2,
      "backwardSteps": 1,
      "hintsOpened": 1,
      "maxHintLevel": 1,
      "vocabLookups": 3,
      "finalSuccess": true,
      "summary": { ... },
      "events": [
        {
          "uid": "evt_...",
          "code": "PS7",
          "label": "Execution observation result",
          "step": 3,
          "relativeTimeMs": 432000,
          "payload": { "attempt": 1, "actualDistance": 42, "meetsRequirement": true }
        }
      ]
    }
  ]
}

Response 200:
{ "acceptedSessions": 1, "acceptedEvents": 18, "duplicatesSkipped": 0 }
```

### 5.2 Quy tắc validate (server)

- Chỉ nhận `POST`, bắt buộc **same-origin** (Origin khớp host), header `Cache-Control: no-store`.
- Body ≤ 128 KB; tối đa 20 sessions × 500 events / 1 lần gửi.
- `code` phải nằm trong **allowlist** (PS1–PS11 + các mã hệ thống đã liệt kê ở 4.4); không phải mã allowlist → loại bỏ event đó.
- `payload`: chỉ giữ kiểu JSON đơn giản, giới hạn độ sâu 4, tổng ≤ 4 KB/event; **xoá mọi field nhạy cảm** (`studentName`, `displayName`, `email`, `phone`…) trước khi ghi.
- `installId`: UUID hợp lệ, giới hạn độ dài 64 ký tự.
- IP: chỉ lưu `sha256(IP_HASH_PEPPER + ip)`; user-agent chỉ lưu hash.
- Rate limit: tái sử dụng `rate_limits` — ví dụ 30 request / phút / (ip+install).
- Nếu `consentVersion` không khớp bản mới nhất đang bật → trả `403 CONSENT_REQUIRED`, client ngừng gửi và hiện lại banner đồng ý.

### 5.3 Phía client (module mới `js/telemetry.js`, nhỏ)

- Tự sinh `install_id` (UUID) lưu localStorage nếu chưa có.
- Kiểm tra consent (localStorage `rml_consent_version` + server cho phép) → không có thì không gửi.
- Gom event theo batch, flush khi: hoàn thành nhiệm vụ, rời trang (`visibilitychange`), hoặc đủ 50 events / 60 giây.
- Dùng `navigator.sendBeacon` hoặc `fetch(keepalive)` → không làm chậm trang; lỗi mạng thì giữ queue và gửi lại sau, dedupe bằng `client_event_uid`.
- **Không** thay đổi gì ở LogEngine: telemetry chỉ "nghe" event đã có và serialize lên server.

---

## 6. Cấu hình Neon + Vercel (bước thực hiện)

### 6.1 Tạo database

1. Tạo project trên [Neon](https://neon.tech): region gần VN → `ap-southeast-1 (Singapore)` để độ trễ thấp.
2. Gói: **Free (0.5 GB)** đủ cho giai đoạn 1; nếu muốn branching + backup dài hơn thì **Launch 1 GB** (~19 USD/tháng, có thể hạ xuống sau).
3. Copy 2 chuỗi:
   - `DATABASE_URL` dạng **pooled** (`...-pooler.ap-southeast-1.aws.neon.tech`) → cho serverless runtime.
   - `DIRECT_URL` dạng **unpooled** (`...ap-southeast-1.aws.neon.tech`) → cho chạy migration/seed ở máy local.

### 6.2 Biến môi trường trên Vercel

| Biến | Giá trị | Ghi chú |
|---|---|---|
| `DATABASE_URL` | chuỗi pooled | Vercel Functions dùng |
| `DIRECT_URL` | chuỗi unpooled | chỉ dùng khi chạy script local (không cần set trên Vercel) |
| `DATABASE_SSL` | `require` | mặc định |
| `IP_HASH_PEPPER` | chuỗi ngẫu nhiên ≥ 32 ký tự | salt cho hash IP |
| `CONSENT_VERSION` | `2026-11-v1` | đổi khi cập nhật chính sách → hỏi lại học sinh |
| `APP_ORIGIN` | `https://robotmathlab.vercel.app` | allowlist same-origin (nếu cần thêm môi trường preview) |

### 6.3 Migration & kiểm tra

```bash
# 1) Cấu trúc lại schema: chuyển db/schema.sql hiện tại thành các file migration có đánh số
#    (xem mục 7). Trước mắt chỉ cần file mới 003_analytics.sql + app_metrics + rate_limits.

# 2) Chạy migration lên Neon (dùng DIRECT_URL)
npm run db:migrate

# 3) Kiểm tra endpoint
curl https://robotmathlab.vercel.app/api/health
# mong đợi: {"status":"ok","db":true,"time":"..."}
```

---

## 7. Chiến lược migration

Hiện tại `db/schema.sql` là 1 file idempotent chạy lặp được — ổn cho giai đoạn đầu nhưng khó rollback khi có thay đổi lớn. Đề xuất:

```
db/migrations/
  001_metrics_rate_limits.sql   (app_metrics + rate_limits — giữ từ schema cũ)
  002_analytics.sql             (consents + learning_sessions + learning_events)
  003_task_progress.sql         (chỉ khi chọn phương án C)

db/schema_migrations.sql        (bảng theo dõi version đã chạy)
```

- Thêm bảng `schema_migrations (version text primary key, applied_at timestamptz)`; `migrate.mjs` đọc thư mục, chỉ chạy file chưa apply, mỗi file trong 1 transaction.
- Bảng auth cũ (accounts/classes/auth_sessions/login_events): **bỏ khỏi migration** vì không dùng; code tham chiếu (`lib/auth.js`, `lib/password.js`, `scripts/seed.mjs`, `scripts/reset-password.mjs`) nên xoá hoặc để nguyên không gọi — ghi rõ trong README để tránh nhầm lẫn.

---

## 8. Sức chứa ~100 học sinh dùng đồng thời

Ước lượng thực tế:

| Hạng mục | Ước lượng |
|---|---|
| Sự kiện / phiên học | 15–30 events + 1 session |
| Tần suất gửi | flush khi xong nhiệm vụ + rời trang (không có heartbeat liên tục) |
| Lưu lượng giờ cao điểm (100 máy cùng làm) | ≈ 1–5 request/giây, vài chục dòng/giây |
| Dung lượng / tháng | < 10 MB |
| Kết nối DB | `postgres` pooler + `max: 1` mỗi function instance → Neon pooler xử lý mượt |

→ **Gói Neon Free là dư sức.** Bật autoscaling 0.25–1 CU để phòng lúc cả lớp cùng flush cuối tiết.

---

## 9. Bảo mật & riêng tư (dữ liệu trẻ em)

1. **Không PII**: không tên thật, không email, không số điện thoại; IP/user-agent chỉ lưu hash có salt (`IP_HASH_PEPPER`).
2. **Consent rõ ràng**: banner đồng ý trước lần gửi đầu tiên, lưu `consents` (phiên bản + thời điểm); có nút từ chối → app vẫn chạy, chỉ không gửi dữ liệu.
3. **Quyền xoá dữ liệu**: script `scripts/erase-install.mjs <install_id>` xoá toàn bộ dữ liệu của một máy khi được yêu cầu (GDPR trẻ em / yêu cầu phụ huynh).
4. **Chống spam**: same-origin + rate limit + kích thước body + allowlist code.
5. **Không expose DB**: không endpoint nào trả dữ liệu thô; báo cáo chỉ qua SQL trực tiếp trên Neon hoặc script vận hành.

---

## 10. Bảo trì & dọn dẹp

- **Vercel Cron** (`vercel.json` thêm `"crons": [{ "path": "/api/cron/cleanup", "schedule": "0 3 * * *" }]`) gọi `api/cron/cleanup.js`:
  - xoá `rate_limits` cũ hơn 2 ngày;
  - xoá `learning_sessions`/`learning_events` quá hạn lưu trữ (mặc định giữ 24 tháng cho nghiên cứu, tuỳ chỉnh);
  - cập nhật `app_metrics.peak_online`.
- **Backup**: Neon đã có Point-in-Time Restore (Free 7 ngày); muốn chắc hơn thì thêm GitHub Action dump hàng tuần.
- **Theo dõi**: `/api/health` + số dòng tăng theo ngày (`select count(*) from learning_events where created_at > now() - interval '1 day'`).

---

## 11. Lộ trình đề xuất

| Giai đoạn | Việc | Kết quả kiểm chứng |
|---|---|---|
| 1 (tuần này) | Chốt phương án (A/B/C); tạo Neon + env Vercel | `/api/health` → `db: true` |
| 2 | Migration mới (analytics), endpoint `/api/events` + test | Gửi 1 batch mẫu, đọc lại đúng dữ liệu |
| 3 | Module `js/telemetry.js` + banner consent | Mở trang, làm 1 nhiệm vụ, thấy dữ liệu xuất hiện trong Neon |
| 4 | Script xuất báo cáo CSV cho NCKH | Xuất được bảng tổng hợp theo task/step |

> Điểm quan trọng nhất: **site vẫn phải chạy mượt khi DB lỗi** — telemetry là phụ, học là chính. Mọi lệnh ghi đều fire-and-forget, có timeout ngắn và không bao giờ chặn giao diện.
