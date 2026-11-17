/**
 * 本机抠图。只用边角采样、颜色聚类、从边缘泛洪、局部扩边，以及肤色和边缘启发式。
 * 不要换成神经网络、WASM 模型或云端分割：个人主体不能走「深度合成」，照片也不能上传。
 */

function dist2(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2
  const dg = g1 - g2
  const db = b1 - b2
  return dr * dr + dg * dg + db * db
}

/**
 * 肤色用 YCbCr，避免把红底误判成皮肤。
 * 红底、蓝底、白底都应返回 false。
 */
function isSkin(r, g, b) {
  if (r < 45 || g < 25 || b < 15) return false
  if (r > g * 1.75 && r > b * 1.75 && g < 110) return false
  const y = 0.299 * r + 0.587 * g + 0.114 * b
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
  return y > 40 && y < 248 && cb > 77 && cb < 127 && cr > 133 && cr < 173
}

function looksLikeSkinFast(r, g, b) {
  if (r < 60 || g < 30) return false
  if (b > r + 25 && b > g + 15) return false
  return isSkin(r, g, b)
}

function classifyKind(r, g, b) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (min > 210 && max - min < 28) return 'white'
  if (b > r + 18 && b > g + 8 && b > 70) return 'blue'
  if (r > g + 28 && r > b + 28 && r > 70) return 'red'
  return 'other'
}

function estimateBackground(data, w, h) {
  const count = new Uint32Array(4096)
  const sumR = new Uint32Array(4096)
  const sumG = new Uint32Array(4096)
  const sumB = new Uint32Array(4096)
  let sampleCount = 0
  const step = w > 800 ? 2 : 1

  function take(x, y) {
    const p = (y * w + x) * 4
    if (data[p + 3] < 20) return
    const r = data[p]
    const g = data[p + 1]
    const b = data[p + 2]
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    count[key] += 1
    sumR[key] += r
    sumG[key] += g
    sumB[key] += b
    sampleCount += 1
  }

  const inset = 1
  for (let x = inset; x < w - inset; x += step) {
    take(x, inset)
    take(x, h - 1 - inset)
  }
  for (let y = inset; y < h - inset; y += step) {
    take(inset, y)
    take(w - 1 - inset, y)
  }

  let bestKey = 0
  for (let i = 1; i < 4096; i++) {
    if (count[i] > count[bestKey]) bestKey = i
  }

  const n = count[bestKey] || 1
  const bg = {
    r: Math.round(sumR[bestKey] / n),
    g: Math.round(sumG[bestKey] / n),
    b: Math.round(sumB[bestKey] / n)
  }
  bg.kind = classifyKind(bg.r, bg.g, bg.b)
  bg.dominantRatio = sampleCount ? count[bestKey] / sampleCount : 0

  const distances = []
  for (let x = inset; x < w - inset; x += step * 2) {
    pushDist(data, w, x, inset, bg, distances)
    pushDist(data, w, x, h - 1 - inset, bg, distances)
  }
  for (let y = inset; y < h - inset; y += step * 2) {
    pushDist(data, w, inset, y, bg, distances)
    pushDist(data, w, w - 1 - inset, y, bg, distances)
  }
  distances.sort(function (a, b) {
    return a - b
  })
  const p75 = distances.length ? distances[Math.floor(distances.length * 0.75)] : 0
  let thresh = Math.max(p75, 8) + 14
  if (bg.kind === 'white') thresh = Math.min(thresh, 32)
  if (bg.kind === 'blue') thresh = Math.min(48, thresh + 8)
  if (bg.kind === 'red') thresh = Math.min(44, thresh + 4)
  if (thresh < 20) thresh = 20
  if (thresh > 48) thresh = 48
  bg.thresh = thresh

  bg.cornerSpread = cornerSpread(data, w, h)
  bg.anchors = collectAnchors(data, w, h, bg)
  return bg
}

function medianChannel(values) {
  const copy = values.slice()
  copy.sort(function (a, b) {
    return a - b
  })
  return copy[Math.floor(copy.length / 2)]
}

