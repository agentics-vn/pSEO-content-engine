/**
 * Canonical number facts — the factual layer of the numerology content engine.
 *
 * This is the source of truth the LLM writes *on top of*, and the reference the
 * validation gates check prose against (a page for số 7 may not claim traits
 * that live only under số 5). Ported from `landingPageData.LANDING_NUMBERS` and
 * extended with: (a) position-aware framing — the same digit reads differently
 * as a Life-Path (hành trình) vs a Destiny/Expression (tài năng) number; and
 * (b) `essence`, a richer descriptive paragraph reused across every combo page
 * so per-number sections read as genuine prose, not one-line auto-fill.
 */

import type { CoreNumber } from './core';

export interface NumberFacts {
  n: CoreNumber;
  archetype: string;
  keyword: string;
  master?: boolean;
  strengths: string[];
  challenges: string[];
  /** Đoạn mô tả cốt lõi 2–3 câu — bản chất con số, dùng cho mọi trang combo. */
  essence: string;
  /** Framing khi số đứng ở vị trí Số chủ đạo (đường đời, bài học). */
  lifePathFraming: string;
  /** Framing khi số đứng ở vị trí Số sứ mệnh (tài năng, cách biểu đạt). */
  destinyFraming: string;
}

export const NUMBER_FACTS: Record<number, NumberFacts> = {
  1: {
    n: 1, archetype: 'Nhà lãnh đạo', keyword: 'Khởi đầu & độc lập',
    strengths: ['Quyết đoán', 'Tiên phong', 'Tự tin'],
    challenges: ['Ôm việc một mình', 'Cứng nhắc', 'Thiếu kiên nhẫn'],
    essence:
      'Số 1 là năng lượng khởi phát — ý chí bắt đầu, tự quyết và đứng trên đôi chân mình. Người mang số 1 có bản năng mở đường, không thích đi theo lối mòn và luôn muốn để lại dấu ấn riêng.',
    lifePathFraming: 'hành trình học cách tự lập, mở đường và tin vào quyết định của chính mình',
    destinyFraming: 'tài năng khởi xướng, dẫn dắt và biến ý tưởng thành hành động đầu tiên',
  },
  2: {
    n: 2, archetype: 'Người kết nối', keyword: 'Hoà hợp & đồng cảm',
    strengths: ['Tinh tế', 'Hợp tác', 'Thấu cảm'],
    challenges: ['Ngại nêu nhu cầu', 'Nhạy cảm thái quá', 'Phụ thuộc'],
    essence:
      'Số 2 là năng lượng của sự kết nối — kiên nhẫn, ngoại giao và một trái tim biết lắng nghe. Người mang số 2 cảm nhận tinh tế nhịp cảm xúc của người khác và giỏi hoà giải, gắn kết.',
    lifePathFraming: 'hành trình học cách hoà giải, xây dựng quan hệ và trân trọng giá trị bản thân',
    destinyFraming: 'tài năng ngoại giao, lắng nghe và gắn kết mọi người lại với nhau',
  },
  3: {
    n: 3, archetype: 'Người sáng tạo', keyword: 'Biểu đạt & cảm hứng',
    strengths: ['Sáng tạo', 'Giao tiếp', 'Lạc quan'],
    challenges: ['Thiếu kỷ luật', 'Phân tán', 'Ngại chiều sâu'],
    essence:
      'Số 3 là năng lượng biểu đạt — sáng tạo, lạc quan và giàu sức truyền cảm. Người mang số 3 chạm tới người khác qua ngôn từ, hình ảnh và cảm xúc, thắp sáng bầu không khí quanh mình.',
    lifePathFraming: 'hành trình học cách biến cảm hứng thành thành quả cụ thể và giữ kỷ luật',
    destinyFraming: 'tài năng biểu đạt, truyền cảm hứng và chạm tới người khác qua ngôn từ, hình ảnh, cảm xúc',
  },
  4: {
    n: 4, archetype: 'Người xây dựng', keyword: 'Nền tảng & bền bỉ',
    strengths: ['Kỷ luật', 'Đáng tin', 'Kiên trì'],
    challenges: ['Cứng nhắc', 'Ngại thay đổi', 'Quá cầu toàn'],
    essence:
      'Số 4 là năng lượng nền tảng — thực tế, chỉn chu và bền bỉ. Người mang số 4 tạo ra sự ổn định, biến kế hoạch thành cấu trúc vững chắc và là chỗ dựa đáng tin cậy.',
    lifePathFraming: 'hành trình học cách tạo nền tảng vững chắc trong khi vẫn giữ được sự linh hoạt',
    destinyFraming: 'tài năng tổ chức, xây dựng hệ thống và biến kế hoạch thành cấu trúc bền vững',
  },
  5: {
    n: 5, archetype: 'Người tự do', keyword: 'Trải nghiệm & thay đổi',
    strengths: ['Linh hoạt', 'Năng động', 'Ham học hỏi'],
    challenges: ['Phân tán', 'Bốc đồng', 'Ngại cam kết'],
    essence:
      'Số 5 là năng lượng của tự do — tò mò, năng động và không sợ đổi thay. Người mang số 5 cần không gian để trải nghiệm và lan toả tinh thần phiêu lưu tới mọi người.',
    lifePathFraming: 'hành trình học cách tìm tự do bên trong kỷ luật thay vì chạy theo đổi thay liên tục',
    destinyFraming: 'tài năng thích nghi, kết nối trải nghiệm và truyền tinh thần tự do, phiêu lưu',
  },
  6: {
    n: 6, archetype: 'Người chăm sóc', keyword: 'Trách nhiệm & yêu thương',
    strengths: ['Tận tâm', 'Ấm áp', 'Bao dung'],
    challenges: ['Ôm đồm', 'Hy sinh quá mức', 'Kiểm soát'],
    essence:
      'Số 6 là năng lượng nuôi dưỡng — trách nhiệm, ấm áp và bao dung. Người mang số 6 tạo cảm giác an toàn cho gia đình và cộng đồng, luôn muốn chăm sóc và gắn kết mọi người.',
    lifePathFraming: 'hành trình học cách chăm sóc người khác mà không đánh mất bản thân',
    destinyFraming: 'tài năng nuôi dưỡng, gắn kết cộng đồng và tạo cảm giác an toàn cho mọi người',
  },
  7: {
    n: 7, archetype: 'Nhà tư duy', keyword: 'Trí tuệ & chiều sâu',
    strengths: ['Trực giác', 'Phân tích', 'Sâu sắc'],
    challenges: ['Khép kín', 'Hoài nghi', 'Xa cách cảm xúc'],
    essence:
      'Số 7 là năng lượng của chiều sâu — trực giác, trí tuệ và nhu cầu thấu hiểu thế giới bên trong. Người mang số 7 luôn đi tìm ý nghĩa và sự thật phía sau bề mặt, cần sự tĩnh lặng để chiêm nghiệm và dễ trở thành người quan sát sắc bén mà ít ai đọc thấu.',
    lifePathFraming: 'hành trình đi tìm ý nghĩa và sự thật phía sau mọi điều, học cách mở lòng chia sẻ trí tuệ bên trong',
    destinyFraming: 'tài năng phân tích, trực giác và soi thấu chiều sâu mà người khác bỏ lỡ',
  },
  8: {
    n: 8, archetype: 'Người kiến tạo', keyword: 'Thành tựu & ảnh hưởng',
    strengths: ['Tham vọng', 'Bản lĩnh', 'Tổ chức'],
    challenges: ['Đề cao vật chất', 'Ôm áp lực', 'Cứng rắn'],
    essence:
      'Số 8 là năng lượng quyền lực — tham vọng, thực tế và giỏi tạo ra giá trị vật chất. Người mang số 8 dùng bản lĩnh và khả năng tổ chức để tạo thành tựu và ảnh hưởng lên môi trường quanh mình.',
    lifePathFraming: 'hành trình học cách cân bằng thành tựu bên ngoài với đời sống nội tâm',
    destinyFraming: 'tài năng lãnh đạo, tạo ra giá trị vật chất và sử dụng ảnh hưởng để tạo dấu ấn',
  },
  9: {
    n: 9, archetype: 'Người nhân ái', keyword: 'Bao dung & cống hiến',
    strengths: ['Vị tha', 'Lý tưởng', 'Cảm thông'],
    challenges: ['Khó buông bỏ', 'Ôm nỗi buồn của người khác', 'Thiếu ranh giới'],
    essence:
      'Số 9 là năng lượng của lòng nhân ái — vị tha, lý tưởng và hướng tới điều lớn lao hơn bản thân. Người mang số 9 sống chính trực, giàu cảm thông và truyền cảm hứng cho người khác bằng tấm lòng rộng mở.',
    lifePathFraming: 'hành trình học cách cho đi, buông bỏ và đặt ranh giới lành mạnh',
    destinyFraming: 'tài năng truyền cảm hứng, sống chính trực và hướng tới điều lớn lao hơn bản thân',
  },
  11: {
    n: 11, archetype: 'Trực giác bậc thầy', keyword: 'Số bậc thầy', master: true,
    strengths: ['Trực giác mạnh', 'Truyền cảm hứng', 'Nhạy cảm'],
    challenges: ['Áp lực nội tâm', 'Bất ổn cảm xúc', 'Tự nghi ngờ'],
    essence:
      'Số 11 là số bậc thầy của trực giác — nhạy bén, truyền cảm hứng và soi thấu điều người khác chưa nhìn ra. Cùng món quà đó là áp lực nội tâm lớn, đòi hỏi người mang số 11 học cách cân bằng cảm xúc.',
    lifePathFraming: 'hành trình học cách giữ vững quyết đoán và cân bằng cảm xúc trước năng lượng trực giác mạnh mẽ',
    destinyFraming: 'tài năng truyền cảm hứng và soi sáng những điều người khác chưa nhìn thấy',
  },
  22: {
    n: 22, archetype: 'Kiến tạo bậc thầy', keyword: 'Số bậc thầy', master: true,
    strengths: ['Tầm nhìn lớn', 'Thực thi', 'Lãnh đạo'],
    challenges: ['Quá tải', 'Áp lực kỳ vọng', 'Ôm mục tiêu quá lớn'],
    essence:
      'Số 22 là "kiến trúc sư bậc thầy" — biến những ý tưởng lớn thành hiện thực có hệ thống ở quy mô lớn. Người mang số 22 kết hợp tầm nhìn của người mơ mộng với khả năng thực thi thực tế.',
    lifePathFraming: 'hành trình học cách chia tầm nhìn lớn thành từng bước để không quá tải',
    destinyFraming: 'tài năng biến ý tưởng lớn thành hiện thực có hệ thống ở quy mô lớn',
  },
  33: {
    n: 33, archetype: 'Bao dung bậc thầy', keyword: 'Số bậc thầy', master: true,
    strengths: ['Từ bi', 'Phục vụ', 'Chữa lành'],
    challenges: ['Kiệt sức khi giúp người', 'Ôm trách nhiệm quá lớn', 'Bỏ quên bản thân'],
    essence:
      'Số 33 là số bậc thầy của lòng từ bi — phục vụ, chữa lành và nâng đỡ người khác bằng lý tưởng sống cao đẹp. Người mang số 33 cần học cách giữ ranh giới để không kiệt sức khi cho đi.',
    lifePathFraming: 'hành trình học cách phục vụ và chữa lành mà vẫn giữ ranh giới lành mạnh',
    destinyFraming: 'tài năng nâng đỡ, chữa lành và lan toả lý tưởng sống cao đẹp',
  },
};

export function getNumberFacts(n: CoreNumber): NumberFacts {
  const facts = NUMBER_FACTS[n];
  if (!facts) throw new Error(`[numerology] Thiếu canonical facts cho số ${n}`);
  return facts;
}
