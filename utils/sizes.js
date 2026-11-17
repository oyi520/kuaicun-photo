/**
 * 证件照像素预设。像素按常见 300dpi 或报名系统常用值。
 * 护照物理规格是 33×48 mm：300dpi 为 390×567，按 10 像素/毫米为 330×480。
 */

const MIN_PX = 80
const MAX_PX = 2000

const PRESETS = [
  {
    id: '1cun',
    name: '一寸',
    width: 295,
    height: 413,
    hint: '25×35 mm，报名和简历最常用'
  },
  {
    id: 's1',
    name: '小一寸',
    width: 260,
    height: 378,
    hint: '22×32 mm，驾照等部分表格'
  },
  {
    id: 'l1',
    name: '大一寸',
    width: 390,
    height: 567,
    hint: '33×48 mm，档案和部分签证'
  },
  {
    id: '2cun',
    name: '二寸',
    width: 413,
    height: 579,
    hint: '35×49 mm，考试和证件'
  },
  {
    id: 's2',
    name: '小二寸',
    width: 413,
    height: 531,
    hint: '35×45 mm，部分通行证'
  },
  {
    id: 'l2',
    name: '大二寸',
    width: 626,
    height: 878,
    hint: '按 626×878 像素导出'
  },
  {
    id: 'passport',
    name: '护照照',
    width: 390,
    height: 567,
    hint: '33×48 mm，300dpi，现行常用像素'
  },
  {
    id: 'huizheng',
    name: '绘证照',
    width: 330,
    height: 480,
    hint: '33×48 mm，常见 330×480 像素'
  },
  {
    id: 'resume',
    name: '简历照',
    width: 295,
    height: 413,
    hint: '与一寸相同，适合贴在简历上'
  }
]

function findPreset(id) {
  for (let i = 0; i < PRESETS.length; i++) {
    if (PRESETS[i].id === id) return PRESETS[i]
  }
  return null
}

function validateCustom(widthInput, heightInput) {
  const wText = String(widthInput == null ? '' : widthInput).trim()
  const hText = String(heightInput == null ? '' : heightInput).trim()
  if (!/^[0-9]+$/.test(wText) || !/^[0-9]+$/.test(hText)) {
    return { ok: false, message: '宽和高都要填整数像素' }
  }
  const width = parseInt(wText, 10)
  const height = parseInt(hText, 10)
  if (width < MIN_PX || height < MIN_PX || width > MAX_PX || height > MAX_PX) {
    return { ok: false, message: '请填写 ' + MIN_PX + ' 到 ' + MAX_PX + ' 之间的像素' }
  }
  return {
    ok: true,
    width: width,
    height: height,
    id: 'custom',
    name: '自定义',
    hint: width + '×' + height + ' 像素'
  }
}

module.exports = {
  PRESETS: PRESETS,
  MIN_PX: MIN_PX,
  MAX_PX: MAX_PX,
  findPreset: findPreset,
  validateCustom: validateCustom
}