function sampleEdge(data, w, h, which) {
  const rs = []
  const gs = []
  const bs = []
  const step = Math.max(1, Math.floor(Math.max(w, h) / 80))
  if (which === 'top' || which === 'bottom') {
    const y = which === 'top' ? 1 : h - 2
    for (let x = 1; x < w - 1; x += step) {
      const p = (y * w + x) * 4
      if (data[p + 3] < 20) continue
      rs.push(data[p])
      gs.push(data[p + 1])
      bs.push(data[p + 2])
    }
  } else {
    const x = which === 'left' ? 1 : w - 2
    for (let y = 1; y < h - 1; y += step) {
      const p = (y * w + x) * 4
      if (data[p + 3] < 20) continue
      rs.push(data[p])
      gs.push(data[p + 1])
      bs.push(data[p + 2])
    }
  }
  if (!rs.length) return null
  const r = medianChannel(rs)
  const g = medianChannel(gs)
  const b = medianChannel(bs)
  let range = 0
  for (let i = 0; i < rs.length; i++) {
    range = Math.max(range, Math.abs(rs[i] - r), Math.abs(gs[i] - g), Math.abs(bs[i] - b))
  }
  return { r: r, g: g, b: b, range: range }
}

function collectAnchors(data, w, h, bg) {
  const anchors = [{ r: bg.r, g: bg.g, b: bg.b }]
  const edges = ['top', 'bottom', 'left', 'right']
  for (let i = 0; i < edges.length; i++) {
    const edge = sampleEdge(data, w, h, edges[i])
    if (!edge) continue
    if (edge.range > 46) continue
    if (isSkin(edge.r, edge.g, edge.b)) continue
    if (dist2(edge.r, edge.g, edge.b, bg.r, bg.g, bg.b) > 90 * 90) continue
    anchors.push(edge)
  }
  return anchors
}

function matchesBackground(r, g, b, model, thresh2) {
  const anchors = model.anchors
  for (let i = 0; i < anchors.length; i++) {
    const anchor = anchors[i]
    if (dist2(r, g, b, anchor.r, anchor.g, anchor.b) <= thresh2) return true
  }
  return false
}

function pushDist(data, w, x, y, bg, distances) {
  const p = (y * w + x) * 4
  if (data[p + 3] < 20) return
  const d = Math.sqrt(dist2(data[p], data[p + 1], data[p + 2], bg.r, bg.g, bg.b))
  distances.push(d)
}

function cornerColor(data, w, h, x0, y0) {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let y = y0; y < y0 + 6; y++) {
    for (let x = x0; x < x0 + 6; x++) {
      const p = (y * w + x) * 4
      r += data[p]
      g += data[p + 1]
      b += data[p + 2]
      n += 1
    }
  }
  return { r: r / n, g: g / n, b: b / n }
}

function cornerSpread(data, w, h) {
  if (w < 12 || h < 12) return 0
  const corners = [
    cornerColor(data, w, h, 1, 1),
    cornerColor(data, w, h, w - 7, 1),
    cornerColor(data, w, h, 1, h - 7),
    cornerColor(data, w, h, w - 7, h - 7)
  ]
  let maxD = 0
  for (let i = 0; i < corners.length; i++) {
    for (let j = i + 1; j < corners.length; j++) {
      const d = Math.sqrt(
        dist2(corners[i].r, corners[i].g, corners[i].b, corners[j].r, corners[j].g, corners[j].b)
      )
      if (d > maxD) maxD = d
    }
  }
  return maxD
}

