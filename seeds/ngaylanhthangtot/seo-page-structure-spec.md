# Spec Cấu trúc SEO Page + Mật độ Keyword — ngaylanhthangtot.vn

**Mục đích:** chuẩn bắt buộc cho mọi page type để outrank đối thủ. Benchmark từ phân tích trực tiếp #1 SERP "lịch âm hôm nay" (xemlicham.com) + GSC của chính site.

---

## 0. Benchmark đối thủ #1 và cửa outrank

Trang #1 (xemlicham.com) đang thắng bằng: ~2.800–3.200 từ; H1 exact "Lịch âm hôm nay"; ~40+ lần lặp cụm lịch âm/âm lịch/hôm nay; bảng dữ liệu dày (can chi, giờ hoàng đạo, ngũ hành, nhị thập bát tú, thập nhị kiến trừ, hướng xuất hành); lịch tháng màu-mã hoá; internal link anchor keyword-hoá.

**Điểm họ KHÔNG có = cửa của mình:** không FAQ + FAQPage schema · không JSON-LD (chỉ OG tags) · không E-E-A-T (không author/nguồn/phương pháp) · không rõ tốc độ tối ưu. **Nguyên tắc outrank: bằng họ về độ sâu dữ liệu, hơn họ ở schema + FAQ + tốc độ + freshness thật + tool tương tác.** Không outrank bằng nhồi chữ.

**Gap dữ liệu phải đóng:** `canchi.ts` hiện có can chi, trực (= thập nhị kiến trừ), sao hoàng/hắc đạo, tiết khí, giờ hoàng đạo, tuổi xung, nên/kỵ. Đối thủ hiển thị thêm **ngũ hành nạp âm, nhị thập bát tú, hướng xuất hành (tài thần/hỷ thần)** — cần bổ sung 3 phép tính này vào core để bảng ngày không thua độ sâu.

## 1. Quy tắc mật độ keyword (áp dụng mọi page)

Google xếp hạng bằng semantic relevance, không đếm %; "mật độ" ở đây là khoảng an toàn vận hành để đủ tín hiệu mà không bị coi là stuffing:

| Quy tắc | Mức |
|---|---|
| **Primary keyword (exact)** | 0,8–1,5% từ body (~1 lần mỗi 80–120 từ). **Trần cứng 2%** — vượt là sửa |
| **Vị trí bắt buộc primary** | Title (đầu) · H1 · 100 từ đầu · ≥1 H2 · đoạn kết · URL slug · meta description · alt ảnh chính |
| **Bộ đồng nghĩa (bắt buộc dùng xen kẽ)** | lịch âm ↔ âm lịch ↔ lịch vạn niên · ngày tốt ↔ ngày đẹp ↔ ngày lành ↔ ngày hoàng đạo · xem ngày ↔ chọn ngày ↔ coi ngày — mỗi biến thể xuất hiện ≥2 lần, tổng cụm đồng nghĩa 2,5–4% |
| **Entity bắt buộc (semantic coverage)** | can chi, trực/thập nhị kiến trừ, sao hoàng đạo/hắc đạo, tiết khí, giờ hoàng đạo, tuổi xung, ngũ hành, âm lịch/dương lịch — mỗi entity ≥1 lần trên mọi trang ngày/event |
| **Chỉ dùng dạng có dấu** trong title/H1/URL-nghĩa | biến thể không dấu chỉ xuất hiện tự nhiên trong body nếu hợp văn cảnh, không tối ưu riêng |
| **Anti-stuffing** | không lặp exact primary 2 lần trong 1 câu; không danh sách anchor toàn exact-match; H2 không quá 60% chứa primary |

## 2. Spec theo từng page type

### 2.1 `/lich-am` — Trang tiền "Lịch âm hôm nay" (primary: `lịch âm hôm nay`)

