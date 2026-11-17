/**
 * 运行时只申请这三项，不多要：
 * - 选图：wx.chooseMedia（相册 / 相机）
 * - 相机：scope.camera
 * - 保存：scope.writePhotosAlbum
 * 地理位置等 scope 才写进 app.json 的 permission。相册和相机写在公众平台的用户隐私保护指引里。
 */

function isCancel(err) {
  const msg = (err && err.errMsg) || ''
  return msg.indexOf('cancel') >= 0
}

function handlePickFail(err, source) {
  const msg = (err && err.errMsg) || ''
  if (msg.indexOf('cancel') >= 0) return
  if (msg.indexOf('privacy') >= 0) {
    wx.showModal({
      title: '需要同意隐私指引',
      content: '选择照片前要先同意隐私保护指引。照片只在本机处理，不会上传。如果没有弹出同意按钮，请到公众平台把「用户隐私保护指引」补全后再试。',
      showCancel: false,
      confirmText: '我知道了'
    })
    return
  }
  const camera = source === 'camera'
  wx.showModal({
    title: camera ? '无法使用相机' : '无法打开相册',
    content: camera
      ? '拍照需要相机权限。请到设置里允许使用相机，然后回来再点一次「拍照」。'
      : '选照片需要相册权限。请到设置里允许访问相册，然后回来再选一次。',
    confirmText: '去设置',
    cancelText: '取消',
    success: function (res) {
      if (res.confirm && wx.openSetting) wx.openSetting()
    }
  })
}

function saveToAlbum(filePath) {
  return new Promise(function (resolve, reject) {
    function fail(err, code) {
      const wrapped = err || new Error(code || 'save')
      wrapped.code = code || wrapped.code || 'save'
      reject(wrapped)
    }

    function writeOnce(done, notGranted) {
      wx.saveImageToPhotosAlbum({
        filePath: filePath,
        success: function () {
          done()
        },
        fail: function (err) {
          notGranted(err)
        }
      })
    }

    writeOnce(resolve, function (err) {
      const msg = (err && err.errMsg) || ''
      if (msg.indexOf('cancel') >= 0) {
        fail(err, 'cancel')
        return
      }
      const authDenied = msg.indexOf('auth') >= 0 || msg.indexOf('deny') >= 0 || msg.indexOf('authorize') >= 0 || msg.indexOf('privacy') >= 0
      if (!authDenied) {
        fail(err, 'save')
        return
      }
      wx.showModal({
        title: '需要相册权限',
        content: '保存照片需要允许写入相册。请到设置中打开「保存到相册」，然后回来再点一次保存。',
        confirmText: '去设置',
        cancelText: '取消',
        success: function (res) {
          if (!res.confirm) {
            fail(err, 'cancel')
            return
          }
          wx.openSetting({
            success: function (setting) {
              const granted = setting.authSetting && setting.authSetting['scope.writePhotosAlbum']
              if (!granted) {
                fail(err, 'deny')
                return
              }
              writeOnce(resolve, function (err2) {
                fail(err2, 'save')
              })
            },
            fail: function () {
              fail(err, 'deny')
            }
          })
        },
        fail: function () {
          fail(err, 'save')
        }
      })
    })
  })
}

module.exports = {
  isCancel: isCancel,
  handlePickFail: handlePickFail,
  saveToAlbum: saveToAlbum
}
