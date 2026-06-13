# Khangkan Render Agent — Vercel Deploy

ระบบ sketch-to-render สำหรับงานสถาปัตย์/แลนด์สเคป/อินทีเรีย
ใส่ API key **ครั้งเดียว** ใน Vercel แล้วใช้งานได้เลย ไม่ต้องใส่ซ้ำทุกครั้ง

---

## โครงสร้างไฟล์
```
/
├── index.html          ← หน้าเว็บ (frontend)
├── api/
│   └── generate.js     ← serverless function (ซ่อน API key + เรียก Gemini)
└── vercel.json         ← config
```

---

## วิธี Deploy (3 ขั้นตอน)

### 1. อัพโหลดไฟล์ขึ้น Vercel
- ลากโฟลเดอร์ทั้งหมด (index.html + api/ + vercel.json) เข้า Vercel
- หรือ push ขึ้น GitHub แล้วเชื่อมกับ Vercel

### 2. ตั้งค่า API Key (ทำครั้งเดียว!)
ไปที่ **Vercel Dashboard → โปรเจกต์ → Settings → Environment Variables**

| Name | Value |
|------|-------|
| `GEMINI_API_KEY` | `AIza...` (key จาก aistudio.google.com) |

กด **Save**

### 3. Redeploy
ไปที่แท็บ **Deployments → ⋯ → Redeploy**
(จำเป็น เพื่อให้ env var มีผล)

---

## เสร็จแล้ว!
เปิดเว็บ → อัพโหลด sketch + mood → เขียน brief → กด Generate
**ไม่ต้องใส่ API key ในหน้าเว็บอีกเลย** ✅

---

## หมายเหตุ
- API key เก็บอยู่ฝั่ง server เท่านั้น ปลอดภัย ไม่หลุดในหน้าเว็บ
- Model ที่ใช้: `gemini-3.1-flash-image` (Nano Banana 2) → fallback อัตโนมัติ
- ต้องเปิด billing/image generation access ที่ aistudio.google.com
- ถ้า Generate แล้วขึ้น "GEMINI_API_KEY not set" = ยังไม่ได้ตั้ง env var หรือยังไม่ได้ redeploy