- **Title:** `Lịch âm hôm nay {dd/mm} — Âm lịch, Can Chi, Giờ Hoàng Đạo | Ngày Lành Tháng Tốt` (≤65 ký tự phần chính)
- **H1:** `Lịch âm hôm nay — {Thứ}, ngày {dd/mm/yyyy}`
- **Fold đầu (không scroll):** ngày dương = ngày âm (tháng đủ/thiếu) · can chi ngày-tháng-năm · trực · sao (hoàng/hắc đạo) · tiết khí · 6 giờ hoàng đạo · tuổi xung · verdict nên/kỵ. Đây là "câu trả lời" — mọi thứ khác đứng sau.
- **Khung H2 (theo thứ tự):** `Âm lịch hôm nay ngày {d} tháng {m}` → `Giờ hoàng đạo hôm nay` → `Hôm nay tốt cho việc gì?` (event scores + link event pages) → `Lịch âm tháng {m}/{yyyy}` (grid màu, link 30 trang ngày) → `Đổi ngày dương sang âm` (widget) → `Câu hỏi thường gặp` → `Về phương pháp tính` (E-E-A-T, link /phuong-phap)
- **Độ dài:** 1.800–2.500 từ text ngoài bảng (đối thủ 3k nhưng loãng; mình bù bằng data + tool). **FAQ ≥5 câu**: "Hôm nay là ngày bao nhiêu âm lịch?", "Hôm nay có phải ngày hoàng đạo?", "Giờ nào đẹp hôm nay?", "Hôm nay tốt cho việc gì?", "Ngày mai âm lịch là ngày mấy?"
- **Mật độ:** `lịch âm hôm nay` + `âm lịch hôm nay` tổng 12–18 lần; `lịch âm` mọi dạng 30–45 lần toàn trang (ngang đối thủ ~40) — đạt tự nhiên qua label bảng/lịch tháng, không nhồi vào prose.
- **Schema:** WebPage + BreadcrumbList + **FAQPage** + Organization/WebSite (đối thủ không có — điểm ăn). `dateModified` thật mỗi ngày.
- **Kỹ thuật:** rebuild 00:00 VN + prerender ngày mai; LCP <1s mobile; 1 island JS duy nhất (widget); ảnh hero ≥1200px + `max-image-preview:large` (Discover).

### 2.2 `/lich-am/ngay-{dd}-{mm}-{yyyy}/` — 365+ trang ngày (primary: `âm lịch {dd/mm}` / `ngày {dd/mm/yyyy} tốt hay xấu`)

- **Title (A/B theo ngày chẵn/lẻ — giữ cơ chế split có sẵn):** A: `Ngày {dd/mm/yyyy} tốt hay xấu? Âm lịch {d/m}, giờ hoàng đạo` · B: `Âm lịch ngày {dd/mm/yyyy} — Can chi, giờ hoàng đạo, việc nên làm`
- **H1:** `Ngày {dd/mm/yyyy} tốt hay xấu? Xem ngày {Can} {Chi}, âm lịch {d}/{m}`
- **Body 600–900 từ + bảng:** đủ 8 entity bắt buộc; H2: `Thông tin ngày` / `Giờ hoàng đạo` / `Ngày này tốt cho việc gì` (scores 15 event + link) / `Tuổi xung` / FAQ 3 câu. Primary 5–8 lần.
- **Link:** prev/next day · tháng cha · 3–5 event page liên quan · `/lich-am`. **Không trang mồ côi.**
- **Schema:** Article + Breadcrumb + FAQPage. Trang có prose engine giữ nguyên drift-throw; trang chưa prose vẫn phát hành bằng data (đã là nội dung thật).

### 2.3 `/lich-am/thang-{mm}-{yyyy}/` (primary: `lịch âm tháng {m}`)

