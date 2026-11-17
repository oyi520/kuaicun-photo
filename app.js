App({
  globalData: {
    session: null,
    privacyHandlers: [],
    pendingPrivacy: null
  },

  onLaunch() {
    this.hideShare()
    if (!wx.onNeedPrivacyAuthorization) return
    const app = this
    wx.onNeedPrivacyAuthorization(function (resolve) {
      const list = app.globalData.privacyHandlers
      const handler = list[list.length - 1]
      if (handler) handler(resolve)
      else app.globalData.pendingPrivacy = resolve
    })
  },

  onShow() {
    this.hideShare()
  },

  hideShare() {
    if (!wx.hideShareMenu) return
    wx.hideShareMenu({
      menus: ['shareAppMessage', 'shareTimeline']
    })
  }
})
