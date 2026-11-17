const crop = require('../../utils/crop')
const image = require('../../utils/image')
const session = require('../../utils/session')
const picker = require('../../utils/picker')
const nav = require('../../utils/nav')

Page({
  data: {
    missing: false,
    src: '',
    ready: false,
    exporting: false,
    sizeName: '',
    targetW: 0,
    targetH: 0,
    dispW: 0,
    dispH: 0,
    tx: 0,
    ty: 0,
    frameX: 0,
    frameY: 0,
    frameW: 0,
    frameH: 0,
    tooSmall: false
  },

  onLoad() {
    const saved = session.get()
    const src = saved.sourcePath || saved.currentPath
    if (!saved.targetW || !saved.targetH || !src) {
      this.setData({ missing: true })
      return
    }
    this.targetW = saved.targetW
    this.targetH = saved.targetH
    this.src = src
    this.userScale = 1
    this.layoutGen = 0
    this.setData({
      src: src,
      sizeName: saved.sizeName || '证件照',
      targetW: saved.targetW,
      targetH: saved.targetH
    })
    this.prepare()
  },

  onReady() {
    this.viewReady = true
    this.tryLayout()
  },

  async prepare() {
    const gen = this.layoutGen || 0
    try {
      const info = await image.getImageInfo(this.src)
      if ((this.layoutGen || 0) !== gen) return
      this.iw = info.width
      this.ih = info.height
      this.infoReady = true
      this.tryLayout()
    } catch (err) {
      if ((this.layoutGen || 0) !== gen) return
      wx.showToast({ title: '这张照片读不了', icon: 'none' })
      this.setData({ missing: true })
    }
  },

  tryLayout() {
    if (!this.viewReady || !this.infoReady || this.laidOut || this.layouting || this.data.missing) return
    this.layouting = true
    const page = this
    const gen = this.layoutGen || 0
    wx.createSelectorQuery().in(this).select('.stage').boundingClientRect(function (rect) {
      if ((page.layoutGen || 0) !== gen) return
      page.layouting = false
      if (!rect || rect.width < 20 || rect.height < 20) {
        page.layoutTries = (page.layoutTries || 0) + 1
        if (page.layoutTries > 30) {
          wx.showToast({ title: '页面还没排好，请返回重进', icon: 'none' })
          return
        }
        setTimeout(function () {
          page.tryLayout()
        }, 60)
        return
      }
      page.laidOut = true
      page.layout(rect)
    }).exec()
  },

  layout(rect) {
    this.stageLeft = rect.left
    this.stageTop = rect.top
    const frame = crop.frameInStage(rect.width, rect.height, this.targetW, this.targetH)
    const place = crop.initialPlacement(this.iw, this.ih, frame)
    this.frame = frame
    this.cover = place.cover
    this.userScale = 1
    this.tx = place.tx
    this.ty = place.ty
    this.setData({
      frameX: frame.frameX,
      frameY: frame.frameY,
      frameW: frame.frameW,
      frameH: frame.frameH,
      tx: place.tx,
      ty: place.ty,
      dispW: place.dispW,
      dispH: place.dispH,
      tooSmall: this.iw < this.targetW || this.ih < this.targetH,
      ready: true
    })
  },

  applyTransform(tx, ty, userScale) {
    const size = crop.placementSize(this.iw, this.ih, this.cover, userScale)
    const fixed = crop.constrain(tx, ty, size.dispW, size.dispH, this.frame)
    this.tx = fixed.tx
    this.ty = fixed.ty
    this.userScale = userScale
    this.setData({
      tx: fixed.tx,
      ty: fixed.ty,
      dispW: size.dispW,
      dispH: size.dispH
    })
  },

  localPoint(touch) {
    return {
      x: touch.clientX - this.stageLeft,
      y: touch.clientY - this.stageTop
    }
  },

  onTouchStart(e) {
    if (!this.data.ready) return
    this.track(e.touches)
  },

  onTouchMove(e) {
    if (!this.data.ready) return
    const touches = e.touches
    if (touches.length >= 2) {
      if (!this.pinch) {
        this.track(touches)
        return
      }
      const a = this.localPoint(touches[0])
      const b = this.localPoint(touches[1])
      const dist = Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2))
      const midX = (a.x + b.x) / 2
      const midY = (a.y + b.y) / 2
      let scale = this.pinch.scale * (dist / this.pinch.dist)
      if (scale < 1) scale = 1
      if (scale > 5) scale = 5
      const oldScale = this.cover * this.pinch.scale
      const newScale = this.cover * scale
      const ix = (this.pinch.midX - this.pinch.tx) / oldScale
      const iy = (this.pinch.midY - this.pinch.ty) / oldScale
      this.applyTransform(midX - ix * newScale, midY - iy * newScale, scale)
      return
    }
    if (touches.length === 1) {
      if (!this.pan || this.pinch) {
        this.pinch = null
        this.pan = {
          x: touches[0].clientX,
          y: touches[0].clientY,
          tx: this.tx,
          ty: this.ty
        }
        return
      }
      const dx = touches[0].clientX - this.pan.x
      const dy = touches[0].clientY - this.pan.y
      this.applyTransform(this.pan.tx + dx, this.pan.ty + dy, this.userScale)
    }
  },

  onTouchEnd(e) {
    if (e.touches && e.touches.length) this.track(e.touches)
    else {
      this.pinch = null
      this.pan = null
    }
  },

  track(touches) {
    if (touches.length >= 2) {
      const a = this.localPoint(touches[0])
      const b = this.localPoint(touches[1])
      this.pan = null
      this.pinch = {
        dist: Math.max(1, Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2))),
        scale: this.userScale,
        tx: this.tx,
        ty: this.ty,
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2
      }
      return
    }
    this.pinch = null
    this.pan = {
      x: touches[0].clientX,
      y: touches[0].clientY,
      tx: this.tx,
      ty: this.ty
    }
  },

  replaceWith(file) {
    this.layoutGen = (this.layoutGen || 0) + 1
    this.src = file.path
    this.laidOut = false
    this.layouting = false
    this.layoutTries = 0
    this.infoReady = false
    this.setData({ src: file.path, ready: false })
    session.update({
      sourcePath: file.path,
      currentPath: file.path,
      originalBytes: file.size || 0
    })
    this.prepare()
  },

  onCamera() {
    const page = this
    picker.consume(picker.choose('camera'), function (file) {
      page.replaceWith(file)
    })
  },

  onAlbum() {
    const page = this
    picker.consume(picker.choose('album'), function (file) {
      page.replaceWith(file)
    })
  },

  onExport() {
    this.exportTo(false)
  },

  onExportBg() {
    this.exportTo(true)
  },

  async exportTo(goBackground) {
    if (this.data.exporting || !this.data.ready) return
    this.setData({ exporting: true })
    wx.showLoading({ title: '正在导出', mask: true })
    try {
      const size = crop.placementSize(this.iw, this.ih, this.cover, this.userScale)
      const fixed = crop.constrain(this.tx, this.ty, size.dispW, size.dispH, this.frame)
      const rect = crop.sourceRect(fixed.tx, fixed.ty, size.displayScale, this.frame, this.iw, this.ih)
      const rendered = await image.renderJpeg(this, {
        src: this.src,
        sx: rect.sx,
        sy: rect.sy,
        sw: rect.sw,
        sh: rect.sh,
        destWidth: this.targetW,
        destHeight: this.targetH,
        quality: 0.92,
        selector: '#workCanvas',
        offscreen: true
      })
      const bytes = await image.getFileSize(rendered.path)
      const saved = session.get()
      session.update({
        currentPath: rendered.path,
        width: this.targetW,
        height: this.targetH,
        resultBytes: bytes,
        originalBytes: saved.originalBytes || bytes,
        compareFromBytes: 0,
        compareToBytes: 0,
        dimensionNote: '',
        bgColor: '',
        overTarget: false,
        flow: 'size'
      })
      wx.hideLoading()
      if (goBackground) nav.open('/pages/background/background?hasImage=1')
      else nav.finish('/pages/result/result')
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '导出失败，请重试', icon: 'none' })
    }
    this.setData({ exporting: false })
  },

  goHome() {
    wx.reLaunch({ url: '/pages/index/index' })
  }
})