Title: `Lịch âm tháng {m}/{yyyy} — Ngày tốt, ngày hoàng đạo tháng {m}`. Grid lịch màu-mã hoá (chuẩn đối thủ) + H2 `Ngày tốt tháng {m} theo từng việc` (bảng event × ngày đẹp nhất, link event pages) + summary "{N} ngày hoàng đạo trong tháng". 800–1.200 từ. Primary 6–10 lần. Link đủ 28–31 trang ngày + tháng trước/sau + `/lich-am`.

### 2.4 `/lich-am/nam-{yyyy}/` (primary: `lịch âm {yyyy}` — 301k/tháng riêng 2026)

12 block tháng + các mốc năm (Tết, rằm lớn, tiết khí) + H2 mỗi quý. 1.200–1.800 từ. Link 12 trang tháng.

### 2.5 `/ngay-tot/{event}/thang-{mm}-{yyyy}/` — engine đang thắng (primary: `ngày tốt {event} tháng {m} năm {yyyy}`)

- **Title chuẩn hoá theo format CTR thắng (nhập trạch 20%, ký HĐ 14%):** `{N} ngày tốt {event} tháng {m}/{yyyy}: ngày đẹp nhất là {dd/mm}` — số cụ thể + năm + lời hứa rõ.
- **H1:** `Ngày tốt {event} tháng {m}/{yyyy}` · 100 từ đầu chứa primary + số ngày đẹp tìm được.
- **Body 900–1.400 từ:** bảng ngày đẹp (điểm, giờ hoàng đạo từng ngày, **mỗi ngày link trang ngày tương ứng** — mesh về lịch âm) · H2 `Vì sao chọn những ngày này` (trực/sao theo event — prose engine) · H2 `Ngày cần tránh` · H2 theo tuổi (link trang tuổi) · FAQ 3–4 câu (`{event} tháng {m} ngày nào đẹp nhất?`, `Mùng {x} có tốt không?` — GSC cho thấy query dạng này). Primary 6–10 lần; đồng nghĩa ngày tốt/đẹp/lành xen kẽ.
- **Link:** tháng trước/sau cùng event · hub event · 3 event khác · trang ngày. Schema: Article + Breadcrumb + FAQPage.

### 2.6 `/ngay-tot/{event}/` — hub sự việc (primary: `xem ngày {event}` / `ngày tốt {event}`)

Evergreen 1.200–1.800 từ: nguyên tắc chọn ngày cho event (trực nào hợp/kỵ — có sẵn trong TRUC_NEN_KY) · tháng hiện tại + 2 tháng tới (link) · theo tuổi (link 12 trang) · FAQ 5 câu. Primary 8–12 lần.

### 2.7 `/ngay-tot/{event}/tuoi-{giap}/` — 48 trang tuổi (primary: `xem ngày {event} tuổi {giáp}`)

700–1.000 từ: ngày đẹp cho tuổi trong 3 tháng tới (lọc tuổi xung — compute sẵn) · năm sinh ứng tuổi · tam hợp/tứ hành xung · FAQ 3 câu. Primary 5–7 lần. Link hub event + tháng + tuổi tam hợp.

### 2.8 `/ngay-hoang-dao-hom-nay/` & `/gio-hoang-dao-hom-nay/` (primary tương ứng)

500–800 từ + bảng, rebuild hằng ngày. Fold đầu = câu trả lời (hôm nay hoàng đạo/hắc đạo, sao, trực · 6 khung giờ + ý nghĩa). FAQ 3 câu. Primary 5–8 lần. Link chéo nhau + `/lich-am` + event pages. GSC đã có impressions "giờ đẹp hôm nay" pos 78–87 — trang này ăn ngay phần đó.

---

## 2B. Page type NGÁCH (mặt trận D — lớp bát tự cá nhân hoá)

**Quy tắc chung cho MỌI trang ngách:** kết thúc bằng block cá nhân hoá — *"Đây là đáp án chung cho tuổi/năm sinh X. Nhập giờ-ngày-tháng-năm sinh để xem đáp án đúng cho riêng lá số bát tự của bạn"* + widget → sản phẩm luận giải. Block này là differentiator, không phải quảng cáo — đặt sau khi đã trả lời đầy đủ câu hỏi generic.

