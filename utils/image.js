const { fitWithin } = require('./compress-core')

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms)
  })
}

function getImageInfo(src) {
  return new Promise(function (resolve, reject) {
    wx.getImageInfo({
      src: src,
      success: resolve,
      fail: function () {
        reject(new Error('读不到这张照片'))
      }
    })
  })
}

function getFileSize(filePath) {
  return new Promise(function (resolve, reject) {
    wx.getFileSystemManager().getFileInfo({
      filePath: filePath,
      success: function (res) {
        resolve(res.size || 0)
      },
      fail: function () {
        reject(new Error('读不到文件大小'))
      }
    })
  })
}

function queryCanvas(page, selector) {
  return new Promise(function (resolve, reject) {
    const query = wx.createSelectorQuery()
    if (page) query.in(page)
    query.select(selector).fields({ node: true, size: true }).exec(function (res) {
      const node = res && res[0] && res[0].node
      if (!node) {
        reject(new Error('画布还没准备好'))
        return
      }
      resolve(node)
    })
  })
}

async function createCanvas(page, options) {
  const width = options.width
  const height = options.height
  if (options.offscreen !== false && wx.createOffscreenCanvas) {
    try {
      const canvas = wx.createOffscreenCanvas({ type: '2d', width: width, height: height })
      const ctx = canvas.getContext('2d')
      if (ctx && canvas.createImage) {
        if (ctx.imageSmoothingEnabled != null) ctx.imageSmoothingEnabled = true
        return { canvas: canvas, ctx: ctx, offscreen: true }
      }
    } catch (err) {
      // 旧基础库没有离屏画布时，退回页面里的 canvas。
    }
  }
  const selector = options.selector || '#workCanvas'
  let canvas = null
  let lastError = null
  for (let i = 0; i < 5; i++) {
    try {
      canvas = await queryCanvas(page, selector)
      break
    } catch (err) {
      lastError = err
      await sleep(50 * (i + 1))
    }
  }
  if (!canvas) throw lastError || new Error('画布还没准备好')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (ctx && ctx.imageSmoothingEnabled != null) ctx.imageSmoothingEnabled = true
  return { canvas: canvas, ctx: ctx, offscreen: false }
}

function loadImage(canvas, src) {
  return new Promise(function (resolve, reject) {
    const image = canvas.createImage()
    image.onload = function () {
      resolve(image)
    }
    image.onerror = function () {
      reject(new Error('照片读取失败'))
    }
    image.src = src
  })
}

function canvasToJpeg(page, canvas, width, height, quality) {
  return new Promise(function (resolve, reject) {
    const task = {
      canvas: canvas,
      x: 0,
      y: 0,
      width: width,
      height: height,
      destWidth: width,
      destHeight: height,
      fileType: 'jpg',
      quality: quality,
      success: function (res) {
        if (!res || !res.tempFilePath) {
          reject(new Error('导出失败'))
          return
        }
        resolve(res.tempFilePath)
      },
      fail: function (err) {
        reject(err || new Error('导出失败'))
      }
    }
    if (page) wx.canvasToTempFilePath(task, page)
    else wx.canvasToTempFilePath(task)
  })
}

async function renderJpeg(page, options) {
  try {
    return await renderJpegOnce(page, options)
  } catch (err) {
    if (options.offscreen === false || options.retried) throw err
    return renderJpegOnce(page, {
      src: options.src,
      sx: options.sx,
      sy: options.sy,
      sw: options.sw,
      sh: options.sh,
      destWidth: options.destWidth,
      destHeight: options.destHeight,
      quality: options.quality,
      selector: options.selector || '#workCanvas',
      offscreen: false,
      retried: true
    })
  }
}

async function renderJpegOnce(page, options) {
  const destWidth = options.destWidth
  const destHeight = options.destHeight
  const pack = options.pack || await createCanvas(page, {
    width: destWidth,
    height: destHeight,
    selector: options.selector || '#workCanvas',
    offscreen: options.offscreen !== false
  })
  const image = options.image || await loadImage(pack.canvas, options.src)
  const ctx = pack.ctx
  if (ctx.imageSmoothingEnabled != null) ctx.imageSmoothingEnabled = true
  ctx.clearRect(0, 0, destWidth, destHeight)
  if (options.sx != null) {
    ctx.drawImage(
      image,
      options.sx,
      options.sy,
      options.sw,
      options.sh,
      0,
      0,
      destWidth,
      destHeight
    )
  } else {
    ctx.drawImage(image, 0, 0, destWidth, destHeight)
  }
  const path = await canvasToJpeg(page, pack.canvas, destWidth, destHeight, options.quality == null ? 0.92 : options.quality)
  return {
    path: path,
    canvas: pack.canvas,
    ctx: ctx,
    image: image,
    pack: pack
  }
}

function fitPreview(imgW, imgH, maxW, maxH) {
  let viewW = maxW
  let viewH = Math.round(maxW * imgH / imgW)
  if (viewH > maxH) {
    viewH = maxH
    viewW = Math.max(1, Math.round(maxH * imgW / imgH))
  }
  return { viewW: viewW, viewH: Math.max(1, viewH) }
}

function windowSize() {
  if (wx.getWindowInfo) return wx.getWindowInfo()
  return wx.getSystemInfoSync()
}

module.exports = {
  sleep: sleep,
  getImageInfo: getImageInfo,
  getFileSize: getFileSize,
  createCanvas: createCanvas,
  loadImage: loadImage,
  canvasToJpeg: canvasToJpeg,
  renderJpeg: renderJpeg,
  fitPreview: fitPreview,
  windowSize: windowSize,
  fitWithin: fitWithin
}
