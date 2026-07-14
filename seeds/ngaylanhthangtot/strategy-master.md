# NGAYLANHTHANGTOT.VN — Chiến lược Keyword Tổng hợp (Bản hợp nhất)

**Sản phẩm:** xem lịch ngày tốt xấu **× lá số bát tự cá nhân hoá** — mọi site lịch âm generic trả lời "ngày này tốt/xấu"; chỉ nltt trả lời **"ngày này hợp VỚI BẠN không"**. Đây là moat, và là lớp phủ lên mọi mặt trận bên dưới.
**Mục tiêu cứng:** 10.000 clicks organic/ngày. **Ràng buộc:** không paid.
**File đi kèm:** `keywords.csv` (440 từ khoá, 14 cụm trang, đã map) · `seo-page-structure-spec.md` (cấu trúc + mật độ mọi page type).
**Hiện trạng (GSC 7 ngày):** ~30 clicks/ngày tăng đều; engine event×tháng rank pos 3,7–8,1; `/lich-am` pos 77.

---

## 1. Toán mục tiêu — vì sao đánh đâu

| Cụm | Vol đo được/tháng | Clicks/ngày @pos3 | @pos5 |
|---|---:|---:|---:|
| Lịch âm head (lịch âm, hôm nay, vạn niên, năm) | ~5.900.000 | ~19.600 | ~11.800 |
| Ngày tốt / hoàng đạo / giờ hoàng đạo | ~90.000 | ~300 | ~180 |
| Event × tháng × tuổi (vol pending) | ~90.000 (ước) | ~300 | ~180 |
| 9 ngách mới (mệnh, xem tuổi, lễ, văn khấn… — vol pending) | ~150.000+ (ước) | ~500 | ~300 |
| **Tổng KHÔNG có lịch âm head** | | **~1.100/ngày** | **~660/ngày** |

→ **10k chỉ đạt khi cụm lịch âm vào top 3–5.** Các ngách mới nâng sàn (~600→1.100/ngày @pos3) + quan trọng hơn: chúng là **cửa funnel vào sản phẩm bát tự trả phí** — thứ cụm lịch âm generic không làm được. Timeline trung thực: 90 ngày ~25% xác suất; **trước Tết 2027 (~5,5 tháng, category spike 2–5×) = 60–75%** — khuyến nghị hợp đồng đặt mốc Tết, mốc 90 ngày làm stretch nội bộ.

## 2. Bốn mặt trận

### Mặt trận A — LỊCH ÂM (head, 80%+ mục tiêu traffic)
Cầu: `lịch âm` 2,74M · `lịch âm hôm nay` 1,5M · `âm lịch hôm nay` 823k · `lịch âm 2026` 301k. Đối thủ #1 (xemlicham.com): ~3.000 từ, bảng dữ liệu dày, **nhưng không FAQ, không JSON-LD, không E-E-A-T** — cửa outrank. Việc: (1) mở van `DAY_RANGES` — bỏ điều kiện prose, rolling 365+ trang ngày (template đã rank pos 2–8 khi được crawl); (2) `/lich-am` = trang "lịch âm hôm nay" trả lời trên fold, rebuild 00:00; (3) trang tháng ×12 + năm 2025/2026/2027; (4) widget đổi lịch (6,6k+/tháng, link magnet nhúng được); (5) internal link từ trang event có equity dồn về.

### Mặt trận B — EVENT × THÁNG × TUỔI (sàn đã chứng minh)
Engine gánh 100% clicks hiện tại. Nhân 3 trục: **sự việc** 7→15 (cắt tóc ~1k gap xác nhận, an táng, sinh con, nhập học, khai bút, đổ bê tông, bốc bát hương, chuyển nhà); **thời gian** phủ trước 3 tháng (GSC: query "tháng 8" xuất hiện từ tháng 7); **tuổi** 4 event lớn × 12 con giáp (48 trang). CTR pass: chuẩn hoá title theo format thắng (nhập trạch CTR 20% vs khai trương 3% cùng khoảng pos).

