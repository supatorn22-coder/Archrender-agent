# Khangkan Render Agent v2

เครื่องมือ sketch-to-render + diagram + model + edit สำหรับงานสถาปัตย์และแลนด์สเคป
ขับเคลื่อนด้วย Google Gemini (Nano Banana) ผ่าน Vercel serverless proxy

## โครงสร้างไฟล์ (เหมือนเดิม)
```
📁 api
   └── generate.js     ← serverless proxy (ซ่อน API key ฝั่ง server)
📄 index.html          ← หน้าเว็บ (4 หมวด + preset library)
📄 README.md
```
> ไม่มี `vercel.json` — Vercel หา `api/` เองอัตโนมัติ

## สิ่งที่เพิ่มใน v2
4 หมวดงาน เรียงตามความสำคัญ:
- 🪵 **Model** — wooden / acrylic / 3D-print axonometric / figurine / white massing
- 🔍 **Diagram** — explosion / planting analysis / courtyard analysis / bird's-eye / axon / section / elevation
- 🗺 **Plan** — CAD→bird's eye / plan→3D cutaway / ลงสีแปลนภายใน / ลงสีผังรวม
- ✨ **Render/Edit** — photoreal / illustration / เปลี่ยนวัสดุ / แสง / ฤดูกาล / มุมมอง / รีโนเวท

แต่ละ preset = prompt สำเร็จรูป กดปุ่มเลือกได้หลายอันพร้อมกัน → กด "สร้างภาพ" ทีเดียวได้ทั้งชุด

## Deploy

### ตั้ง API Key (ทำครั้งเดียว)
Vercel → Project → Settings → Environment Variables
- Name: `GEMINI_API_KEY`
- Value: `AIza...` (จาก aistudio.google.com/apikey)

แล้ว Deployments → ⋯ → Redeploy

### อัปไฟล์ขึ้น GitHub (ทำได้บน iPhone — ทีละไฟล์)
1. แก้ไฟล์ `index.html` — Add file → upload หรือ แก้ในเว็บ commit ทับ
2. แก้ไฟล์ `api/generate.js` — เข้าโฟลเดอร์ api → แก้ commit ทับ
   (ถ้ายังไม่มีโฟลเดอร์ api: Add file → Create new file → พิมพ์ `api/generate.js` ในช่องชื่อ จะสร้างโฟลเดอร์ให้เอง)
3. Commit → Vercel auto-redeploy

env var `GEMINI_API_KEY` ที่ตั้งไว้แล้วยังอยู่ ไม่ต้องตั้งใหม่

## หมายเหตุ
- model: `gemini-3-pro-image` → fallback `3.1-flash-image` → `2.5-flash-image` อัตโนมัติฝั่ง server
- ต้องเปิด billing / image generation access ใน Google AI Studio
- ภาพ sketch/plan + reference แนบได้หลายภาพ
