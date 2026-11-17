const sizes = require('../../utils/sizes')
const session = require('../../utils/session')
const picker = require('../../utils/picker')
const nav = require('../../utils/nav')

Page({
  data: {
    presets: sizes.PRESETS,
    selectedId: '1cun',
    customW: '',
    customH: '',
    customError: '',
    usingCustom: false,
    reuse: false,
    reuseNote: '',
    willText: '一寸 295×413'
  },

  onLoad(query) {
    const existing = session.get()
    const reuse = query.reuse === '1' && !!(existing.sourcePath || existing.currentPath)
    const patch = {
      reuse: reuse,
      reuseNote: existing.bgColor
        ? '会从原来的照片重新裁剪。之前换上的底色要再做一次。'
        : '当前照片还在，可以直接用它重新裁剪，也可以另选一张。'
    }
    if (reuse && existing.sizeId && existing.sizeId !== 'custom') {
      patch.selectedId = existing.sizeId
      const preset = sizes.findPreset(existing.sizeId)
      if (preset) patch.willText = preset.name + ' ' + preset.width + '×' + preset.height
    }
    if (reuse && existing.sizeId === 'custom') {
      patch.usingCustom = true
      patch.customW = String(existing.targetW || '')
      patch.customH = String(existing.targetH || '')
      patch.willText = '自定义 ' + existing.targetW + '×' + existing.targetH
      this._w = patch.customW
      this._h = patch.customH
    }
    this.setData(patch)
  },

  onSelect(e) {
    const id = e.currentTarget.dataset.id
    const preset = sizes.findPreset(id)
    this.setData({
      selectedId: id,
      usingCustom: false,
      customError: '',
      willText: preset ? preset.name + ' ' + preset.width + '×' + preset.height : ''
    })
  },

  onCustomW(e) {
    this._w = e.detail.value
    this.setData({ customW: this._w, usingCustom: true })
    this.refreshCustom(this._w, this._h || '')
  },

  onCustomH(e) {
    this._h = e.detail.value
    this.setData({ customH: this._h, usingCustom: true })
    this.refreshCustom(this._w || '', this._h)
  },

  refreshCustom(widthValue, heightValue) {
    const widthText = widthValue == null ? this.data.customW : widthValue
    const heightText = heightValue == null ? this.data.customH : heightValue
    const result = sizes.validateCustom(widthText, heightText)
    if (result.ok) {
      this.setData({
        customError: '',
        willText: '自定义 ' + result.width + '×' + result.height
      })
      return
    }
    const bothFilled = String(widthText).trim() && String(heightText).trim()
    this.setData({
      customError: bothFilled ? result.message : '',
      willText: '自定义像素'
    })
  },

  captureSelection() {
    if (this.data.usingCustom) {
      const result = sizes.validateCustom(this._w || this.data.customW, this._h || this.data.customH)
      if (!result.ok) {
        this.setData({ customError: result.message })
        wx.showToast({ title: result.message, icon: 'none' })
        return null
      }
      return result
    }
    return sizes.findPreset(this.data.selectedId)
  },

  remember(sel, file) {
    const prev = session.get()
    session.update({
      sourcePath: file ? file.path : (prev.sourcePath || prev.currentPath),
      currentPath: file ? file.path : (prev.sourcePath || prev.currentPath),
      originalBytes: file && file.size ? file.size : prev.originalBytes || 0,
      targetW: sel.width,
      targetH: sel.height,
      sizeId: sel.id,
      sizeName: sel.name,
      flow: 'size',
      bgColor: '',
      dimensionNote: '',
      compareFromBytes: 0,
      compareToBytes: 0,
      overTarget: false
    })
    nav.open('/pages/crop/crop')
  },

  onCamera() {
    const sel = this.captureSelection()
    if (!sel) return
    const page = this
    picker.consume(picker.choose('camera'), function (file) {
      page.remember(sel, file)
    })
  },

  onAlbum() {
    const sel = this.captureSelection()
    if (!sel) return
    const page = this
    picker.consume(picker.choose('album'), function (file) {
      page.remember(sel, file)
    })
  },

  onUseCurrent() {
    const sel = this.captureSelection()
    if (!sel) return
    const prev = session.get()
    if (!prev.sourcePath && !prev.currentPath) {
      wx.showToast({ title: '没有可继续使用的照片', icon: 'none' })
      return
    }
    this.remember(sel, null)
  }
})