### Mặt trận C — HOÀNG ĐẠO HÔM NAY (recurring, effort thấp)
`/ngay-hoang-dao-hom-nay` + `/gio-hoang-dao-hom-nay` — GSC đã có impressions "giờ đẹp hôm nay" pos 78–87 mà chưa có trang đúng intent. Compute sẵn trong `canchi.ts`. Nuôi freshness toàn site.

### Mặt trận D — 9 NGÁCH DOMINATE (funnel bát tự — SERP đã verify)

Nguyên tắc chung: mỗi trang ngách kết thúc bằng *"đáp án chung cho tuổi X — nhập ngày sinh để xem đáp án cho riêng lá số bạn"* → widget bát tự → luận giải trả phí. Đối thủ (site tĩnh, công ty xây dựng làm content) không có compute engine để copy.

| # | Ngách | Trục / quy mô | SERP hiện tại | Ưu tiên |
|---|---|---|---|---|
| D1 | **Kim lâu / Hoang ốc / Tam tai** — calculator + năm×tuổi | 3 khái niệm × (gốc + 2027/2028) + calculator nhập năm sinh | Bảng tĩnh + công ty xây dựng; **chưa ai có calculator** | **P0** |
| D2 | **Xem tuổi làm nhà/cưới** năm × năm sinh | 2 việc × 2 năm × 60 năm sinh ≈ **240 trang** | lichvannien365 chạy đúng pattern (mỏng) — trục đã chứng minh rank | **P0** |
| D3 | **Năm sinh → mệnh gì** (ngũ hành nạp âm) | ~80 trang `/menh/{1950–2027}` | Content site cũ, mỏng | **P0** — cửa funnel rẻ nhất; bảng nạp âm trùng việc bổ sung `canchi.ts` |
| D4 | **Lễ/vía âm lịch theo năm** (thần tài, rằm, ông táo…) | ~20 lễ × năm, URL cố định regenerate | Báo chí — trang chết theo năm, mình cộng dồn equity | **P1** — deadline: index trước 12/2026 đón Tết |
| D5 | **Văn khấn theo sự việc** | ~15 bài gắn cứng vào event pages + mùng 1/rằm | Phân mảnh, không ai own | **P1** — engine sinh + human review văn hoá |
| D6 | **Bát tự head** (là gì, lá số, dụng thần, xem ngày theo bát tự) | ~15 trang moat | Gần như trống — own category sớm | **P1** — backbone E-E-A-T + conversion cao nhất |
| D7 | Sao hạn năm × tuổi | ~10 trang/năm | Trung bình | P2 — tone thông tin, tránh mê tín doạ dẫm (rủi ro PR Giáo hội) |
| D8 | Sinh con theo năm | ~5 trang/năm | Trung bình | P2 — **guardrail:** không gợi ý can thiệp y khoa vì phong thuỷ, disclaimer y tế |
| D9 | "Hôm nay có nên…" daily Q&A | ~8 trang trên daily engine | Trống | P2 — PAA/voice, chi phí ~0 |

## 3. Kiến trúc site hợp nhất

```
/lich-am/...             head + 365 trang ngày + tháng + năm     [A]
/doi-lich-am-duong       widget đổi lịch (link magnet)           [A]
/ngay-tot/{event}/...    event×tháng×tuổi (15 event)             [B]
/ngay-hoang-dao-hom-nay  + /gio-hoang-dao-hom-nay (daily)        [C]
/xem-tuoi/...            kim-lâu|hoang-ốc|tam-tai[-{yyyy}], lam-nha-{yyyy}[/nam-sinh-{y}], cuoi-{yyyy}[/...]  [D1,D2]
/menh/{nam-sinh}         80 trang nạp âm                          [D3]
/le-am-lich/{le}-{yyyy}  ~20 lễ × năm                             [D4]
/van-khan/{su-viec}      gắn vào event pages                      [D5]
/bat-tu/                 moat + /phuong-phap (E-E-A-T)            [D6]
/sao-han/{yyyy}          [D7]   /sinh-con/{yyyy} [D8]   /hom-nay/{viec} [D9]
```
Mesh: mọi trang → widget bát tự; `/menh` + `/xem-tuoi` là 2 cửa funnel chính; event pages ↔ văn khấn ↔ trang ngày ↔ `/lich-am`.

