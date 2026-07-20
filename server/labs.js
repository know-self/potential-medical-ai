function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function explainLabResults(input = {}) {
  const locale = input.locale === 'vi' ? 'vi' : 'en';
  const results = Array.isArray(input.results) ? input.results.slice(0, 100) : [];
  const normalized = results.map((item) => {
    const value = numeric(item.value);
    const low = numeric(item.referenceLow);
    const high = numeric(item.referenceHigh);
    let flag = 'unknown';
    if (value !== null && low !== null && value < low) flag = 'low';
    else if (value !== null && high !== null && value > high) flag = 'high';
    else if (value !== null && (low !== null || high !== null)) flag = 'within-provided-range';
    return {
      name: String(item.name || 'Unnamed test').slice(0, 200),
      value,
      unit: String(item.unit || '').slice(0, 40),
      referenceLow: low,
      referenceHigh: high,
      referenceSource: String(item.referenceSource || 'user-provided').slice(0, 300),
      flag,
      note: flag === 'unknown'
        ? (locale === 'vi' ? 'Không đủ giá trị hoặc khoảng tham chiếu để phân loại.' : 'Insufficient value or reference range to classify.')
        : flag === 'within-provided-range'
          ? (locale === 'vi' ? 'Nằm trong khoảng tham chiếu đã cung cấp; vẫn cần diễn giải theo bối cảnh.' : 'Within the supplied reference range; clinical context still matters.')
          : (locale === 'vi' ? `Giá trị ${flag === 'high' ? 'cao hơn' : 'thấp hơn'} khoảng tham chiếu đã cung cấp.` : `Value is ${flag} relative to the supplied reference range.`)
    };
  });
  return {
    locale,
    results: normalized,
    abnormalCount: normalized.filter((item) => ['high', 'low'].includes(item.flag)).length,
    disclaimer: locale === 'vi'
      ? 'Đây là so sánh số học với khoảng tham chiếu do người dùng cung cấp, không phải chẩn đoán. Khoảng tham chiếu phụ thuộc phòng xét nghiệm, tuổi, giới, thai kỳ, thuốc và bối cảnh lâm sàng.'
      : 'This is a numeric comparison with user-supplied reference ranges, not a diagnosis. Ranges depend on the laboratory, age, sex, pregnancy, medicines, and clinical context.'
  };
}

export function medicalImageBoundary(input = {}) {
  return {
    allowed: false,
    mode: 'educational-boundary',
    message: input.locale === 'vi'
      ? 'Hệ thống không chẩn đoán từ ảnh y khoa. Ảnh chỉ có thể được lưu và mô tả phi chẩn đoán khi quy trình bảo mật cho phép.'
      : 'The platform does not diagnose from medical images. Images may only be stored and described non-diagnostically when the secure workflow permits it.',
    requiredForDiagnosticUse: [
      'separately validated regulated imaging workflow',
      'qualified clinician oversight',
      'device-specific evaluation',
      'audit and incident controls'
    ]
  };
}
