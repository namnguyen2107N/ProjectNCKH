# Kế hoạch Database — Robot Math Lab (bản standalone + đăng nhập nhẹ tên/tuổi)

> Cập nhật: 05/11/2026
> Mô hình đã chốt với người sở hữu:
> - **Học sinh đăng nhập nhẹ**: chỉ cần **tên và độ tuổi**, không email, không mật khẩu, không mã lớp.
> - Hệ thống **lưu nhật ký học tập** (sự kiện PS1–PS11, gợi ý, từ điển, thời gian, kết quả).
> - **Có consent** trước khi ghi dữ liệu.
> - Dữ liệu **chỉ người sở hữu (bạn) xem và quản lý được**, không công khai.
> - Trang web vẫn chạy được khi DB lỗi (học là chính, ghi dữ liệu là phụ).
>
> Trạng thái repo hiện tại (commit `87644d2`): site standalone không có auth; dữ liệu học tập đang nằm ở `localStorage`; production **chưa có DB** (`/api/health` = 503); `db/schema.sql` còn bảng auth cũ nhưng không ai dùng.

---

## 0. Công nghệ xây dựng database (không dùng PHP)

| Lớp | Công nghệ | Ngôn ngữ |
|---|---|---|
| Database engine | Neon Postgres (PostgreSQL 14+) | — |
| Định nghĩa schema (bảng/index) | file `db/migrations/*.sql` | **SQL (PostgreSQL)** |
| API / logic phía server | Vercel Serverless Functions (`api/*.js`, `lib/*.js`) | JavaScript (Node.js) |
| Truy vấn dữ liệu | thư viện `postgres` (Postgres.js) | JavaScript + SQL parameterized |
| Migration / seed / script vận hành | `scripts/*.mjs` | JavaScript (Node.js) |

- **Có dùng SQL, không dùng PHP.** Không dùng MySQL, phpMyAdmin, Apache.
- Schema viết bằng **SQL thuần** (DDL): `CREATE TABLE`, ràng buộc `CHECK`/`UNIQUE`/`FOREIGN KEY`, `CREATE INDEX`.
- Truy vấn chạy bằng **SQL parameterized** (dạng `sql\`...\``, không ghép chuỗi) → tránh SQL injection.
- Postgres.js dùng cơ chế `prepare: false` khi đi qua Neon pooler (PgBouncer transaction mode).

---

## 1. Mô hình tổng thể

```
Học sinh (trên máy/tablet của lớp)
   ├─ Màn hình chào: nhập TÊN + TUỔI (hoặc chọn hồ sơ đã lưu trên máy)
   ├─ Consent banner → đồng ý/không đồng ý
   ├─ Làm nhiệm vụ → LogEngine ghi sự kiện (PS1–PS11, HINT, VOCAB, ...)
   └─ js/telemetry.js (mới) gom batch → POST /api/events
              │
              ▼
Vercel Functions (serverless)
   ├─ /api/students/*      : tạo/chọn hồ sơ học sinh (tên + tuổi) — đăng nhập nhẹ
   ├─ /api/events          : nhận nhật ký học tập (dedupe, validate, loại PII)
   └─ /api/owner/*         : CHỈ người sở hữu: xem, lọc, xuất CSV, xoá dữ liệu
              │
              ▼
Neon Postgres (pooled, transaction mode, region Singapore)
```

**Lưu ý an toàn được chấp nhận trong thiết kế:** đăng nhập của học sinh (tên + tuổi) **không phải xác thực bảo mật** — ai trên cùng máy cũng có thể chọn/nhập hồ sơ. Điều này phù hợp với lớp học và không lưu thông tin nhạy cảm. Lớp bảo mật thật sự nằm ở **phần của người sở hữu** (mật khẩu + session).

---

## 2. Nguyên tắc thiết kế

1. **Học sinh chỉ cần tên + tuổi.** Không username, không mật khẩu, không email.
2. **Dữ liệu gắn với hồ sơ học sinh** (pseudonymous), không gắn với thiết bị; một tablet có thể có nhiều hồ sơ (chọn trước khi học).
3. **Consent trước khi ghi.** Lưu phiên bản consent + thời điểm đồng ý; không đồng ý → app vẫn học, chỉ không gửi dữ liệu.
4. **Chỉ người sở hữu truy cập dữ liệu.** Không endpoint công khai nào trả dữ liệu thô; trang quản lý của bạn nằm ngoài giao diện học sinh.
5. **Site không phụ thuộc DB.** Ghi dữ liệu fire-and-forget, timeout ngắn, có queue gửi lại khi mất mạng.
6. **Không lưu IP thô** (chỉ hash có salt); không lưu nội dung tự do ngoài các trường đã định nghĩa.