function floodBackground(data, mask, w, h, model) {
  const visited = new Uint8Array(w * h)
  const queue = new Int32Array(w * h)
  let qs = 0
  let qe = 0
  let refR = model.r
  let refG = model.g
  let refB = model.b
  const originR = model.r
  const originG = model.g
  const originB = model.b
  const thresh2 = model.thresh * model.thresh
  const edge2 = 58 * 58
  const maxDrift2 = 34 * 34
  const adapt = model.kind === 'white' ? 0 : 0.07
  let accepted = 0

  function consider(x, y, fromR, fromG, fromB, checkEdge) {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const i = y * w + x
    if (visited[i]) return
    visited[i] = 1
    const p = i * 4
    const r = data[p]
    const g = data[p + 1]
    const b = data[p + 2]
    if (data[p + 3] < 20) {
      mask[i] = 0
      queue[qe++] = i
      return
    }
    if (checkEdge) {
      const dr = r - fromR
      const dg = g - fromG
      const db = b - fromB
      if (dr * dr + dg * dg + db * db > edge2) return
    }
    if (x > 1 && y > 1 && x < w - 2 && y < h - 2 && looksLikeSkinFast(r, g, b)) return
    const nearAnchor = matchesBackground(r, g, b, model, thresh2)
    const nearRef = dist2(r, g, b, refR, refG, refB) <= thresh2
    if (!nearAnchor && !nearRef) return
    mask[i] = 0
    queue[qe++] = i
    accepted += 1
    if (adapt) {
      const nr = refR * (1 - adapt) + r * adapt
      const ng = refG * (1 - adapt) + g * adapt
      const nb = refB * (1 - adapt) + b * adapt
      if (dist2(nr, ng, nb, originR, originG, originB) <= maxDrift2) {
        refR = nr
        refG = ng
        refB = nb
      }
    }
  }

  for (let x = 0; x < w; x++) {
    consider(x, 0, refR, refG, refB, false)
    consider(x, h - 1, refR, refG, refB, false)
  }
  for (let y = 1; y < h - 1; y++) {
    consider(0, y, refR, refG, refB, false)
    consider(w - 1, y, refR, refG, refB, false)
  }

  while (qs < qe) {
    const i = queue[qs++]
    const x = i % w
    const y = (i - x) / w
    const p = i * 4
    const r = data[p]
    const g = data[p + 1]
    const b = data[p + 2]
    consider(x + 1, y, r, g, b, true)
    consider(x - 1, y, r, g, b, true)
    consider(x, y + 1, r, g, b, true)
    consider(x, y - 1, r, g, b, true)
  }

  return { accepted: accepted }
}

function expandBackground(data, mask, w, h, model) {
  const extra = model.kind === 'white' ? 8 : 14
  const thresh2 = (model.thresh + extra) * (model.thresh + extra)
  for (let pass = 0; pass < 2; pass++) {
    const xs = []
    const ys = []
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x
        if (mask[i] === 0) continue
        const left = mask[i - 1] === 0
        const right = mask[i + 1] === 0
        const up = mask[i - w] === 0
        const down = mask[i + w] === 0
        if (!left && !right && !up && !down) continue
        const p = i * 4
        const r = data[p]
        const g = data[p + 1]
        const b = data[p + 2]
        if (looksLikeSkinFast(r, g, b)) continue
        let sr = 0
        let sg = 0
        let sb = 0
        let sn = 0
        if (left) addBg(data, i - 1, (v) => { sr += v.r; sg += v.g; sb += v.b; sn++ })
        if (right) addBg(data, i + 1, (v) => { sr += v.r; sg += v.g; sb += v.b; sn++ })
        if (up) addBg(data, i - w, (v) => { sr += v.r; sg += v.g; sb += v.b; sn++ })
        if (down) addBg(data, i + w, (v) => { sr += v.r; sg += v.g; sb += v.b; sn++ })
        if (!sn) continue
        if (dist2(r, g, b, sr / sn, sg / sn, sb / sn) <= thresh2) {
          xs.push(x)
          ys.push(y)
        }
      }
    }
    for (let k = 0; k < xs.length; k++) mask[ys[k] * w + xs[k]] = 0
    if (!xs.length) break
  }
}

function addBg(data, index, push) {
  const p = index * 4
  push({ r: data[p], g: data[p + 1], b: data[p + 2] })
}

function cleanupMask(mask, w, h) {
  const out = new Uint8Array(mask)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      let fg = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          if (mask[(y + dy) * w + (x + dx)] > 127) fg += 1
        }
      }
      if (mask[i] === 0 && fg >= 7) out[i] = 255
      if (mask[i] > 127 && fg <= 1) out[i] = 0
    }
  }
  return out
}

function protectSkin(data, mask, w, h) {
  const margin = 2
  for (let y = margin; y < h - margin; y++) {
    const row = y * w
    for (let x = margin; x < w - margin; x++) {
      const p = (row + x) * 4
      if (isSkin(data[p], data[p + 1], data[p + 2])) mask[row + x] = 255
    }
  }
}

function feather(mask, w, h) {
  const out = new Uint8Array(mask.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        out[i] = mask[i] > 127 ? 255 : 0
        continue
      }
      let sum = 0
      let mixed = false
      const centerOn = mask[i] > 127
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const v = mask[(y + dy) * w + (x + dx)]
          sum += v > 127 ? 255 : 0
          if ((v > 127) !== centerOn) mixed = true
        }
      }
      out[i] = mixed ? Math.round(sum / 9) : centerOn ? 255 : 0
    }
  }
  return out
}

