# Phương án thiết lập cơ sở dữ liệu và triển khai PHP
## Robot Math Lab — NCKH

> **Cập nhật 2026-10-26:** dự án đã chọn **Vercel Functions + Neon Postgres** thay cho PHP vì frontend đang chạy tại `robotmathlab.vercel.app` và Vercel không có runtime PHP chính thức. Xem `docs/auth-setup.md` cho phương án đang triển khai. Tài liệu này được giữ làm phương án tham khảo nếu sau này chuyển sang VPS/shared hosting PHP.

> Tài liệu này là **phương án kỹ thuật**, chưa thay đổi mã nguồn hiện tại.
> Mục tiêu: thu thập dữ liệu phiên học tập trung, phục vụ nghiên cứu và cho phép giáo viên/nhà nghiên cứu xem, xuất dữ liệu — vẫn giữ ứng dụng hoạt động khi mất mạng.

---

## 1. Hiện trạng và vấn đề

| Hạng mục | Hiện tại |
|---|---|
| Frontend | HTML/CSS/JS thuần (`index.html`, `js/`, `css/`, `data/`) |
| Lưu trữ | `localStorage` (`rml_research_logs_v2`), giới hạn 30 phiên |
| Backend | Không có |
| Deploy | GitHub Pages (`.github/workflows/deploy.yml`) — chỉ static, không chạy PHP |
| Dữ liệu nghiên cứu | Nằm trên từng máy học sinh, không tổng hợp được, dễ mất khi xoá cache/đổi máy |

**Hệ quả:** không thể phân tích tập trung, không có dashboard giáo viên, không đảm bảo toàn vẹn dữ liệu nghiên cứu.

**Mục tiêu của backend:**
1. Nhận và lưu phiên học + toàn bộ sự kiện PS1–PS11, thời gian từng bước, lượt xem từ vựng, lượt xin gợi ý.
2. Đồng bộ offline-first: mất mạng vẫn học, có mạng thì tự gửi bù, không mất dữ liệu.
3. Tài khoản giáo viên/nhà nghiên cứu, phân quyền theo lớp.
4. Xuất CSV/JSONL phục vụ phân tích thống kê.
5. Bảo vệ dữ liệu trẻ em: tối thiểu PII, có consent, mã hoá khi truyền, sao lưu định kỳ.

---

## 2. Kiến trúc đề xuất

```
Trình duyệt (học sinh)
  │  HTTPS
  ▼
┌──────────────────────────────────────────────┐
│  Web server (Nginx / Apache)                 │
│  Document root = public/                     │
│  ├── /                → frontend hiện tại    │
│  ├── /api/v1/*        → PHP front controller │
│  └── /admin/*         → dashboard PHP        │
└──────────────────┬───────────────────────────┘
                   │ PDO (prepared statements)
                   ▼
        MariaDB 10.6+ / MySQL 8.0+
        utf8mb4, InnoDB, timezone UTC
```

**Stack khuyến nghị:**

| Thành phần | Lựa chọn | Ghi chú |
|---|---|---|
| PHP | 8.2 hoặc 8.3 | Bắt buộc `pdo_mysql`, `mbstring`, `json`, `openssl`, `opcache` |
| CSDL | MariaDB 10.6+ hoặc MySQL 8.0+ | Nếu chỉ demo 1 lớp có thể dùng SQLite, nhưng không khuyến nghị cho thu thập chính thức |
| Web server | Nginx + PHP-FPM (VPS) hoặc Apache + PHP-FPM (cPanel) | Không dùng Apache `mod_php` cũ |
| Framework | PHP thuần + Composer (PSR-4, dotenv) | Đủ nhẹ, dễ deploy shared hosting; có thể nâng lên Slim 4 nếu dashboard lớn |
| Auth | Session cookie + CSRF cho giáo viên/nghiên cứu viên | Học sinh không cần mật khẩu |
| Đồng bộ | REST JSON + outbox trong `localStorage` | Idempotent, retry có backoff |

> **Quan trọng:** GitHub Pages không chạy được PHP. Khi có backend, frontend nên được phục vụ **cùng domain** với API (ví dụ `https://mathlab.truong.edu.vn`), tránh CORS và vấn đề cookie third-party.

---

## 3. Mô hình dữ liệu

### 3.1 Sơ đồ quan hệ

```
users (giáo viên/nghiên cứu/admin)
  └── classes (lớp)
        ├── research_consents (đồng thuận)
        └── learning_sessions (phiên học)
              ├── session_steps (thời gian từng bước Polya)
              └── learning_events (PS1–PS11, vocab, hint, ...)

tasks (danh mục nhiệm vụ + version cấu hình)
```

### 3.2 DDL khởi tạo (MySQL 8 / MariaDB 10.6)