---

## 3. Bảng dữ liệu

### 3.1 Hồ sơ học sinh — đăng nhập nhẹ

```sql
create table if not exists student_profiles (
  id           bigserial primary key,
  display_name text not null,
  age          smallint not null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz,
  deactivated_at timestamptz,
  constraint student_profiles_name_len check (char_length(display_name) between 1 and 50),
  constraint student_profiles_age_chk   check (age between 3 and 18)
);

create index if not exists student_profiles_name_idx on student_profiles (lower(display_name));
```

- Tạo mới: `POST /api/students { displayName, age }` → trả `{ profileId }`, client lưu `rml_profile_id`.
- Chọn lại: client gửi danh sách `profileId` đã lưu trên máy → server trả thông tin còn hợp lệ.
- Không trùng lặp kiểm soát cứng: mỗi máy giữ danh sách id riêng; nếu cùng tên+tuổi được tạo 2 lần thì đó là 2 hồ sơ khác nhau (chấp nhận, vì không có mật khẩu để phân biệt). Có thể thêm `unique (display_name, age)` nếu bạn muốn gộp, nhưng mặc định **không unique** để tránh chặn nhầm 2 học sinh trùng tên.

### 3.2 Sự đồng ý nghiên cứu

```sql
create table if not exists consents (
  id              bigserial primary key,
  profile_id      bigint not null references student_profiles(id) on delete cascade,
  consent_version text not null,
  granted_at      timestamptz not null default now(),
  revoked_at      timestamptz,
  unique (profile_id, consent_version)
);
```

- Đổi `CONSENT_VERSION` → học sinh được hỏi lại; bản cũ giữ để đối chiếu.

### 3.3 Phiên học tập

```sql
create table if not exists learning_sessions (
  id               bigserial primary key,
  session_uid      text not null unique,     -- ses_... do client sinh
  profile_id       bigint not null references student_profiles(id) on delete cascade,
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
  summary          jsonb not null default '{}'::jsonb,
  ip_hash          text,
  ua_hash          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists learning_sessions_profile_idx on learning_sessions (profile_id, started_at desc);
create index if not exists learning_sessions_task_idx     on learning_sessions (task_id, started_at desc);
create index if not exists learning_sessions_started_idx  on learning_sessions (started_at desc);
```

### 3.4 Sự kiện học tập

```sql
create table if not exists learning_events (
  id               bigserial primary key,
  session_id       bigint not null references learning_sessions(id) on delete cascade,
  client_event_uid text not null unique,    -- evt_... → dedupe khi client gửi lại
  profile_id       bigint not null references student_profiles(id) on delete cascade,
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

create index if not exists learning_events_session_idx  on learning_events (session_id, created_at);
create index if not exists learning_events_profile_idx  on learning_events (profile_id, created_at desc);
create index if not exists learning_events_task_code_idx on learning_events (task_id, code);
```

### 3.5 Người sở hữu — chỉ bạn truy cập

```sql
create table if not exists owner_accounts (
  id            bigserial primary key,
  username      text not null unique,
  password_hash text not null,              -- scrypt, tạo qua script
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists owner_sessions (
  id           bigserial primary key,
  owner_id     bigint not null references owner_accounts(id) on delete cascade,
  token_hash   text not null unique,
  csrf_token   text not null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz
);

create index if not exists owner_sessions_active_idx
  on owner_sessions (last_seen_at) where revoked_at is null;
```

- Chỉ tạo **1 tài khoản owner** qua `scripts/seed-owner.mjs` (username + mật khẩu từ env/biến nhập, hash scrypt như `lib/password.js` đã có).
- Session cookie `HttpOnly; Secure; SameSite=Lax` + CSRF token, giống cơ chế auth cũ đã viết (tận dụng `lib/auth.js`, `lib/password.js`).

### 3.6 Bảng giữ lại từ schema cũ

```sql
create table if not exists app_metrics (
  metric_date date primary key,
  peak_online integer not null default 0,
  updated_at  timestamptz not null default now()
);

create table if not exists rate_limits (
  bucket       text not null,
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (bucket, window_start)
);
```

