/** 页面层数有限。太深时重新打开，会话仍留在内存里。 */

function open(url) {
  const depth = getCurrentPages().length
  if (depth >= 8) {
    wx.reLaunch({ url: url })
    return
  }
  wx.navigateTo({
    url: url,
    fail: function () {
      wx.reLaunch({ url: url })
    }
  })
}

function finish(url) {
  wx.redirectTo({
    url: url,
    fail: function () {
      wx.reLaunch({ url: url })
    }
  })
}

module.exports = {
  open: open,
  finish: finish
}
