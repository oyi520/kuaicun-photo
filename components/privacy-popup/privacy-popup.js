Component({
  data: {
    show: false
  },

  lifetimes: {
    attached() {
      const app = getApp()
      const comp = this
      this._handler = function (resolve) {
        comp._resolve = resolve
        comp.setData({ show: true })
      }
      if (!app.globalData.privacyHandlers) app.globalData.privacyHandlers = []
      app.globalData.privacyHandlers.push(this._handler)
      if (app.globalData.pendingPrivacy) {
        const pending = app.globalData.pendingPrivacy
        app.globalData.pendingPrivacy = null
        this._handler(pending)
      }
    },

    detached() {
      const app = getApp()
      const list = (app.globalData && app.globalData.privacyHandlers) || []
      const index = list.indexOf(this._handler)
      if (index >= 0) list.splice(index, 1)
    }
  },

  methods: {
    noop() {},

    onAgree() {
      if (this._resolve) {
        this._resolve({ buttonId: 'agree-btn', event: 'agree' })
        this._resolve = null
      }
      this.setData({ show: false })
    },

    onDisagree() {
      if (this._resolve) {
        this._resolve({ event: 'disagree' })
        this._resolve = null
      }
      this.setData({ show: false })
      wx.showToast({ title: '未同意隐私指引，无法继续', icon: 'none' })
    }
  }
})
