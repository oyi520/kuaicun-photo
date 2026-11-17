const assert = require('assert')
const sizes = require('../utils/sizes')
const color = require('../utils/color')
const format = require('../utils/format')
const crop = require('../utils/crop')
const cutout = require('../utils/cutout')
const compressCore = require('../utils/compress-core')

let passed = 0
const queue = []

function test(name, fn) {
  queue.push({ name: name, fn: fn })
}

function makeImage(w, h, paint) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = paint(x, y)
      const p = (y * w + x) * 4
      data[p] = c[0]
      data[p + 1] = c[1]
      data[p + 2] = c[2]
      data[p + 3] = c.length > 3 ? c[3] : 255
    }
  }
  return { data: data, width: w, height: h }
}

function ellipse(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx
  const dy = (y - cy) / ry
  return dx * dx + dy * dy <= 1
}

function portrait(bg, skin, clothes) {
  return makeImage(200, 280, function (x, y) {
    const n = ((x * 7 + y * 13) % 7) - 3
    if (ellipse(x, y, 100, 96, 40, 50)) return skin
    if (y > 145 && x > 58 && x < 142) return clothes
    return [bg[0] + n, bg[1] + n, bg[2] + n, 255]
  })
}

function ratioOf(mask, w, h, pred) {
  let n = 0
  let hit = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!pred(x, y)) continue
      n += 1
      if (mask[y * w + x] >= 200) hit += 1
    }
  }
  return n ? hit / n : 0
}

test('预设包含题目要求的尺寸', function () {
  const need = {
    '一寸': [295, 413],
    '小一寸': [260, 378],
    '大一寸': [390, 567],
    '二寸': [413, 579],
    '小二寸': [413, 531],
    '大二寸': [626, 878],
    '绘证照': [330, 480],
    '护照照': [390, 567],
    '简历照': [295, 413]
  }
  Object.keys(need).forEach(function (name) {
    const found = sizes.PRESETS.filter(function (item) {
      return item.name === name
    })[0]
    assert.ok(found, '缺少 ' + name)
    assert.strictEqual(found.width, need[name][0])
    assert.strictEqual(found.height, need[name][1])
  })
})

test('自定义像素校验', function () {
  assert.strictEqual(sizes.validateCustom('295', '413').ok, true)
  assert.strictEqual(sizes.validateCustom('79', '400').ok, false)
  assert.strictEqual(sizes.validateCustom('2001', '400').ok, false)
  assert.strictEqual(sizes.validateCustom('12.5', '400').ok, false)
  assert.strictEqual(sizes.validateCustom('', '400').ok, false)
  const custom = sizes.validateCustom('640', '480')
  assert.strictEqual(custom.width, 640)
  assert.strictEqual(custom.height, 480)
})

test('底色预设和十六进制', function () {
  assert.strictEqual(color.PRESET_COLORS[0].hex, '#438EDB')
  assert.strictEqual(color.PRESET_COLORS[1].hex, '#FFFFFF')
  assert.strictEqual(color.PRESET_COLORS[2].hex, '#D32F2F')
  assert.deepStrictEqual(color.parseHex('#438edb'), { r: 67, g: 142, b: 219, hex: '#438EDB' })
  assert.deepStrictEqual(color.parseHex('fff'), { r: 255, g: 255, b: 255, hex: '#FFFFFF' })
  assert.strictEqual(color.parseHex('gg0000'), null)
  const rgb = color.hslToRgb(0, 1, 0.5)
  assert.strictEqual(rgb.r, 255)
  assert.strictEqual(rgb.g, 0)
  assert.strictEqual(rgb.b, 0)
})

test('体积文案', function () {
  assert.strictEqual(format.formatBytes(512), '512 B')
  assert.strictEqual(format.formatBytes(20 * 1024), '20.0 KB')
  assert.strictEqual(format.formatBytes(2.4 * 1024 * 1024), '2.40 MB')
})

