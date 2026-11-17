/**
 * 目标体积压缩的纯计算部分。
 * 先对 JPEG 画质做二分，画质压不下去再缩小边长。
 * 画布导出在 utils/compress.js，方便这里单独测试。
 */

function fitWithin(width, height, maxEdge) {
  const longEdge = Math.max(width, height)
  if (longEdge <= maxEdge) {
    return { width: width, height: height, scaled: false }
  }
  const scale = maxEdge / longEdge
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scaled: true
  }
}

async function searchQuality(render, targetBytes, onTry) {
  const hi = 0.92
  const lo = 0.05
  let attempt = 0

  async function run(quality) {
    attempt += 1
    if (onTry) await onTry({ attempt: attempt, quality: quality })
    return render(quality)
  }

  const hiResult = await run(hi)
  if (hiResult.size <= targetBytes) {
    return Object.assign({}, hiResult, { qualityWorks: true, under: true })
  }

  const loResult = await run(lo)
  const qualityWorks = hiResult.size > loResult.size * 1.08
  let best = loResult.size <= targetBytes ? loResult : null
  let smallest = loResult.size <= hiResult.size ? loResult : hiResult

  if (!qualityWorks) {
    const picked = best || smallest
    return Object.assign({}, picked, {
      qualityWorks: false,
      under: picked.size <= targetBytes
    })
  }

  let left = lo
  let right = hi
  for (let i = 0; i < 6; i++) {
    const mid = (left + right) / 2
    const result = await run(Number(mid.toFixed(3)))
    if (result.size < smallest.size) smallest = result
    if (result.size <= targetBytes) {
      best = result
      left = mid
    } else {
      right = mid
    }
  }

  const picked = best || smallest
  return Object.assign({}, picked, {
    qualityWorks: true,
    under: !!(best && best.size <= targetBytes)
  })
}

async function compressPlan(options) {
  const render = options.render
  const targetBytes = options.targetBytes
  const onTry = options.onTry
  let width = options.width
  let height = options.height
  const minEdge = options.minEdge || 64
  const maxSteps = options.maxSteps || 8
  let best = null

  for (let step = 0; step < maxSteps; step++) {
    const found = await searchQuality(
      function (quality) {
        return render(quality, width, height)
      },
      targetBytes,
      onTry
        ? function (info) {
            return onTry({
              attempt: info.attempt,
              quality: info.quality,
              width: width,
              height: height,
              step: step
            })
          }
        : null
    )

    if (found) {
      const record = Object.assign({ width: width, height: height }, found)
      if (!best || record.size < best.size) best = record
      if (record.size <= targetBytes) return record
    }

    const sizeNow = found ? found.size : targetBytes * 4
    let factor = 0.82
    if (found && found.qualityWorks === false && sizeNow > targetBytes) {
      factor = Math.sqrt(targetBytes / sizeNow) * 0.98
      if (factor < 0.5) factor = 0.5
      if (factor > 0.9) factor = 0.9
    }
    const nextW = Math.max(1, Math.round(width * factor))
    const nextH = Math.max(1, Math.round(height * factor))
    if (nextW < minEdge || nextH < minEdge || (nextW === width && nextH === height)) break
    width = nextW
    height = nextH
  }

  return best
}

module.exports = {
  fitWithin: fitWithin,
  searchQuality: searchQuality,
  compressPlan: compressPlan
}