```sql
-- database/migrations/001_init.sql
SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    VARCHAR(32) NOT NULL,
  applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Tài khoản ----------
CREATE TABLE IF NOT EXISTS users (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username      VARCHAR(50)  NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name  VARCHAR(100) NOT NULL,
  role          ENUM('admin','researcher','teacher','student') NOT NULL DEFAULT 'teacher',
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  last_login_at DATETIME(3)  NULL,
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Lớp ----------
CREATE TABLE IF NOT EXISTS classes (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(100) NOT NULL,
  school_name VARCHAR(150) NULL,
  grade_level TINYINT UNSIGNED NULL,
  join_code   VARCHAR(12)  NOT NULL,
  teacher_id  BIGINT UNSIGNED NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_classes_join_code (join_code),
  KEY idx_classes_teacher (teacher_id),
  CONSTRAINT fk_classes_teacher FOREIGN KEY (teacher_id)
    REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Nhiệm vụ (version hoá cấu hình) ----------
CREATE TABLE IF NOT EXISTS tasks (
  task_key   VARCHAR(64)  NOT NULL,
  title      VARCHAR(200) NOT NULL,
  version    VARCHAR(20)  NOT NULL DEFAULT '1.0.0',
  config     JSON         NULL,
  is_active  TINYINT(1)   NOT NULL DEFAULT 1,
  created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (task_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Đồng thuận nghiên cứu ----------
CREATE TABLE IF NOT EXISTS research_consents (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  participant_code VARCHAR(40) NOT NULL,       -- mã học sinh, không dùng họ tên đầy đủ
  class_id         BIGINT UNSIGNED NULL,
  consent_version  VARCHAR(20) NOT NULL,
  status           ENUM('pending','granted','declined','revoked') NOT NULL DEFAULT 'pending',
  granted_at       DATETIME(3) NULL,
  revoked_at       DATETIME(3) NULL,
  evidence_ref     VARCHAR(255) NULL,          -- đường dẫn phiếu giấy/scan nội bộ
  note             VARCHAR(500) NULL,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_consent_participant_version (participant_code, consent_version),
  KEY idx_consent_class (class_id),
  CONSTRAINT fk_consent_class FOREIGN KEY (class_id)
    REFERENCES classes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Phiên học ----------
CREATE TABLE IF NOT EXISTS learning_sessions (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  client_session_id    VARCHAR(64) NOT NULL,   -- sess_... do frontend sinh
  student_id           BIGINT UNSIGNED NULL,
  student_name         VARCHAR(100) NOT NULL,  -- snapshot, không FK bắt buộc
  class_id             BIGINT UNSIGNED NULL,
  consent_id           BIGINT UNSIGNED NULL,
  task_key             VARCHAR(64) NULL,
  task_title           VARCHAR(200) NULL,
  started_at           DATETIME(3) NOT NULL,
  completed_at         DATETIME(3) NULL,
  current_step         TINYINT UNSIGNED NULL,
  total_attempts       INT UNSIGNED NOT NULL DEFAULT 0,
  total_time_seconds   INT UNSIGNED NOT NULL DEFAULT 0,
  backward_steps_count INT UNSIGNED NOT NULL DEFAULT 0,
  vocab_lookup_count   INT UNSIGNED NOT NULL DEFAULT 0,
  hint_request_count   INT UNSIGNED NOT NULL DEFAULT 0,
  final_success        TINYINT(1) NOT NULL DEFAULT 0,
  device_id            VARCHAR(64) NULL,
  app_version          VARCHAR(20) NULL,
  ip_hash              CHAR(64) NULL,          -- SHA-256(IP + pepper)
  user_agent_hash      CHAR(64) NULL,
  raw_summary          JSON NULL,              -- summary gốc từ client
  created_at           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_sessions_client_id (client_session_id),
  KEY idx_sessions_class_time (class_id, started_at),
  KEY idx_sessions_task_time (task_key, started_at),
  KEY idx_sessions_student_time (student_id, started_at),
  KEY idx_sessions_completed (completed_at),
  CONSTRAINT fk_sessions_student FOREIGN KEY (student_id)
    REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_sessions_class FOREIGN KEY (class_id)
    REFERENCES classes(id) ON DELETE SET NULL,
  CONSTRAINT fk_sessions_task FOREIGN KEY (task_key)
    REFERENCES tasks(task_key) ON DELETE SET NULL,
  CONSTRAINT fk_sessions_consent FOREIGN KEY (consent_id)
    REFERENCES research_consents(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Thời gian từng bước Polya ----------
CREATE TABLE IF NOT EXISTS session_steps (
  session_id    BIGINT UNSIGNED NOT NULL,
  step          TINYINT UNSIGNED NOT NULL,
  total_time_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,
  visit_count   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, step),
  CONSTRAINT fk_steps_session FOREIGN KEY (session_id)
    REFERENCES learning_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Sự kiện học tập ----------
CREATE TABLE IF NOT EXISTS learning_events (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id        BIGINT UNSIGNED NOT NULL,
  client_event_id   VARCHAR(64) NOT NULL,
  code              VARCHAR(32) NOT NULL,      -- PS1..PS11, VOCAB_LOOKUP, HINT_REQUESTED, ...
  label             VARCHAR(255) NULL,
  step              TINYINT UNSIGNED NULL,
  relative_time_ms  INT UNSIGNED NOT NULL DEFAULT 0,
  occurred_at       DATETIME(3) NOT NULL,
  payload           JSON NULL,
  created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_events_client (session_id, client_event_id),
  KEY idx_events_session_time (session_id, occurred_at),
  KEY idx_events_session_code (session_id, code),
  KEY idx_events_code_time (code, occurred_at),
  CONSTRAINT fk_events_session FOREIGN KEY (session_id)
    REFERENCES learning_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Rate limit (dùng khi không có APCu/Redis) ----------
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket       VARCHAR(128) NOT NULL,
  window_start INT UNSIGNED NOT NULL,          -- unix timestamp đầu cửa sổ
  hits         SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Audit log ----------
CREATE TABLE IF NOT EXISTS audit_logs (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    BIGINT UNSIGNED NULL,
  action     VARCHAR(64) NOT NULL,             -- login, export.csv, delete.session, ...
  entity     VARCHAR(64) NULL,
  entity_id  VARCHAR(64) NULL,
  ip_hash    CHAR(64) NULL,
  meta       JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_audit_time (created_at),
  KEY idx_audit_user_time (user_id, created_at),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Seed nhiệm vụ ----------
INSERT INTO tasks (task_key, title, version) VALUES
  ('task1-reach', 'Task 1: Reach the Goal',         '1.0.0'),
  ('task2-fix',   'Task 2: The Unexpected Journey','1.0.0'),
  ('task3-new',   'Task 3: The On-Time Challenge', '1.0.0')
ON DUPLICATE KEY UPDATE title = VALUES(title);
```

### 3.3 View và truy vấn nghiên cứu mẫu