test('裁剪源矩形保持目标宽高比且不越界', function () {
  const frame = { frameX: 40, frameY: 30, frameW: 200, frameH: 280 }
  const place = crop.initialPlacement(1000, 500, frame)
  assert.ok(place.dispW >= frame.frameW - 0.01)
  assert.ok(place.dispH >= frame.frameH - 0.01)
  const fixed = crop.constrain(place.tx, place.ty, place.dispW, place.dispH, frame)
  const size = crop.placementSize(1000, 500, place.cover, 1)
  const rect = crop.sourceRect(fixed.tx, fixed.ty, size.displayScale, frame, 1000, 500)
  assert.ok(rect.sx >= 0 && rect.sy >= 0)
  assert.ok(rect.sx + rect.sw <= 1000 + 0.01)
  assert.ok(rect.sy + rect.sh <= 500 + 0.01)
  const aspect = rect.sw / rect.sh
  const target = frame.frameW / frame.frameH
  assert.ok(Math.abs(aspect - target) < 0.02, aspect + ' vs ' + target)
})

test('放大后仍盖住裁剪框', function () {
  const frame = crop.frameInStage(360, 640, 295, 413)
  assert.ok(Math.abs(frame.frameW / frame.frameH - 295 / 413) < 0.001)
  const place = crop.initialPlacement(1200, 1600, frame)
  const moved = crop.constrain(place.tx + 500, place.ty - 800, place.dispW, place.dispH, frame)
  assert.ok(moved.tx <= frame.frameX + 0.01)
  assert.ok(moved.ty <= frame.frameY + 0.01)
  assert.ok(moved.tx + place.dispW >= frame.frameX + frame.frameW - 0.01)
  assert.ok(moved.ty + place.dispH >= frame.frameY + frame.frameH - 0.01)
})

test('肤色判断不把蓝白红底当成皮肤', function () {
  assert.strictEqual(cutout.isSkin(224, 172, 140), true)
  assert.strictEqual(cutout.isSkin(245, 210, 190), true)
  assert.strictEqual(cutout.isSkin(120, 80, 55), true)
  assert.strictEqual(cutout.isSkin(67, 142, 219), false)
  assert.strictEqual(cutout.isSkin(255, 255, 255), false)
  assert.strictEqual(cutout.isSkin(211, 47, 47), false)
  assert.strictEqual(cutout.isSkin(30, 48, 90), false)
})

function assertPortraitKept(bg, label) {
  const image = portrait(bg, [224, 172, 140], [32, 44, 78])
  const result = cutout.cutout(image)
  const face = ratioOf(result.mask, 200, 280, function (x, y) {
    return ellipse(x, y, 100, 96, 24, 32)
  })
  const body = ratioOf(result.mask, 200, 280, function (x, y) {
    return y > 170 && y < 250 && x > 75 && x < 125
  })
  const corner = result.mask[2 * 200 + 2]
  assert.ok(face > 0.9, label + ' 脸被挖掉 ' + face)
  assert.ok(body > 0.85, label + ' 衣服被挖掉 ' + body)
  assert.ok(corner < 12, label + ' 角落没去掉 ' + corner)
  assert.ok(result.stats.bgRatio > 0.35, label + ' 背景太少 ' + result.stats.bgRatio)
  assert.ok(result.level !== 'low', label + ' 置信度过低 ' + result.confidence)
}

test('蓝底证件照抠图保留头部', function () {
  assertPortraitKept([67, 142, 219], '蓝')
})

test('白底证件照抠图保留头部', function () {
  assertPortraitKept([248, 248, 248], '白')
})

test('红底证件照抠图保留头部', function () {
  assertPortraitKept([211, 47, 47], '红')
})