**Bỏ qua** các bảng `accounts`/`classes`/`auth_sessions`/`login_events` cũ (không còn dùng, không tạo trong DB mới). Code tham chiếu còn sót (`lib/auth.js`, `lib/password.js` dùng lại cho owner, `scripts/seed.mjs`, `scripts/reset-password.mjs`) sẽ được phân loại: giữ `lib/password.js`, viết lại phần session cho owner; xoá `seed.mjs`/`reset-password.mjs` hoặc thay bằng script owner.

---

## 4. Endpoint

### 4.1 Học sinh — đăng nhập nhẹ + ghi dữ liệu

```http
POST /api/students
{ "displayName": "An", "age": 10 }        → { "profileId": 42 }

GET /api/students/:ids?ids=1,2,3           → thông tin các hồ sơ còn hợp lệ (để máy hiện danh sách chọn)

POST /api/events
{ "profileId": 42, "consentVersion": "2026-11-v1", "language": "vi",
  "sessions": [ { "sessionUid": "ses_...", "taskId": "...", ..., "events": [ ... ] } ] }
→ { "acceptedSessions": 1, "acceptedEvents": 18, "duplicatesSkipped": 0 }
```

Quy tắc `/api/events` (giữ nguyên tinh thần kế hoạch cũ):
- `POST`, same-origin, `no-store`, body ≤ 128 KB, ≤ 20 sessions × 500 events.
- `code` phải nằm trong **allowlist** (PS1–PS11 + mã hệ thống liệt kê ở 3.4).
- `payload`: JSON đơn giản, độ sâu ≤ 4, ≤ 4 KB/event; **tự loại** mọi field nhạy cảm không cần thiết.
- IP/user-agent chỉ lưu hash (`IP_HASH_PEPPER`).
- Rate limit qua `rate_limits` (ví dụ 30 req/phút/profile).
- `consentVersion` không hợp lệ → `403 CONSENT_REQUIRED`.
- Dedupe: `client_event_uid` unique + `on conflict do nothing`.

### 4.2 Người sở hữu — xem & quản lý (bảo vệ bằng mật khẩu)

```http
POST /api/owner/login      { username, password }   → cookie session (scrypt + CSRF)
POST /api/owner/logout
GET  /api/owner/me

GET  /api/owner/students?q=An&age=10                → danh sách hồ sơ (tên, tuổi, số phiên, lần cuối)
GET  /api/owner/sessions?profileId=42&taskId=...&from=...&to=...&limit=50
GET  /api/owner/events?sessionId=...                → chi tiết sự kiện 1 phiên
GET  /api/owner/export.csv?from=...&to=...          → xuất CSV tổng hợp (profile, task, thời gian, kết quả, hint, vocab)
POST /api/owner/erase    { profileId }              → xoá toàn bộ dữ liệu 1 học sinh (theo yêu cầu phụ huynh)
```

- Mọi endpoint owner đều yêu cầu session hợp lệ + CSRF; đăng nhập sai nhiều lần → khoá theo `rate_limits`.
- Giao diện quản lý: **1 trang riêng** (`owner.html` hoặc `admin.html` tái tạo tối giản) nằm ngoài giao diện học sinh, **không đặt link** trong trang chính; chỉ bạn biết đường dẫn. Hiển thị: danh sách học sinh, lọc phiên theo task/ngày, xem chi tiết sự kiện, nút xuất CSV, nút xoá dữ liệu.
- Trang học sinh và trang owner tách hoàn toàn: dữ liệu owner không bao giờ lộ qua API công khai.

---

## 5. Cấu hình Neon + Vercel

### 5.1 Tạo database

1. Neon project, region **`ap-southeast-1 (Singapore)`**.
2. Gói **Free (0.5 GB)** đủ dùng; cần branching/backup dài hơn thì nâng **Launch 1 GB**.
3. Copy `DATABASE_URL` (pooled, cho runtime) và `DIRECT_URL` (unpooled, cho script local).

### 5.2 Env trên Vercel