```sql
CREATE OR REPLACE VIEW v_session_overview AS
SELECT
  s.id, s.client_session_id, c.name AS class_name,
  s.task_key, s.student_name, s.started_at, s.completed_at,
  s.total_attempts, s.total_time_seconds, s.final_success,
  s.hint_request_count, s.vocab_lookup_count, s.backward_steps_count,
  rc.status AS consent_status
FROM learning_sessions s
LEFT JOIN classes c ON c.id = s.class_id
LEFT JOIN research_consents rc ON rc.id = s.consent_id;

-- Tỷ lệ thành công và thời gian trung bình theo nhiệm vụ
SELECT task_key,
       COUNT(*) AS sessions,
       ROUND(AVG(final_success) * 100, 1) AS success_rate_pct,
       ROUND(AVG(total_time_seconds), 1)   AS avg_seconds,
       ROUND(AVG(total_attempts), 2)       AS avg_attempts
FROM learning_sessions
WHERE completed_at IS NOT NULL
GROUP BY task_key;

-- So sánh nhóm có/không dùng gợi ý
SELECT CASE WHEN hint_request_count = 0 THEN 'no_hint' ELSE 'used_hint' END AS hint_group,
       COUNT(*) AS sessions,
       ROUND(AVG(final_success) * 100, 1) AS success_rate_pct
FROM learning_sessions
WHERE completed_at IS NOT NULL
GROUP BY hint_group;

-- Thời gian trung bình từng bước Polya
SELECT ss.step, COUNT(*) AS n,
       ROUND(AVG(ss.total_time_ms) / 1000, 1) AS avg_seconds
FROM session_steps ss
JOIN learning_sessions s ON s.id = ss.session_id
WHERE s.completed_at IS NOT NULL
GROUP BY ss.step
ORDER BY ss.step;
```

> Chỉ đưa vào phân tích các phiên có `consent_status = 'granted'`. Khi công bố, thay `student_name` bằng `participant_code` hoặc mã hoá giả danh.

### 3.4 Từ điển dữ liệu (rút gọn)

| Trường | Ý nghĩa |
|---|---|
| `client_session_id` | ID phiên do frontend sinh, dùng để chống trùng khi retry |
| `client_event_id` | ID sự kiện, unique trong phiên |
| `code` | Mã sự kiện: `PS1`–`PS11`, `VOCAB_LOOKUP`, `HINT_REQUESTED`, `SESSION_STARTED`, `SESSION_COMPLETED`, `TASK_REFLECTION`, `PS8_RESPONSE`, `INPUT_VALIDATION_FAILED`, `JOURNAL_VIEWED` |
| `relative_time_ms` | Thời điểm tương đối so với lúc bắt đầu phiên — ít bị ảnh hưởng lệch đồng hồ |
| `final_success` | Server tính lại từ sự kiện, không chỉ tin client |
| `backward_steps_count` | Số lần quay lui bước Polya (từ bước lớn về bước nhỏ) |
| `raw_summary` | Bản gốc summary của client để đối chiếu |
| `ip_hash`, `user_agent_hash` | Hash có pepper, không lưu IP/UA thô |

---

## 4. Thiết kế API

Base URL: `https://<domain>/api/v1`. Tất cả request/response là JSON UTF-8.

> `class_code` trong API ánh xạ tới `classes.join_code` trong CSDL (mã giáo viên gửi cho học sinh).

### 4.1 Endpoint công khai (học sinh, không cần đăng nhập)

| Method | Path | Mục đích | Rate limit gợi ý |
|---|---|---|---|
| `POST` | `/sessions` | Tạo phiên (idempotent theo `client_session_id`) | 10/phút/IP |
| `POST` | `/sessions/{clientSessionId}/events` | Gửi batch sự kiện | 60/phút/IP |
| `PATCH` | `/sessions/{clientSessionId}` | Cập nhật summary/hoàn thành | 20/phút/IP |
| `POST` | `/sessions/{clientSessionId}/complete` | Chốt phiên | 10/phút/IP |
| `GET` | `/tasks` | Danh mục nhiệm vụ đang hoạt động | 60/phút/IP |
| `GET` | `/health` | Kiểm tra DB + version | 30/phút/IP |

**Tạo phiên:**

```json
POST /api/v1/sessions
{
  "client_session_id": "sess_1793000000000_a1b2c3",
  "student_name": "Bé Yêu Toán",
  "class_code": "LOP4A",
  "task_key": "task1-reach",
  "task_title": "Task 1: Reach the Goal",
  "started_at": "2026-10-26T08:00:00.000Z",
  "device_id": "8f14e45f-ea4c-4b7a-9c1d-2f3e4d5c6b7a",
  "app_version": "1.4.0"
}
```

Response `201`:

```json
{ "data": { "session_id": 123, "client_session_id": "sess_1793000000000_a1b2c3" } }
```

Nếu `client_session_id` đã tồn tại: trả `200` cùng dữ liệu, **không tạo bản ghi mới**.

**Gửi batch sự kiện:**

```json
POST /api/v1/sessions/sess_1793000000000_a1b2c3/events
{
  "events": [
    {
      "client_event_id": "evt_1793000001000_x1",
      "code": "PS4",
      "label": "Selected a formula",
      "step": 2,
      "relative_time_ms": 15230,
      "occurred_at": "2026-10-26T08:00:15.230Z",
      "data": { "formula": "s = v * t" }
    }
  ]
}
```

- Tối đa **100 sự kiện**/request, body tối đa **256 KB**.
- Server bỏ qua sự kiện trùng bằng `UNIQUE (session_id, client_event_id)`.
- Server **recompute** `total_attempts`, `hint_request_count`, `vocab_lookup_count` từ sự kiện; không tin hoàn toàn số client gửi.

**Chốt phiên:**

```json
POST /api/v1/sessions/sess_1793000000000_a1b2c3/complete
{
  "completed_at": "2026-10-26T08:12:40.000Z",
  "final_success": true,
  "summary": {
    "totalAttempts": 3,
    "totalTimeSeconds": 760,
    "backwardStepsCount": 1
  },
  "stepTimings": {
    "1": { "totalTimeMs": 120000 },
    "2": { "totalTimeMs": 240000 },
    "3": { "totalTimeMs": 300000 },
    "4": { "totalTimeMs": 100000 }
  }
}
```

### 4.2 Endpoint giáo viên / nghiên cứu viên (cần đăng nhập)