### 2.9 `/xem-tuoi/kim-lau|hoang-oc|tam-tai/` + biến thể `-{yyyy}` (primary: `kim lâu là gì` / `tuổi tam tai {yyyy}`)

- **Trang gốc (evergreen):** khái niệm + **calculator nhập năm sinh → verdict tức thì** (client island, giống widget đổi lịch) + bảng tra đầy đủ + cách hoá giải + FAQ 5 câu. 1.200–1.800 từ. Primary 8–12 lần.
- **Trang năm (`/xem-tuoi/tam-tai-2027`):** bảng tuổi phạm trong năm + giải thích + link trang gốc + calculator. 800–1.200 từ. Title: `Tam tai 2027: tuổi nào phạm, cách tính và hoá giải`.
- Schema: Article + FAQPage. Đối thủ toàn bảng tĩnh — calculator là điểm outrank chính, không phải độ dài chữ.

### 2.10 `/xem-tuoi/lam-nha-{yyyy}/` + `/nam-sinh-{y}/` (primary: `xem tuổi làm nhà {yyyy}` / `sinh năm {y} làm nhà năm {yyyy} được không`)

- **Trang năm:** bảng tổng 60 năm sinh × verdict 3 phép tính (kim lâu/hoang ốc/tam tai) + top tuổi đẹp + link 60 trang con. 1.200–1.600 từ.
- **Trang năm-sinh (240 trang programmatic):** title `Sinh năm {y} làm nhà năm {yyyy} được không? Xem kim lâu, hoang ốc, tam tai` — H1 đúng câu hỏi; fold đầu = verdict thẳng (Được/Không + lý do 3 phép tính); tháng/ngày đẹp cụ thể trong năm (nối engine event×tháng); tuổi mượn nếu phạm; FAQ 3 câu; block bát tự. 600–900 từ. Primary 5–7 lần.
- Cưới (`/xem-tuoi/cuoi-{yyyy}/...`) cùng cấu trúc, thêm kim lâu nữ giới + đại lợi/tiểu lợi tháng.

### 2.11 `/menh/{nam-sinh}/` — 80 trang nạp âm (primary: `sinh năm {y} mệnh gì`)

Title: `Sinh năm {y} mệnh gì? {Nạp âm} — hợp màu, hướng, tuổi nào`. Fold đầu = đáp án thẳng (mệnh + nạp âm + can chi năm). H2: ý nghĩa nạp âm · hợp/khắc mệnh nào · màu/hướng/số hợp · tuổi hợp làm ăn/hôn nhân · sinh con năm nào hợp (link D8) · FAQ 4 câu · block bát tự ("mệnh năm sinh chỉ là 1/8 lá số — xem đủ tứ trụ"). 700–1.000 từ. Primary 5–8 lần, đồng nghĩa `mệnh` ↔ `ngũ hành` ↔ `nạp âm`. Link: 2 năm sinh liền kề, tuổi tam hợp, `/xem-tuoi/`, `/bat-tu/`.

### 2.12 `/le-am-lich/{le}-{yyyy}/` (primary: `{lễ} {yyyy} là ngày nào`)

Title: `{Lễ} {yyyy} là ngày nào dương lịch? Giờ đẹp, văn khấn, mâm cúng`. Fold đầu = ngày dương + âm + đếm ngược. H2: giờ hoàng đạo ngày lễ (compute) · nên làm gì · văn khấn (link D5) · nguồn gốc ý nghĩa · FAQ 3 câu. 800–1.200 từ. **URL cố định theo năm, regenerate hằng năm — không tạo URL mới** (equity cộng dồn, khác báo chí). Schema: Article + FAQPage + Event khi hợp lệ. Index trước 12/2026 với mọi trang 2027.

