const session = require('../../utils/session')

Page({
  goSize() {
    session.reset({ flow: 'size' })
    wx.navigateTo({ url: '/pages/size/size' })
  },

  goBackground() {
    session.reset({ flow: 'background' })
    wx.navigateTo({ url: '/pages/background/background' })
  },

  goCompress() {
    session.reset({ flow: 'compress' })
    wx.navigateTo({ url: '/pages/compress/compress' })
  }
})