| Method | Path | Quyền | Mục đích |
|---|---|---|---|
| `POST` | `/auth/login` | public | Đăng nhập, trả session cookie + CSRF token |
| `POST` | `/auth/logout` | auth | Đăng xuất |
| `GET` | `/auth/me` | auth | Thông tin user hiện tại |
| `GET` | `/classes` | teacher/researcher/admin | Danh sách lớp được phép xem |
| `POST` | `/classes` | admin | Tạo lớp + `join_code` |
| `GET` | `/classes/{id}/sessions` | teacher sở hữu lớp | Phiên của lớp, có phân trang/lọc |
| `GET` | `/sessions` | researcher/admin | Tìm phiên theo lớp, nhiệm vụ, thời gian, thành công |
| `GET` | `/sessions/{id}` | theo quyền | Chi tiết phiên + toàn bộ sự kiện |
| `GET` | `/stats/overview` | teacher/researcher/admin | KPI tổng hợp |
| `GET` | `/exports/sessions.csv` | teacher/researcher | CSV (UTF-8 BOM, chống formula injection) |
| `GET` | `/exports/research.jsonl` | researcher/admin | JSONL cho Python/R |
| `GET` | `/audit-logs` | admin | Nhật ký thao tác |

**Quy tắc phân quyền:**
- `teacher`: chỉ lớp có `classes.teacher_id = current_user.id`.
- `researcher`: tất cả lớp, chỉ đọc, có thể ẩn danh khi export.
- `admin`: toàn quyền + quản lý user.
- Mọi endpoint export đều ghi `audit_logs`.

### 4.3 Error envelope

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dữ liệu không hợp lệ",
    "details": { "student_name": "Tối đa 100 ký tự" }
  }
}
```

| HTTP | Code |
|---|---|
| 400 | `BAD_REQUEST` |
| 401 | `UNAUTHENTICATED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 422 | `VALIDATION_ERROR` |
| 429 | `RATE_LIMITED` (kèm `Retry-After`) |
| 500 | `INTERNAL_ERROR` (không lộ stack trace) |

---

## 5. Cấu trúc mã nguồn PHP

Đề xuất tách **docroot** khỏi code để không lộ `.env`, SQL, log:

```
Project/
├── public/                     # DOCUMENT ROOT
│   ├── index.html              # frontend hiện tại
│   ├── css/  js/  data/
│   ├── api/
│   │   └── index.php           # front controller API
│   ├── admin/                  # dashboard PHP (login, sessions, export)
│   └── .htaccess
├── app/                        # KHÔNG web-accessible
│   ├── Bootstrap.php
│   ├── Database.php            # PDO singleton, ERRMODE_EXCEPTION
│   ├── Http/
│   │   ├── Router.php
│   │   ├── Request.php
│   │   └── Response.php
│   ├── Middleware/
│   │   ├── AuthMiddleware.php
│   │   ├── CsrfMiddleware.php
│   │   ├── RateLimitMiddleware.php
│   │   └── SecurityHeaders.php
│   ├── Controllers/
│   │   ├── AuthController.php
│   │   ├── SessionController.php
│   │   ├── EventController.php
│   │   ├── DashboardController.php
│   │   └── ExportController.php
│   ├── Repositories/
│   │   ├── SessionRepository.php
│   │   ├── EventRepository.php
│   │   ├── UserRepository.php
│   │   └── ClassRepository.php
│   ├── Services/
│   │   ├── SessionService.php
│   │   ├── StatsService.php
│   │   └── ConsentService.php
│   └── Support/
│       ├── Validator.php
│       ├── Clock.php
│       └── Logger.php
├── bin/
│   ├── migrate.php             # chạy migration, ghi schema_migrations
│   ├── create-admin.php        # tạo admin đầu tiên (CLI)
│   └── prune.php               # xoá rate limit cũ, ẩn danh dữ liệu hết hạn
├── database/
│   ├── schema.sql
│   └── migrations/001_init.sql
├── storage/
│   ├── logs/
│   └── cache/
├── tests/                      # PHPUnit
├── vendor/                     # Composer
├── composer.json
├── .env                        # ngoài public, chmod 600
└── .env.example
```

### 5.1 Điểm khởi động API

```php
<?php
// public/api/index.php
declare(strict_types=1);

require dirname(__DIR__, 2) . '/vendor/autoload.php';

$app = new App\Bootstrap(dirname(__DIR__, 2));
$app->run();
```

### 5.2 Kết nối PDO an toàn

```php
<?php
// app/Database.php
final class Database
{
    private static ?PDO $pdo = null;

    public static function pdo(array $cfg): PDO
    {
        if (self::$pdo instanceof PDO) {
            return self::$pdo;
        }

        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
            $cfg['host'], (int) $cfg['port'], $cfg['name']
        );

        self::$pdo = new PDO($dsn, $cfg['user'], $cfg['pass'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
            PDO::ATTR_STRINGIFY_FETCHES  => false,
        ]);
        self::$pdo->exec("SET time_zone = '+00:00'");

        return self::$pdo;
    }
}
```

### 5.3 Upsert phiên (idempotent)

```php
$sql = <<<SQL
INSERT INTO learning_sessions
  (client_session_id, student_name, class_id, task_key, task_title,
   started_at, device_id, app_version, ip_hash, user_agent_hash)
VALUES
  (:client_session_id, :student_name, :class_id, :task_key, :task_title,
   :started_at, :device_id, :app_version, :ip_hash, :user_agent_hash)
ON DUPLICATE KEY UPDATE
  student_name = VALUES(student_name),
  class_id     = COALESCE(VALUES(class_id), class_id),
  updated_at   = CURRENT_TIMESTAMP(3)
SQL;
```

> `VALUES()` vẫn chạy trên MySQL 8 (có cảnh báo deprecated) và MariaDB. Nếu chỉ dùng MySQL ≥ 8.0.19 có thể thay bằng cú pháp alias `AS new`.

### 5.4 Ghi batch sự kiện

