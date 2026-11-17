/** 颜色小工具：预设底色、十六进制和 HSL。 */

const PRESET_COLORS = [
  { id: 'blue', name: '蓝', hex: '#438EDB' },
  { id: 'white', name: '白', hex: '#FFFFFF' },
  { id: 'red', name: '红', hex: '#D32F2F' }
]

function clampByte(n) {
  n = Math.round(n)
  if (n < 0) return 0
  if (n > 255) return 255
  return n
}

function rgbToHex(r, g, b) {
  const parts = [clampByte(r), clampByte(g), clampByte(b)]
  let hex = '#'
  for (let i = 0; i < parts.length; i++) {
    const s = parts[i].toString(16).toUpperCase()
    hex += s.length === 1 ? '0' + s : s
  }
  return hex
}

function parseHex(input) {
  if (input == null) return null
  let text = String(input).trim()
  if (!text) return null
  if (text.charAt(0) === '#') text = text.slice(1)
  if (!/^[0-9a-fA-F]+$/.test(text)) return null
  if (text.length === 3) {
    text = text.charAt(0) + text.charAt(0) + text.charAt(1) + text.charAt(1) + text.charAt(2) + text.charAt(2)
  }
  if (text.length !== 6) return null
  return {
    r: parseInt(text.slice(0, 2), 16),
    g: parseInt(text.slice(2, 4), 16),
    b: parseInt(text.slice(4, 6), 16),
    hex: '#' + text.toUpperCase()
  }
}

function hslToRgb(h, s, l) {
  const hue = ((h % 360) + 360) % 360
  const sat = Math.max(0, Math.min(1, s))
  const lig = Math.max(0, Math.min(1, l))
  const c = (1 - Math.abs(2 * lig - 1)) * sat
  const hp = hue / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) {
    r = c
    g = x
  } else if (hp < 2) {
    r = x
    g = c
  } else if (hp < 3) {
    g = c
    b = x
  } else if (hp < 4) {
    g = x
    b = c
  } else if (hp < 5) {
    r = x
    b = c
  } else {
    r = c
    b = x
  }
  const m = lig - c / 2
  return {
    r: clampByte((r + m) * 255),
    g: clampByte((g + m) * 255),
    b: clampByte((b + m) * 255)
  }
}

function hslToHex(h, s, l) {
  const rgb = hslToRgb(h, s, l)
  return rgbToHex(rgb.r, rgb.g, rgb.b)
}

module.exports = {
  PRESET_COLORS: PRESET_COLORS,
  clampByte: clampByte,
  rgbToHex: rgbToHex,
  parseHex: parseHex,
  hslToRgb: hslToRgb,
  hslToHex: hslToHex
}
