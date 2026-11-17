const cutoutLib = require('../../utils/cutout')
const colorUtil = require('../../utils/color')
const image = require('../../utils/image')
const session = require('../../utils/session')
const picker = require('../../utils/picker')
const nav = require('../../utils/nav')

const MAX_EDGE = 1080
const BRUSH_SCREEN = { s: 14, m: 26, l: 44 }

function levelMessage(level) {
  if (level === 'low') {
    return '背景不太好分。请打开「修补边缘」，把人物涂成「这是人像」，把多出来的底涂成「这是背景」。'
  }
  if (level === 'mid') {
    return '大体分好了。头发或肩膀如果不干净，打开「修补边缘」涂一下。'
  }
  return '背景已分开。点下面的颜色就能换。'
}

Page({
  data: {
    hasImage: false,
    busy: false,
    busyText: '正在本机识别背景…',
    error: '',
    viewW: 300,
    viewH: 380,
    colors: colorUtil.PRESET_COLORS,
    colorId: 'blue',
    colorHex: '#438EDB',
    customOpen: false,
    hue: 207,
    light: 56,
    hueLeft: 57.5,
    lightLeft: 42,
    hexInput: '',
    message: '',
    brushOpen: false,
    brushMode: 'background',
    brushSize: 'm',
    exporting: false
  },

  onLoad(query) {
    this.alive = true
    this.color = { r: 67, g: 142, b: 219 }
    const saved = session.get()
    if (query.hasImage === '1' && (saved.currentPath || saved.sourcePath)) {
      this.begin(saved.currentPath || saved.sourcePath)
    }
  },

  onUnload() {
    this.alive = false
  },

  onCamera() {
    this.pick('camera')
  },

  onAlbum() {
    this.pick('album')
  },

  pick(source) {
    const page = this
    picker.consume(picker.choose(source), function (file) {
      session.update({
        sourcePath: file.path,
        currentPath: file.path,
        originalBytes: file.size || session.get().originalBytes || 0,
        flow: 'background'
      })
      page.begin(file.path)
    })
  },

  async begin(src) {
    this.alive = true
    this.mask = null
    this.frame = null
    this.previewRect = null
    this.setData({
      hasImage: true,
      busy: true,
      busyText: '正在本机识别背景…',
      error: '',
      message: ''
    })
    await image.sleep(40)
    if (!this.alive) return
    try {
      const info = await image.getImageInfo(src)
      const fitted = image.fitWithin(info.width, info.height, MAX_EDGE)
      const win = image.windowSize()
      const view = image.fitPreview(fitted.width, fitted.height, win.windowWidth - 32, Math.round(win.windowHeight * 0.46))
      this.setData({ viewW: view.viewW, viewH: view.viewH })
      await image.sleep(40)
      if (!this.alive) return
      const pack = await image.createCanvas(this, {
        width: fitted.width,
        height: fitted.height,
        selector: '#preview',
        offscreen: false
      })
      const photo = await image.loadImage(pack.canvas, src)
      pack.ctx.clearRect(0, 0, fitted.width, fitted.height)
      pack.ctx.drawImage(photo, 0, 0, fitted.width, fitted.height)
      const imageData = pack.ctx.getImageData(0, 0, fitted.width, fitted.height)
      if (!imageData || !imageData.data || !imageData.data.length) {
        throw new Error('像素为空')
      }
      const result = cutoutLib.cutout(imageData)
      if (!this.alive) return
      this.canvas = pack.canvas
      this.ctx = pack.ctx
      this.maskW = fitted.width
      this.maskH = fitted.height
      this.base = new Uint8ClampedArray(imageData.data)
      this.imageData = imageData
      this.frame = imageData.data
      this.autoMask = new Uint8Array(result.mask)
      this.mask = new Uint8Array(result.mask)
      this.scaledNote = fitted.scaled
        ? '为了在手机上流畅处理，已缩小到 ' + fitted.width + '×' + fitted.height + ' 像素。'
        : ''
      const low = result.level === 'low'
      cutoutLib.composite(this.base, this.frame, this.mask, this.maskW, this.color, null)
      this.ctx.putImageData(this.imageData, 0, 0)
      const page = this
      wx.createSelectorQuery().in(this).select('#preview').boundingClientRect(function (rect) {
        if (rect) page.previewRect = rect
      }).exec()
      this.setData({
        busy: false,
        message: levelMessage(result.level),
        brushOpen: low,
        brushMode: low ? 'person' : 'background'
      })
    } catch (err) {
      if (!this.alive) return
      this.setData({
        hasImage: false,
        busy: false,
        error: '没能处理这张照片，请换一张试试。照片不会被上传。'
      })
    }
  },

  redraw(rect) {
    if (!this.frame || !this.ctx) return
    cutoutLib.composite(this.base, this.frame, this.mask, this.maskW, this.color, rect || null)
    this.ctx.putImageData(this.imageData, 0, 0)
  },

  applyColor(id, rgb, hex) {
    this.color = { r: rgb.r, g: rgb.g, b: rgb.b }
    this.setData({ colorId: id, colorHex: hex })
    this.redraw(null)
  },

  onPreset(e) {
    const id = e.currentTarget.dataset.id
    const found = colorUtil.PRESET_COLORS.filter(function (item) {
      return item.id === id
    })[0]
    if (!found) return
    const parsed = colorUtil.parseHex(found.hex)
    this.setData({ customOpen: false })
    this.applyColor(found.id, parsed, parsed.hex)
  },

  onToggleCustom() {
    this.setData({ customOpen: !this.data.customOpen, colorId: 'custom' })
    this.applyHsl(this.data.hue, this.data.light)
  },

  applyHsl(hue, light) {
    const rgb = colorUtil.hslToRgb(hue, 0.72, light / 100)
    const hex = colorUtil.rgbToHex(rgb.r, rgb.g, rgb.b)
    const hueLeft = (hue / 360) * 100
    const lightLeft = ((light - 28) / (94 - 28)) * 100
    this.setData({
      hue: hue,
      light: light,
      hueLeft: hueLeft,
      lightLeft: lightLeft,
      colorId: 'custom',
      colorHex: hex
    })
    this.color = rgb
    this.redraw(null)
  },

  barPoint(e, rect) {
    if (!rect || !rect.width) return 0
    const touch = e.touches[0]
    let p = (touch.clientX - rect.left) / rect.width
    if (p < 0) p = 0
    if (p > 1) p = 1
    return p
  },

  onHueStart(e) {
    const page = this
    wx.createSelectorQuery().in(this).select('#hueBar').boundingClientRect(function (rect) {
      page.hueRect = rect
      page.onHueMove(e)
    }).exec()
  },

  onHueMove(e) {
    if (!this.hueRect) return
    const hue = Math.round(this.barPoint(e, this.hueRect) * 360)
    this.applyHsl(hue, this.data.light)
  },

  onLightStart(e) {
    const page = this
    wx.createSelectorQuery().in(this).select('#lightBar').boundingClientRect(function (rect) {
      page.lightRect = rect
      page.onLightMove(e)
    }).exec()
  },

  onLightMove(e) {
    if (!this.lightRect) return
    const light = Math.round(28 + this.barPoint(e, this.lightRect) * (94 - 28))
    this.applyHsl(this.data.hue, light)
  },

  onHexInput(e) {
    this.setData({ hexInput: e.detail.value })
  },

  onHexBlur() {
    if (!String(this.data.hexInput || '').trim()) return
    this.onHexApply()
  },

  onHexApply() {
    const parsed = colorUtil.parseHex(this.data.hexInput)
    if (!parsed) {
      wx.showToast({ title: '请填 #438EDB 这样的颜色', icon: 'none' })
      return
    }
    this.applyColor('custom', parsed, parsed.hex)
  },

  onToggleBrush() {
    this.setData({ brushOpen: !this.data.brushOpen })
  },

  onMode(e) {
    this.setData({ brushMode: e.currentTarget.dataset.mode })
  },

  onSize(e) {
    this.setData({ brushSize: e.currentTarget.dataset.size })
  },

  onResetMask() {
    if (!this.autoMask) return
    this.mask = new Uint8Array(this.autoMask)
    this.redraw(null)
    wx.showToast({ title: '已恢复自动结果', icon: 'none' })
  },

  brushRadius() {
    const screen = BRUSH_SCREEN[this.data.brushSize] || 26
    return Math.max(2, screen * (this.maskW / this.data.viewW))
  },

  pointToMask(touch) {
    let x = touch.x
    let y = touch.y
    if (this.previewRect && touch.clientX != null) {
      x = touch.clientX - this.previewRect.left
      y = touch.clientY - this.previewRect.top
    }
    if (x == null || y == null) return null
    return {
      x: x * (this.maskW / this.data.viewW),
      y: y * (this.maskH / this.data.viewH)
    }
  },

  paintAt(touch) {
    if (!this.mask || !this.data.brushOpen || !touch) return
    const point = this.pointToMask(touch)
    if (!point) return
    const rect = cutoutLib.paintMask(
      this.mask,
      this.maskW,
      this.maskH,
      point.x,
      point.y,
      this.brushRadius(),
      this.data.brushMode
    )
    this.redraw(rect)
  },

  copyTouch(touch) {
    return {
      clientX: touch.clientX,
      clientY: touch.clientY,
      x: touch.x,
      y: touch.y
    }
  },

  onBrushStart(e) {
    const touch = this.copyTouch(e.touches[0])
    const page = this
    wx.createSelectorQuery().in(this).select('#preview').boundingClientRect(function (rect) {
      if (rect) page.previewRect = rect
      page.paintAt(touch)
    }).exec()
  },

  onBrushMove(e) {
    this.paintAt(this.copyTouch(e.touches[0]))
  },

  onBrushEnd() {},

  async onDone() {
    if (this.data.busy || this.data.exporting || !this.canvas) return
    this.setData({ exporting: true })
    wx.showLoading({ title: '正在生成', mask: true })
    try {
      this.redraw(null)
      const path = await image.canvasToJpeg(this, this.canvas, this.maskW, this.maskH, 0.92)
      const bytes = await image.getFileSize(path)
      session.update({
        currentPath: path,
        width: this.maskW,
        height: this.maskH,
        resultBytes: bytes,
        bgColor: this.data.colorHex,
        flow: 'background',
        compareFromBytes: 0,
        compareToBytes: 0,
        dimensionNote: this.scaledNote || '',
        overTarget: false
      })
      wx.hideLoading()
      nav.finish('/pages/result/result')
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '生成失败，请重试', icon: 'none' })
    }
    this.setData({ exporting: false })
  }
})