```php
$pdo->beginTransaction();
$stmt = $pdo->prepare(
  'INSERT INTO learning_events
     (session_id, client_event_id, code, label, step, relative_time_ms, occurred_at, payload)
   VALUES (:session_id, :client_event_id, :code, :label, :step, :relative_time_ms, :occurred_at, :payload)
   ON DUPLICATE KEY UPDATE id = id'
);

foreach ($events as $e) {
    $stmt->execute([
        ':session_id'       => $sessionId,
        ':client_event_id'  => $e['client_event_id'],
        ':code'             => $e['code'],
        ':label'            => mb_substr((string)($e['label'] ?? ''), 0, 255),
        ':step'             => $e['step'] ?? null,
        ':relative_time_ms' => max(0, (int)($e['relative_time_ms'] ?? 0)),
        ':occurred_at'      => gmdate('Y-m-d H:i:s', strtotime($e['occurred_at'])) . '.000',
        ':payload'          => json_encode($e['data'] ?? [], JSON_UNESCAPED_UNICODE),
    ]);
}
$pdo->commit();
```

### 5.5 Cấu hình môi trường

```dotenv
# .env (KHÔNG commit)
APP_ENV=production
APP_URL=https://mathlab.truong.edu.vn
APP_TIMEZONE=UTC

DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=rml
DB_USER=rml_app
DB_PASS=<mật-khẩu-mạnh-ngẫu-nhiên>

SESSION_NAME=RMLSESSID
SESSION_SECURE=1
SESSION_SAMESITE=Lax

IP_HASH_PEPPER=<chuỗi-ngẫu-nhiên-32-byte>
RATE_LIMIT_ENABLED=1
LOG_LEVEL=warning
```

`chmod 600 .env`. Không đặt `.env` trong `public/`. Nếu shared hosting bắt buộc để trong thư mục web, thêm rule chặn `.env` và kiểm tra bằng trình duyệt.

---

## 6. Tích hợp frontend — offline-first

### 6.1 Nguyên tắc

1. **`localStorage` vẫn là nguồn dữ liệu cục bộ chính** khi chưa gửi được. Server là bản sao bền vững.
2. Không chặn luồng học nếu API lỗi/chậm.
3. Gửi theo batch, có idempotency, retry backoff, gửi bù khi có mạng.
4. Không thu thập thêm PII ngoài `student_name` (khuyến nghị chỉ là tên hiển thị hoặc mã học sinh).

### 6.2 Module mới `js/api-client.js`

```js
window.RMLApi = (() => {
  const API_BASE = window.RML_API_BASE || '/api/v1';
  const OUTBOX_KEY = 'rml_outbox_v1';
  const MAX_OUTBOX = 500;
  let flushing = false;

  const load = () => {
    try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]'); }
    catch { return []; }
  };
  const save = (items) => {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(items.slice(-MAX_OUTBOX)));
  };

  function enqueue(op) {
    const items = load();
    items.push({ ...op, queued_at: Date.now() });
    save(items);
  }

  async function flush() {
    if (flushing || !navigator.onLine) return;
    flushing = true;
    try {
      let items = load();
      while (items.length) {
        const op = items[0];
        const res = await fetch(API_BASE + op.path, {
          method: op.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(op.body),
          credentials: 'same-origin',
          keepalive: true
        });
        // 4xx (trừ 408/429) là lỗi dữ liệu: bỏ để không kẹt hàng đợi
        if (!res.ok && res.status !== 408 && res.status !== 429 && res.status < 500) {
          console.warn('Dropping invalid op', op, res.status);
        } else if (!res.ok) {
          break; // lỗi tạm thời: giữ lại, thử sau
        }
        items = load().slice(1);
        save(items);
      }
    } catch (e) {
      console.warn('Sync paused:', e);
    } finally {
      flushing = false;
    }
  }

  function sendSessionStart(payload) {
    enqueue({ method: 'POST', path: '/sessions', body: payload });
    flush();
  }
  function sendEvents(clientSessionId, events) {
    if (!events.length) return;
    enqueue({
      method: 'POST',
      path: `/sessions/${encodeURIComponent(clientSessionId)}/events`,
      body: { events }
    });
    flush();
  }
  function sendComplete(clientSessionId, payload) {
    enqueue({
      method: 'POST',
      path: `/sessions/${encodeURIComponent(clientSessionId)}/complete`,
      body: payload
    });
    flush();
  }

  window.addEventListener('online', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  setInterval(flush, 10000);

  return { enqueue, flush, sendSessionStart, sendEvents, sendComplete };
})();
```

### 6.3 Nối vào `LogEngine`

- `startSession()` → gọi `RMLApi.sendSessionStart(...)`.
- `logEvent()` → đẩy vào buffer, mỗi 5 giây hoặc 20 sự kiện thì `sendEvents`.
- `completeSession()` → `sendComplete(...)` rồi `flush()`.
- Khi `visibilitychange = hidden` hoặc `beforeunload` → flush (dùng `fetch` với `keepalive`).
- Thêm nút **“Đồng bộ dữ liệu cũ”**: đọc `rml_research_logs_v2`, gửi từng phiên + sự kiện, đánh dấu `rml_synced_at`. Sinh `client_event_id` cho log cũ nếu thiếu.

### 6.4 Feature flag & cấu hình

```html
<meta name="rml-api-base" content="/api/v1">
```

```js
// js/config.js
window.RML_API_BASE = document.querySelector('meta[name="rml-api-base"]')?.content || '/api/v1';
window.RML_SYNC_ENABLED = true; // tắt trong giai đoạn chưa có backend
```

Giai đoạn đầu để `RML_SYNC_ENABLED = false`, bật sau khi API đã kiểm thử.

### 6.5 Xử lý trùng & thứ tự

- `client_session_id` unique ở server.
- Outbox xử lý tuần tự; nếu `POST /sessions` thất bại thì các event phía sau giữ nguyên thứ tự.
- Server có thể nhận event trước khi session tồn tại? **Không** — endpoint event trả `404`; client giữ lại và thử lại. Đơn giản và tránh tạo phiên rác.
- Nếu học sinh mở 2 tab cùng lúc: mỗi tab có `sessionId` riêng, không xung đột.