### 2.13 `/van-khan/{su-viec}/` (primary: `văn khấn {sự việc}`)

Title: `Văn khấn {sự việc} chuẩn nhất — bài cúng đầy đủ kèm mâm lễ`. Cấu trúc: dẫn ngắn → **bài khấn full-text trong block dễ đọc + nút copy/in** → checklist mâm lễ → trình tự cúng → chọn ngày đẹp để cúng (link engine ngày — điểm khác biệt vs mọi đối thủ văn khấn) → FAQ 3 câu. 900–1.400 từ. Primary 6–10 lần, đồng nghĩa `văn khấn` ↔ `bài cúng` ↔ `văn cúng`. **Human review bắt buộc** (nội dung văn hoá — engine sinh, người duyệt). Gắn link 2 chiều với event page tương ứng.

### 2.14 `/bat-tu/` cluster (primary: `bát tự là gì` / `lá số bát tự` / `xem ngày theo bát tự`)

Hub 1.500–2.500 từ chuẩn E-E-A-T cao nhất site: bát tự/tứ trụ là gì, lá số lập thế nào, dụng thần, giới hạn của phương pháp (trung thực = trust). `/bat-tu/phuong-phap` là trang **mọi trang khác trỏ về** khi claim cá nhân hoá. `/bat-tu/xem-ngay`: own category "xem ngày theo bát tự" — giải thích vì sao ngày tốt chung ≠ ngày hợp riêng + demo widget. Schema: Article + FAQPage; author/organization rõ.

### 2.15 `/sao-han/{yyyy}/` + `/sinh-con/{yyyy}/` (P2)

Cùng khung trang-năm như 2.12: đáp án thẳng trên fold, bảng theo tuổi/giới, FAQ, block bát tự. **Guardrail bắt buộc:** sao hạn — tone văn hoá-thông tin, không doạ dẫm, không bán "giải hạn"; sinh con — disclaimer y tế nổi bật, tuyệt đối không gợi ý chọn giờ mổ đẻ vì phong thuỷ.

### 2.16 `/hom-nay/{viec}/` — daily Q&A (primary: `hôm nay có nên {việc} không`)

300–500 từ, rebuild hằng ngày cùng cron. H1 = đúng câu hỏi; fold đầu = Có/Không + lý do (trực, sao, giờ đẹp); bảng 7 ngày tới; FAQ 2 câu; block "theo tuổi bạn thì sao?" → nhập tuổi. Schema: FAQPage/QAPage. Nhắm PAA + voice search.

## 3. Chuẩn chung mọi trang (checklist ship)

- [ ] Title ≤60–65 ký tự, primary đứng đầu, có năm khi hợp lý; meta desc 140–160 ký tự chứa primary + CTA
- [ ] 1 H1 duy nhất chứa primary; H2 3–7 cái, ≤60% chứa primary
- [ ] Primary trong 100 từ đầu; mật độ theo bảng §1; đủ 8 entity
- [ ] Canonical non-www, đúng trailing slash; sitemap cập nhật; GSC + IndexNow ping khi sitemap đổi
- [ ] JSON-LD đúng loại trang + FAQPage khi có FAQ; `dateModified` thật
- [ ] ≥5 internal link ra, ≥1 link vào từ trang có equity; anchor mô tả, không toàn exact
- [ ] LCP <1s mobile; ảnh OG/hero ≥1200px + `max-image-preview:large`
- [ ] Unicode NFC, 100% dạng có dấu ở title/H1
- [ ] Trang daily: cron rebuild 00:00 + prerender ngày mai

**Nguồn benchmark SERP:** [xemlicham.com](https://www.xemlicham.com/) (phân tích trực tiếp), [lichngaytot.com](https://lichngaytot.com/lich-am-duong.html), [vietnamnet lịch vạn niên](https://vietnamnet.vn/lich-van-nien).