| Biến | Giá trị | Ghi chú |
|---|---|---|
| `DATABASE_URL` | chuỗi pooled | dùng cho Functions |
| `DIRECT_URL` | chuỗi unpooled | chỉ cho script local |
| `DATABASE_SSL` | `require` | mặc định |
| `IP_HASH_PEPPER` | ngẫu nhiên ≥ 32 ký tự | salt hash IP |
| `CONSENT_VERSION` | `2026-11-v1` | đổi khi cập nhật chính sách |
| `APP_ORIGIN` | `https://robotmathlab.vercel.app` | allowlist same-origin |
| `OWNER_USERNAME` / `OWNER_PASSWORD` | chỉ dùng lúc chạy `seed-owner` | không đặt lại sau khi tạo |

### 5.3 Chạy & kiểm tra

```bash
npm run db:migrate        # tạo bảng (DIRECT_URL)
npm run owner:seed        # tạo tài khoản owner duy nhất
curl https://robotmathlab.vercel.app/api/health
# mong đợi: {"status":"ok","db":true,"time":"..."}
```

---

## 6. Migration

```
db/migrations/
  001_profiles_consent.sql   (student_profiles + consents)
  002_learning.sql           (learning_sessions + learning_events + app_metrics + rate_limits)
  003_owner.sql              (owner_accounts + owner_sessions)

db/schema_migrations.sql     (bảng version + migrate.mjs chỉ chạy file chưa apply, mỗi file 1 transaction)
```

- Thay `db/schema.sql` idempotent hiện tại bằng cơ chế migration có version (an toàn khi sửa sau này).
- DB production chưa từng tồn tại → không cần migration dữ liệu cũ; tạo mới sạch từ đầu.

---

## 7. Sức chứa ~100 học sinh

| Hạng mục | Ước lượng |
|---|---|
| Sự kiện / phiên | 15–30 events + 1 session |
| Tần suất ghi | flush khi xong nhiệm vụ / rời trang, không heartbeat liên tục |
| Giờ cao điểm (100 máy) | 1–5 request/giây, vài chục dòng/giây |
| Dung lượng / tháng | < 15 MB |
| Kết nối | Neon pooler + `max: 1` / function instance |

→ Neon Free dư sức; bật autoscaling 0.25–1 CU cho lúc cả lớp flush cuối tiết.

---

## 8. Bảo mật & riêng tư

1. **Học sinh**: chỉ tên + tuổi (pseudonymous), không email/số điện thoại; IP/user-agent chỉ hash.
2. **Consent**: banner trước lần gửi đầu; không đồng ý → vẫn học, không ghi dữ liệu.
3. **Người sở hữu**: mật khẩu scrypt + session HttpOnly + CSRF + rate limit; chỉ 1 tài khoản; trang quản lý không liên kết từ giao diện học sinh.
4. **Quyền xoá**: `POST /api/owner/erase` (hoặc script `scripts/erase-profile.mjs`) để xoá toàn bộ dữ liệu 1 học sinh khi phụ huynh yêu cầu.
5. **Chống spam**: same-origin, rate limit, giới hạn kích thước, allowlist mã sự kiện.

---

## 9. Bảo trì & dọn dẹp

- Vercel Cron `0 3 * * *` → `/api/cron/cleanup`: xoá `rate_limits` cũ, phiên hết hạn, cập nhật `app_metrics`.
- Neon PITR backup (Free 7 ngày); tuỳ chọn GitHub Action dump hàng tuần.
- Lưu trữ dữ liệu nghiên cứu mặc định 24 tháng (điều chỉnh được); xoá sớm hơn khi có yêu cầu.
- Theo dõi: `/api/health` + đếm dòng mới theo ngày.

---

## 10. Lộ trình

| Giai đoạn | Việc | Kiểm chứng |
|---|---|---|
| 1 | Tạo Neon + env Vercel (bạn) | `/api/health` → `db: true` |
| 2 | Migration 001–003 + script `owner:seed` | Bảng được tạo, owner đăng nhập được |
| 3 | `/api/students` + `/api/events` + module `js/telemetry.js` + banner consent | Làm 1 nhiệm vụ → dữ liệu xuất hiện trong Neon |
| 4 | Trang quản lý owner + export CSV + xoá dữ liệu | Bạn xem/lọc/xuất được toàn bộ dữ liệu |
| 5 | Script báo cáo NCKH (tổng hợp theo task/step/tuổi) | Xuất được bảng phân tích |

> Cột mốc quan trọng nhất vẫn là: **site chạy mượt khi DB lỗi** — mọi ghi dữ liệu đều fire-and-forget, không chặn giao diện.