---

## 7. Bảo mật và quyền riêng tư

### 7.1 Bắt buộc

| Hạng mục | Cách làm |
|---|---|
| SQL injection | PDO prepared statements, `ATTR_EMULATE_PREPARES = false`, không nối chuỗi SQL |
| XSS | API trả JSON; dashboard dùng `htmlspecialchars($v, ENT_QUOTES, 'UTF-8')`; CSP |
| CSRF | Token trong session, kiểm tra `hash_equals` cho mọi POST/PATCH/DELETE của dashboard |
| Mật khẩu | `password_hash($pwd, PASSWORD_ARGON2ID)` (fallback bcrypt), `password_needs_rehash` |
| Session | `HttpOnly`, `Secure`, `SameSite=Lax`, `session_regenerate_id(true)` sau login |
| Rate limit | Theo IP + theo username; 429 + `Retry-After` |
| File/đường dẫn | Không có upload; chặn `.env`, `.sql`, `.md`, log qua web server |
| Header | HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP |
| DB user | Chỉ `SELECT/INSERT/UPDATE/DELETE` trên schema `rml`; user migration riêng có quyền DDL |
| Log | Không log mật khẩu/token/PII; log lỗi ra ngoài `public/` |
| Backup | Mã hoá bản backup chứa dữ liệu trẻ em; lưu offsite |

### 7.2 Quyền riêng tư cho NCKH

- Chỉ lưu **tên hiển thị** hoặc **mã học sinh**; không lưu họ tên đầy đủ, email, số điện thoại, địa chỉ.
- Có phiếu đồng thuận của phụ huynh/học sinh; bảng `research_consents` là nguồn xác nhận.
- Trang giới thiệu trước khi bắt đầu: mục đích thu thập, thời gian lưu, cách rút lui.
- `ip_hash` dùng pepper lưu trong `.env`; không lưu IP thô.
- Thời hạn lưu đề xuất: **12 tháng** sau khi kết thúc nghiên cứu, sau đó ẩn danh hoá hoặc xoá.
- Export công bố: thay tên bằng mã, loại bỏ `device_id`, `ip_hash`, `user_agent_hash`.
- Chỉ giáo viên phụ trách lớp và nghiên cứu viên được duyệt mới xem dữ liệu chi tiết.

### 7.3 Kiểm tra trước khi mở cho học sinh

- [ ] `curl -I https://domain/.env` → 403/404
- [ ] `curl https://domain/database/migrations/001_init.sql` → 403/404
- [ ] `curl https://domain/docs/backend-php-plan.md` → 403/404
- [ ] Không có `display_errors=On`
- [ ] Cookie có `Secure`, `HttpOnly`, `SameSite`
- [ ] Chạy OWASP ZAP baseline, không có lỗi High
- [ ] Thử SQLi/XSS vào `student_name`, `label`, `payload`
- [ ] Rate limit trả 429 đúng
- [ ] Backup restore thử thành công

---

## 8. Phương án triển khai

### Phương án A — Shared hosting / cPanel (khuyến nghị cho NCKH quy mô nhỏ)

**Phù hợp:** 1–10 lớp, vài trăm học sinh, ngân sách thấp, không muốn quản trị server.

**Yêu cầu nhà cung cấp:** PHP 8.2+, MySQL 8/MariaDB 10.6+, SSL miễn phí, hỗ trợ đặt document root cho subdomain/addon domain, tốt nhất có SSH + cron.

**Các bước:**

1. **Chuẩn bị**
   - Mua domain/subdomain (`mathlab.truong.edu.vn`).
   - Tạo hosting, chọn PHP 8.2/8.3, bật `pdo_mysql`, `mbstring`, `opcache`.
   - Bật AutoSSL, force HTTPS.

2. **Tạo CSDL**
   - cPanel → MySQL Databases: tạo DB `rml`, user `rml_app`, mật khẩu mạnh.
   - Cấp toàn quyền cho user trên DB đó.
   - Import `database/migrations/001_init.sql` qua phpMyAdmin (hoặc `php bin/migrate.php` nếu có SSH).

3. **Đưa code lên**
   - Cách 1 (khuyến nghị): Git Version Control trong cPanel → clone repo → `composer install --no-dev --optimize-autoloader`.
   - Cách 2: nén code (trừ `.git`, `node_modules`) → upload → giải nén.
   - Cấu trúc trên hosting:
     ```
     /home/<account>/
     ├── public_html/        ← nội dung của public/
     ├── rml-app/            ← app/, database/, storage/, vendor/, .env
     └── backups/
     ```
   - Nếu không tách được, đặt document root = `public/` và thêm `.htaccess` chặn mọi thứ ngoài `public/`.

4. **Cấu hình**
   - Tạo `.env` trong `rml-app/`, `chmod 600`.
   - Sửa `public/api/index.php` trỏ đúng `vendor/autoload.php`.
   - Tạo admin: `php bin/create-admin.php`.
   - Đặt quyền ghi cho `storage/` (`755` hoặc `775`), không dùng `777`.

5. **Cron**
   ```cron
   0 2 * * * /home/<account>/bin/backup-rml.sh >> /home/<account>/logs/backup.log 2>&1
   ```
   Script dùng `mysqldump --single-transaction --routines --triggers`, gzip, giữ 14 bản, copy sang thư mục ngoài `public_html`.

6. **Kiểm tra**
   - `GET /api/v1/health` → `{ "status": "ok", "db": true }`
   - Tạo phiên thử bằng `curl`, kiểm tra phpMyAdmin.
   - Mở frontend, làm 1 nhiệm vụ, kiểm tra dữ liệu lên server.
   - Chạy checklist mục 7.3.

**Ưu/nhược:** rẻ, nhanh; hạn chế quyền kiểm soát PHP-FPM, có thể bị giới hạn `max_connections`, không cài được Redis/APCu tuỳ gói.

### Phương án B — VPS (Ubuntu 24.04 + Nginx + PHP-FPM + MariaDB)

**Phù hợp:** cần kiểm soát, nhiều lớp hơn, muốn CI/CD, monitoring, backup chủ động.