test('轻微渐变的蓝底仍保留头部', function () {
  const image = makeImage(180, 240, function (x, y) {
    const t = y / 239
    if (ellipse(x, y, 90, 86, 34, 44)) return [224, 172, 140, 255]
    if (y > 128 && x > 52 && x < 128) return [32, 44, 78, 255]
    return [
      Math.round(48 + t * 36),
      Math.round(118 + t * 36),
      Math.round(188 + t * 30),
      255
    ]
  })
  const result = cutout.cutout(image)
  const face = ratioOf(result.mask, 180, 240, function (x, y) {
    return ellipse(x, y, 90, 86, 20, 28)
  })
  assert.ok(face > 0.9, '脸 ' + face)
  assert.ok(result.mask[2] < 16, '上边角 ' + result.mask[2])
  assert.ok(result.mask[(239 * 180) + 2] < 16, '下边角 ' + result.mask[(239 * 180) + 2])
})

test('杂乱图片置信度低', function () {
  const image = makeImage(90, 90, function (x, y) {
    const v = (x * 29 + y * 17) % 255
    return [(v * 3) % 255, (v * 7) % 255, (v * 11) % 255, 255]
  })
  const result = cutout.cutout(image)
  assert.ok(result.confidence < 0.62, '置信度 ' + result.confidence)
  assert.strictEqual(result.level, 'low')
})

test('画笔可以补回或擦掉', function () {
  const mask = new Uint8Array(40 * 40)
  const rect = cutout.paintMask(mask, 40, 40, 10, 10, 4, 'person')
  assert.strictEqual(mask[10 * 40 + 10], 255)
  assert.ok(rect.x1 >= 10 && rect.y1 >= 10)
  cutout.paintMask(mask, 40, 40, 10, 10, 2, 'background')
  assert.strictEqual(mask[10 * 40 + 10], 0)
  const base = new Uint8ClampedArray(16)
  const out = new Uint8ClampedArray(16)
  base[0] = 10
  base[1] = 20
  base[2] = 30
  base[3] = 255
  const tiny = new Uint8Array(4)
  tiny[0] = 0
  cutout.composite(base, out, tiny, 2, { r: 67, g: 142, b: 219 }, { x0: 0, y0: 0, x1: 0, y1: 0 })
  assert.strictEqual(out[0], 67)
  assert.strictEqual(out[1], 142)
  assert.strictEqual(out[2], 219)
})

test('画质二分能压到目标以下并尽量保持画质', async function () {
  function sizeOf(quality, width, height) {
    return Math.round(quality * width * height * 0.2)
  }
  const result = await compressCore.compressPlan({
    width: 400,
    height: 400,
    targetBytes: 10000,
    render: function (quality, width, height) {
      return Promise.resolve({
        quality: quality,
        size: sizeOf(quality, width, height),
        path: 'mem'
      })
    }
  })
  assert.ok(result.size <= 10000, 'size ' + result.size)
  assert.ok(result.quality > 0.24, 'quality ' + result.quality)
  assert.strictEqual(result.width, 400)
  assert.strictEqual(result.under, true)
})

test('画质无效时改为缩小直到低于目标', async function () {
  const result = await compressCore.compressPlan({
    width: 800,
    height: 800,
    targetBytes: 20000,
    minEdge: 40,
    render: function (quality, width, height) {
      return Promise.resolve({
        quality: quality,
        size: Math.round(width * height * 0.15),
        path: 'mem'
      })
    }
  })
  assert.ok(result.size <= 20000, 'size ' + result.size)
  assert.ok(result.width < 800, 'width ' + result.width)
})

test('长边限制', function () {
  const fitted = compressCore.fitWithin(4000, 2000, 2048)
  assert.strictEqual(fitted.width, 2048)
  assert.strictEqual(fitted.height, 1024)
  assert.strictEqual(fitted.scaled, true)
  const same = compressCore.fitWithin(800, 600, 2048)
  assert.strictEqual(same.scaled, false)
})

async function main() {
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i]
    try {
      await item.fn()
      passed += 1
      console.log('ok  ' + item.name)
    } catch (err) {
      console.error('FAIL ' + item.name)
      console.error(err && err.stack ? err.stack : err)
      process.exitCode = 1
      return
    }
  }
  console.log(passed + ' passed')
}

main()