## 4. Kênh organic phụ trợ

- **Google Discover:** daily-refresh + ảnh ≥1200px + `max-image-preview:large` — upside nghìn/ngày, chi phí ~0, không đưa vào cam kết.
- **Off-page không mua link:** widget đổi lịch + calculator kim lâu nhúng được (link magnet); cross-link in-content hệ sinh thái (sochumenh, luangiai); push app + social organic sản xuất branded search; 1 đợt PR data-angle trước Tết. **Không mua link** — domain mới + spike link bẩn = filter.
- **Indexing:** GSC resubmit + IndexNow (`seo-index.yml` sẵn có) nối cron rebuild hằng ngày; index-coverage % gate batch kế.

## 5. Lộ trình & gate

| Tuần | Ship | Gate |
|---|---|---|
| 1–2 | Mở van 365 trang ngày; `/lich-am` mới; CTR pass event; 2 trang hoàng đạo; **calculator kim lâu/hoang ốc/tam tai + 80 trang `/menh`** (D1, D3) | Index sạch; impressions >3k/ngày |
| 3–4 | 15 event × 3 tháng; widget đổi lịch; trang tháng/năm; **240 trang xem-tuổi 2027–2028 (D2); văn khấn 7 event (D5)** | `/lich-am` pos <20; impressions >8k/ngày; clicks >300/ngày |
| 5–8 | 48 trang tuổi; Discover-ready; PR đợt 1; **cụm bát tự (D6); lễ/vía + sao hạn 2027 index sớm (D4, D7)** | **GATE SINH TỬ tuần 8: `/lich-am` pos <10.** Đạt → giữ kịch bản 90 ngày. Trượt → báo ngay bên nhận cam kết, chuyển chính thức mốc trước Tết |
| 9–12 | Dồn lực theo GSC weekly; làm dày trang thắng; D8, D9 | Thắng head: 8–12k/ngày. Thường: 2–4k/ngày + đà rõ hướng Tết |
| **Cứng 12/2026** | Toàn bộ `/le-am-lich/*-2027`, `/sao-han/2027`, xông đất index xong | Đón spike Tết (vía thần tài = sóng lớn nhất năm) |

**Nhịp:** GSC review hằng tuần (query mới = cầu thật → build trang match); regenerate event×tháng + daily pages theo chu kỳ; báo cáo 1 số: clicks/ngày (7-day avg) + vị trí `/lich-am`.

## 6. Rủi ro & đối sách

1. **Head không nhúc nhích tuần 8** → gate ép trung thực sớm, chuyển mốc Tết — không im lặng thêm 4 tuần.
2. **Google OneBox ăn intent "hôm nay ngày mấy âm"** → nhắm intent cần trang (giờ hoàng đạo, nên/kỵ, xem tuổi, calculator) — OneBox không trả lời được.
3. **Media lớn (vietnamnet, vtcnews) giữ SERP bằng authority** → không đấu authority; đấu utility + cá nhân hoá + freshness thật hằng ngày — thứ trang chuyên mục báo không làm.
4. **Volume ngách chưa đo** (DataForSEO pause) → thứ tự P0/P1/P2 đứng trên product-fit + SERP verify; volume chỉ tinh chỉnh trong nhóm. Mở khoá xong điền vào mọi dòng `pattern/pending-volume` trong `keywords.csv`.
5. **Nội dung nhạy cảm** → sinh con: disclaimer y tế, không gợi ý can thiệp y khoa; sao hạn: tone văn hoá-thông tin, không doạ dẫm thương mại.