**Các bước tóm tắt:**

```bash
# 1. Cài đặt
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx mariadb-server \
  php8.3-fpm php8.3-mysql php8.3-mbstring php8.3-xml php8.3-curl php8.3-opcache \
  unzip git certbot python3-certbot-nginx

# 2. Bảo mật cơ bản
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo mysql_secure_installation
```

```sql
-- 3. CSDL
CREATE DATABASE rml CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'rml_app'@'localhost' IDENTIFIED BY '<mật-khẩu-mạnh>';
GRANT SELECT, INSERT, UPDATE, DELETE ON rml.* TO 'rml_app'@'localhost';
FLUSH PRIVILEGES;
```

```nginx
# /etc/nginx/sites-available/rml
server {
    listen 80;
    server_name mathlab.truong.edu.vn;
    root /var/www/rml/public;
    index index.html index.php;

    client_max_body_size 2m;

    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header Permissions-Policy "geolocation=(), camera=(), microphone=()" always;

    location / {
        try_files $uri $uri/ /api/index.php?$query_string;
    }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
    }

    location ~ /\.(?!well-known) { deny all; }
    location ~* \.(env|sql|md|log|ini)$ { deny all; }

    location ~* \.(css|js|png|jpg|svg|woff2)$ {
        expires 7d;
        add_header Cache-Control "public, max-age=604800";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/rml /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d mathlab.truong.edu.vn
```

**Deploy:**
```bash
cd /var/www/rml
git pull --ff-only
composer install --no-dev --optimize-autoloader
php bin/migrate.php
sudo systemctl reload php8.3-fpm
curl -fsS https://mathlab.truong.edu.vn/api/v1/health
```

**Backup:**
```bash
#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date +%F_%H%M)
DEST=/var/backups/rml
mkdir -p "$DEST"
mariadb-dump --single-transaction --routines --triggers rml \
  | gzip > "$DEST/rml_${STAMP}.sql.gz"
find "$DEST" -name 'rml_*.sql.gz' -mtime +14 -delete
# tuỳ chọn: rclone copy "$DEST" remote:rml-backups
```

**Ưu/nhược:** kiểm soát tốt, chạy được queue/Redis/APCu; cần tự vá bảo mật, giám sát, tốn công vận hành hơn.

### Phương án C — Giữ GitHub Pages cho frontend, API ở subdomain riêng

**Chỉ dùng khi bắt buộc** (ví dụ trường chỉ cho phép Pages). Khi đó:
- API tại `https://api.mathlab.truong.edu.vn`, frontend tại `https://<user>.github.io/...`.
- CORS phải allow đúng origin, `Access-Control-Allow-Credentials: true`, không dùng `*`.
- Cookie phải `SameSite=None; Secure` → dễ bị chặn bởi trình duyệt (third-party cookie).
- Khuyến nghị dùng **Bearer token** cho dashboard thay vì cookie, hoặc chuyển hẳn frontend về cùng domain.
- GitHub Pages vẫn không chạy được PHP; backend phải host riêng.

> **Khuyến nghị:** chọn A hoặc B, phục vụ frontend và API **cùng domain**. Điều này đơn giản hoá cookie, CSP, CORS và tránh lỗi trình duyệt.

---

## 9. CI/CD và kiểm thử

### 9.1 GitHub Actions đề xuất

Tách 2 job:

```yaml
name: Test and Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      mariadb:
        image: mariadb:11
        env:
          MARIADB_ROOT_PASSWORD: root
          MARIADB_DATABASE: rml_test
        ports: ['3306:3306']
        options: >-
          --health-cmd="healthcheck.sh --connect --innodb_initialized"
          --health-interval=5s --health-timeout=5s --health-retries=10
    steps:
      - uses: actions/checkout@v4
      - uses: shivammathur/setup-php@v2
        with:
          php-version: '8.3'
          extensions: pdo_mysql, mbstring
      - run: composer install --no-interaction --prefer-dist
      - run: mysql -h127.0.0.1 -uroot -proot rml_test < database/migrations/001_init.sql
      - run: vendor/bin/phpunit
      - run: node test-track-flow.js
      - run: node test-splash-welcome.js

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy via rsync
        run: |
          rsync -az --delete public/ user@server:/var/www/rml/public/
          rsync -az app/ database/ bin/ composer.json composer.lock user@server:/var/www/rml/
      - name: Migrate and health check
        run: ssh user@server 'cd /var/www/rml && php bin/migrate.php && curl -fsS https://mathlab.truong.edu.vn/api/v1/health'
```

- Nếu shared hosting không có SSH: dùng FTPS action hoặc cPanel Git pull + cron.
- **Không đưa `.env`, `storage/logs`, `vendor` vào artifact Pages.**
- Nếu vẫn giữ Pages cho demo, sửa `upload-pages-artifact` chỉ upload `public/` (hiện tại đang upload `.`, làm lộ `docs/`, `security/`, `test-*.js`).

### 9.2 Kiểm thử tối thiểu

| Loại | Nội dung |
|---|---|
| Unit | Validator, tính summary, phân quyền |
| Integration | Tạo phiên → 100 event → complete → đọc lại; gửi trùng không nhân đôi |
| API contract | Đúng status code, error envelope, JSON schema |
| Security | SQLi/XSS/oversized payload/rate limit/CSRF |
| Offline | DevTools offline → hoàn thành bài → online → dữ liệu lên đủ |
| Load | 100 VU, mỗi VU 1 phiên + 20 event; p95 < 300 ms, lỗi < 0.1% |
| Restore | Khôi phục backup vào DB trắng, đối chiếu số dòng |

---

## 10. Sao lưu, giám sát, vận hành

