# Owner console — xem và quản lý dữ liệu học tập

> Trang: `/owner.html` (không có link từ giao diện học sinh)
> Công nghệ: HTML/CSS/JS tĩnh + Vercel Functions + Neon Postgres
> Bảo vệ: mật khẩu chủ (scrypt) + session cookie HttpOnly + CSRF

---

## 1. Cài đặt lần đầu

### 1.1 Tạo Neon + env

Làm theo `docs/database-plan.md` mục 5. Tối thiểu cần:

```env
DATABASE_URL=postgresql://...-pooler.../neondb?sslmode=require
DIRECT_URL=postgresql://.../neondb?sslmode=require
IP_HASH_PEPPER=<chuỗi ngẫu nhiên dài>
CONSENT_VERSION=2026-11-v1
OWNER_USERNAME=owner
OWNER_PASSWORD=<mật khẩu mạnh>
```

`CONSENT_VERSION` phải khớp meta tag trong `index.html`:
`<meta name="rml-consent-version" content="2026-11-v1" />`.

### 1.2 Tạo bảng + tài khoản chủ

```bash
npm run db:migrate
npm run owner:seed
```

Nếu không đặt `OWNER_PASSWORD`, script sẽ sinh mật khẩu ngẫu nhiên và in ra **một lần**. Chạy lại `npm run owner:seed` sẽ đặt lại mật khẩu.

### 1.3 Kiểm tra

```bash
curl https://robotmathlab.vercel.app/api/health
# {"status":"ok","db":true,"time":"..."}
```

Mở `https://robotmathlab.vercel.app/owner.html` và đăng nhập.

---

## 2. Học sinh đăng nhập như thế nào?

Ở màn hình bắt đầu:

1. Nhập **tên**.
2. Nhập **tuổi** (3–18).
3. Bấm **START**.
4. Nếu chưa từng chọn, hiện hộp thoại **consent**:
   - **Đồng ý & tiếp tục** → tạo hồ sơ + bắt đầu gửi nhật ký.
   - **Không đồng ý** → vẫn học bình thường, không tạo hồ sơ, không gửi dữ liệu.

Không có mật khẩu học sinh. Đây là "đăng nhập nhẹ" phục vụ nghiên cứu, không phải xác thực bảo mật.

---

## 3. Màn hình quản lý

- **Thẻ tổng quan**: số học sinh, số phiên, số phiên đạt đích.
- **Bộ lọc**: tên học sinh, nhiệm vụ, từ ngày, đến ngày.
- **Bảng học sinh**: tên, tuổi, số phiên, số phiên đạt, lần cuối.
  - `Phiên` → lọc bảng phiên theo học sinh đó.
  - `Xoá` → xoá toàn bộ dữ liệu của học sinh (phiên, sự kiện, consent).
- **Bảng phiên học**: thời gian, học sinh, nhiệm vụ, thời lượng, số lần thử, hint, từ điển, kết quả.
  - `Chi tiết` → xem từng sự kiện PS1–PS11 và payload JSON.
- **Xuất CSV**: xuất các phiên theo bộ lọc hiện tại (mở bằng Excel).

---

## 4. Bảo mật & riêng tư

- Chỉ tài khoản chủ tạo bằng `owner:seed` mới đăng nhập được; không có đăng ký công khai.
- Session cookie `HttpOnly`, `SameSite=Strict`, hết hạn sau 8 giờ (đổi bằng `OWNER_SESSION_TTL_HOURS`).
- Mọi thao tác xoá yêu cầu CSRF token.
- Học sinh không có mật khẩu; dữ liệu gắn với `profileToken` lưu trên thiết bị.
- Không lưu email/số điện thoại/IP thô; IP chỉ lưu hash có `IP_HASH_PEPPER`.
- Xoá dữ liệu một học sinh: nút `Xoá` trong bảng học sinh (cascade toàn bộ phiên/sự kiện/consent).
- Trang `/owner.html` có `noindex, nofollow`; không link từ trang học sinh.

---

## 5. Vận hành

- **Dọn dẹp tự động**: Vercel Cron gọi `/api/cron/cleanup` lúc 03:00 mỗi ngày.
  - Xoá `rate_limits` cũ hơn 2 ngày.
  - Xoá owner session hết hạn > 30 ngày.
  - Xoá phiên học cũ hơn `LEARNING_RETENTION_DAYS` (mặc định 730 ngày).
- Nếu đặt `CRON_SECRET` trên Vercel, cron request phải có header `Authorization: Bearer <CRON_SECRET>`.
- Backup: dùng Point-in-Time Restore của Neon; nên tạo branch định kỳ trước khi sửa dữ liệu lớn.
- Gói Vercel Hobby giới hạn **12 Serverless Functions**; project đang dùng đúng 12. Nếu thêm endpoint mới, phải gộp vào function hiện có hoặc nâng gói.

---

## 6. Sự cố thường gặp

| Hiện tượng | Nguyên nhân | Cách xử lý |
|---|---|---|
| `/api/health` trả 503 | Chưa có `DATABASE_URL` hoặc Neon không kết nối được | Kiểm tra env Vercel, chạy lại `npm run db:migrate` |
| Đăng nhập báo sai mật khẩu | Chưa seed hoặc quên mật khẩu | Chạy `OWNER_PASSWORD=... npm run owner:seed` |
| Học sinh bấm Đồng ý nhưng không thấy dữ liệu | API/DB lỗi, hoặc consent version lệch | Xem console trình duyệt, kiểm tra `/api/health` và meta `rml-consent-version` |
| CSV trống | Bộ lọc quá hẹp hoặc chưa có phiên | Xoá lọc rồi xuất lại |
