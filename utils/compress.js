const image = require('./image')
const core = require('./compress-core')

/**
 * 把一张本地照片压成不超过 targetBytes 的 JPEG。
 * 画质二分；如果最低画质仍超标，再缩小尺寸。照片不出本机。
 */
async function compressToTarget(page, src, targetBytes, onProgress) {
  const info = await image.getImageInfo(src)
  const fitted = core.fitWithin(info.width, info.height, 2048)
  let pack = null
  let loaded = null
  let currentW = 0
  let currentH = 0
  let useOffscreen = true

  async function draw(quality, width, height, offscreen) {
    if (!pack || currentW !== width || currentH !== height || pack.offscreen !== offscreen) {
      pack = await image.createCanvas(page, {
        width: width,
        height: height,
        selector: '#workCanvas',
        offscreen: offscreen
      })
      loaded = await image.loadImage(pack.canvas, src)
      currentW = width
      currentH = height
    }
    if (pack.ctx.imageSmoothingEnabled != null) pack.ctx.imageSmoothingEnabled = true
    pack.ctx.clearRect(0, 0, width, height)
    pack.ctx.drawImage(loaded, 0, 0, width, height)
    const path = await image.canvasToJpeg(page, pack.canvas, width, height, quality)
    const size = await image.getFileSize(path)
    return { path: path, size: size, quality: quality }
  }

  async function render(quality, width, height) {
    try {
      return await draw(quality, width, height, useOffscreen)
    } catch (err) {
      if (!useOffscreen) throw err
      useOffscreen = false
      pack = null
      return draw(quality, width, height, false)
    }
  }

  const result = await core.compressPlan({
    width: fitted.width,
    height: fitted.height,
    targetBytes: targetBytes,
    minEdge: 64,
    maxSteps: 8,
    render: render,
    onTry: onProgress
  })

  return {
    result: result,
    originalWidth: info.width,
    originalHeight: info.height,
    type: info.type || ''
  }
}

module.exports = {
  compressToTarget: compressToTarget
}