function scoreCutout(mask, data, w, h, model) {
  let bg = 0
  let skin = 0
  const total = w * h
  const x0 = Math.floor(w * 0.3)
  const x1 = Math.floor(w * 0.7)
  const y0 = Math.floor(h * 0.18)
  const y1 = Math.floor(h * 0.62)
  let center = 0
  let centerBg = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (mask[i] < 128) bg += 1
      const p = i * 4
      if (isSkin(data[p], data[p + 1], data[p + 2])) skin += 1
      if (x >= x0 && x < x1 && y >= y0 && y < y1) {
        center += 1
        if (mask[i] < 128) centerBg += 1
      }
    }
  }
  const bgRatio = bg / total
  const centerBgRatio = center ? centerBg / center : 0
  const skinRatio = skin / total
  let score = 0.78
  if (model.dominantRatio < 0.45) score -= 0.22
  if (model.cornerSpread > 55) score -= 0.2
  if (bgRatio < 0.08) score -= 0.34
  if (bgRatio > 0.88) score -= 0.28
  if (centerBgRatio > 0.42) score -= 0.28
  if (skinRatio < 0.008) score -= 0.12
  if (skinRatio > 0.02 && centerBgRatio < 0.22 && bgRatio > 0.15 && bgRatio < 0.8) score += 0.1
  if (score < 0.05) score = 0.05
  if (score > 0.98) score = 0.98
  let level = 'high'
  if (score < 0.55) level = 'low'
  else if (score < 0.72) level = 'mid'
  return {
    confidence: score,
    level: level,
    bgRatio: bgRatio,
    centerBgRatio: centerBgRatio,
    skinRatio: skinRatio,
    cornerSpread: model.cornerSpread
  }
}

function cutout(imageData) {
  const w = imageData.width
  const h = imageData.height
  const data = imageData.data
  const model = estimateBackground(data, w, h)
  const mask = new Uint8Array(w * h)
  mask.fill(255)
  for (let i = 0, p = 3; i < w * h; i++, p += 4) {
    if (data[p] < 20) mask[i] = 0
  }
  floodBackground(data, mask, w, h, model)
  expandBackground(data, mask, w, h, model)
  const cleaned = cleanupMask(mask, w, h)
  protectSkin(data, cleaned, w, h)
  const soft = feather(cleaned, w, h)
  const stats = scoreCutout(soft, data, w, h, model)
  return {
    mask: soft,
    confidence: stats.confidence,
    level: stats.level,
    background: { r: model.r, g: model.g, b: model.b, kind: model.kind },
    stats: stats
  }
}

function paintMask(mask, w, h, cx, cy, radius, mode) {
  const value = mode === 'person' ? 255 : 0
  const r = Math.max(1, radius)
  const r2 = r * r
  const x0 = Math.max(0, Math.floor(cx - r))
  const x1 = Math.min(w - 1, Math.ceil(cx + r))
  const y0 = Math.max(0, Math.floor(cy - r))
  const y1 = Math.min(h - 1, Math.ceil(cy + r))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy <= r2) mask[y * w + x] = value
    }
  }
  return { x0: x0, y0: y0, x1: x1, y1: y1 }
}

function composite(base, out, mask, w, color, rect) {
  const x0 = rect ? rect.x0 : 0
  const y0 = rect ? rect.y0 : 0
  const x1 = rect ? rect.x1 : w - 1
  const y1 = rect ? rect.y1 : Math.floor(out.length / 4 / w) - 1
  const cr = color.r
  const cg = color.g
  const cb = color.b
  for (let y = y0; y <= y1; y++) {
    let i = y * w + x0
    let p = i * 4
    for (let x = x0; x <= x1; x++) {
      const a = mask[i] / 255
      const ia = 1 - a
      out[p] = base[p] * a + cr * ia
      out[p + 1] = base[p + 1] * a + cg * ia
      out[p + 2] = base[p + 2] * a + cb * ia
      out[p + 3] = 255
      i += 1
      p += 4
    }
  }
}

module.exports = {
  isSkin: isSkin,
  estimateBackground: estimateBackground,
  cutout: cutout,
  paintMask: paintMask,
  composite: composite
}
