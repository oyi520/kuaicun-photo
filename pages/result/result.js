const session = require('../../utils/session')
const format = require('../../utils/format')
const image = require('../../utils/image')
const permissions = require('../../utils/permissions')
const nav = require('../../utils/nav')

Page({
  data: {
    missing: false,
    path: '',
    sizeName: '',
    sizeText: '',
    bytesText: '',
    bgColor: '',
    fromText: '',
    toText: '',
    dimensionNote: '',
    overTarget: false,
    denied: false
  },

  onLoad() {
    const saved = session.get()
    if (!saved.currentPath) {
      this.setData({ missing: true })
      return
    }
    this.path = saved.currentPath
    this.setData({
      path: saved.currentPath,
      sizeName: saved.sizeName || '',
      sizeText: saved.width ? format.formatPx(saved.width, saved.height) : '',
      bytesText: saved.resultBytes ? format.formatBytes(saved.resultBytes) : '',
      bgColor: saved.bgColor || '',
      fromText: saved.compareFromBytes ? format.formatBytes(saved.compareFromBytes) : '',
      toText: saved.compareToBytes ? format.formatBytes(saved.compareToBytes) : '',
      dimensionNote: saved.dimensionNote || '',
      overTarget: !!saved.overTarget
    })
    if (!saved.resultBytes) this.fillSize(saved.currentPath)
  },

  async fillSize(path) {
    try {
      const bytes = await image.getFileSize(path)
      session.update({ resultBytes: bytes })
      this.setData({ bytesText: format.formatBytes(bytes) })
    } catch (err) {
      // 体积读不到也不挡住保存。
    }
  },

  onSave() {
    const page = this
    permissions.saveToAlbum(this.path).then(
      function () {
        page.setData({ denied: false })
        wx.showToast({ title: '已保存到相册', icon: 'success' })
      },
      function (err) {
        if (err && (err.code === 'cancel' || err.code === 'deny')) {
          page.setData({ denied: true })
          return
        }
        wx.showToast({ title: '保存失败，请再试一次', icon: 'none' })
      }
    )
  },

  onRecolor() {
    nav.open('/pages/background/background?hasImage=1')
  },

  onCompress() {
    nav.open('/pages/compress/compress?hasImage=1')
  },

  onResize() {
    nav.open('/pages/size/size?reuse=1')
  },

  goHome() {
    wx.reLaunch({ url: '/pages/index/index' })
  }
})