| Hạng mục | Chính sách |
|---|---|
| Backup DB | Hằng ngày 02:00, `mariadb-dump --single-transaction`, gzip, giữ 14 ngày, copy offsite |
| Backup code | Git là nguồn chính; tag release trước khi thu dữ liệu chính thức |
| Restore test | Mỗi tháng 1 lần, ghi lại thời gian khôi phục |
| Monitoring | Uptime check `/api/v1/health` mỗi 5 phút; cảnh báo email/Telegram |
| Log | Rotate hằng tuần, giữ 30 ngày; không ghi payload chứa PII |
| DB maintenance | `ANALYZE TABLE` định kỳ; theo dõi slow query log |
| Dọn dẹp | `bin/prune.php` xoá `rate_limits` cũ, ẩn danh phiên quá hạn lưu |
| Nâng cấp | PHP/DB bản vá bảo mật; không nâng major trước đợt thu dữ liệu |

**Chỉ số vận hành cần theo dõi:**
- Tỷ lệ ingest thành công (2xx / tổng request).
- Số phiên chưa `completed_at` quá 24h (dấu hiệu client không gửi được).
- Độ trễ p95 của `POST /events`.
- Dung lượng DB và tốc độ tăng.
- Số bản ghi event/phiên bất thường (client lỗi hoặc spam).

---

## 11. Lộ trình triển khai

| Giai đoạn | Thời lượng | Công việc | Kết quả |
|---|---|---|---|
| 0. Chuẩn bị | 0.5–1 ngày | Chốt hosting/domain, chính sách dữ liệu, mẫu consent | Hạ tầng + phê duyệt |
| 1. CSDL & khung PHP | 1–2 ngày | Schema, migration, seed, Bootstrap, health check | `GET /health` chạy |
| 2. Ingest API | 2–3 ngày | Session/event/complete, idempotency, rate limit, validate | `curl` tạo được phiên đầy đủ |
| 3. Đồng bộ frontend | 2–3 ngày | `api-client.js`, outbox, nối LogEngine, nút sync log cũ | Offline → online không mất dữ liệu |
| 4. Auth & dashboard | 2–3 ngày | Login, phân quyền lớp, danh sách phiên, KPI, export CSV/JSONL | Giáo viên xem & xuất được |
| 5. Hardening & pilot | 2–3 ngày | Security checklist, backup/restore, load test, thử 1 lớp | Báo cáo pilot + fix |
| 6. Mở rộng | 1 tuần | 3–5 lớp, theo dõi lỗi, chốt schema | Dữ liệu chính thức |

Tổng: **~1.5–2 tuần** cho 1 lập trình viên có kinh nghiệm PHP; có thể song song hoá frontend/backend để rút ngắn.

---

## 12. Checklist nghiệm thu

**Chức năng**
- [ ] Học sinh làm bài offline, online lại thì dữ liệu lên server đầy đủ.
- [ ] Gửi lặp request không tạo phiên/sự kiện trùng.
- [ ] Dashboard giáo viên chỉ thấy lớp mình.
- [ ] Nghiên cứu viên lọc theo lớp/nhiệm vụ/thời gian/thành công.
- [ ] Export CSV mở đúng tiếng Việt trong Excel; JSONL đọc được bằng pandas.
- [ ] Nút “Đồng bộ dữ liệu cũ” gửi được log trong `localStorage`.

**Phi chức năng**
- [ ] HTTPS, HSTS, cookie Secure/HttpOnly/SameSite.
- [ ] `.env`, SQL, log, docs không truy cập được qua web.
- [ ] Backup tự động + đã thử restore.
- [ ] p95 ingest < 300 ms với 100 VU.
- [ ] Không có lỗi High trong ZAP baseline.
- [ ] Có consent cho 100% học sinh tham gia.
- [ ] Tài liệu bàn giao: schema, API, runbook, data dictionary.

---

## 13. Câu hỏi cần chốt trước khi code

1. **Hạ tầng:** dùng shared hosting (cPanel), VPS, hay server của trường? Có domain/subdomain chưa?
2. **Phạm vi:** chỉ cần thu log để nghiên cứu, hay cần cả tài khoản học sinh + giáo viên + nhiều lớp?
3. **Quy mô:** bao nhiêu lớp/học sinh? Bao nhiêu em dùng cùng lúc (giờ học)?
4. **Dữ liệu:** trường có yêu cầu lưu trữ tại Việt Nam, phê duyệt ethics, hoặc mẫu consent riêng không?
5. **Hiện trạng:** có cần giữ GitHub Pages song song không, hay chuyển hẳn sang domain PHP?
6. **Tiến độ:** cần bản pilot trước ngày nào?

---

## 14. Rủi ro và cách giảm thiểu

| Rủi ro | Giảm thiểu |
|---|---|
| GitHub Pages làm lộ file nội bộ | Tách `public/`, sửa workflow chỉ upload frontend; không commit `.env` |
| Mất dữ liệu do offline lâu | Outbox giới hạn 500 event, cảnh báo khi gần đầy; cho phép export JSON cục bộ |
| Học sinh dùng chung máy | Dùng `class_code` + `student_name`/`student_code`, không chỉ `device_id` |
| Trùng tên học sinh | Thêm `student_code` do giáo viên cấp |
| Lệch đồng hồ máy học sinh | Dùng `relative_time_ms`, server lưu `created_at` riêng |
| Shared hosting giới hạn tài nguyên | Batch event, index hợp lý, nén response, giới hạn payload |
| Lộ dữ liệu trẻ em | Tối thiểu PII, hash IP, phân quyền, backup mã hoá, consent |
| Schema thay đổi giữa đợt thu thập | Freeze schema + `tasks.version`, migration có version |
| Không restore được backup | Diễn tập restore trước khi chạy chính thức |

---

## 15. Chi phí tham khảo (VND)

| Khoản | Chi phí/tháng |
|---|---|
| Shared hosting cPanel (VN) | 50.000 – 200.000 |
| VPS 2 vCPU / 2 GB | 150.000 – 350.000 |
| Domain `.vn` | ~25.000 – 40.000 (quy năm) |
| SSL Let's Encrypt | 0 |
| Backup offsite | 0 – 50.000 |
| **Tổng pilot** | **< 500.000/tháng** |

> Nếu trường có server nội bộ, có thể dùng Cloudflare Tunnel + HTTPS để học sinh truy cập mà không cần mở port.
