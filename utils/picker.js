const permissions = require('./permissions')

function choose(source) {
  return new Promise(function (resolve, reject) {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: [source === 'camera' ? 'camera' : 'album'],
      sizeType: ['original'],
      camera: 'back',
      success: function (res) {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file || !file.tempFilePath) {
          reject(new Error('没有拿到照片'))
          return
        }
        resolve({
          path: file.tempFilePath,
          size: file.size || 0
        })
      },
      fail: function (err) {
        const msg = (err && err.errMsg) || ''
        if (msg.indexOf('cancel') >= 0) {
          const cancel = new Error('cancel')
          cancel.code = 'cancel'
          reject(cancel)
          return
        }
        permissions.handlePickFail(err, source)
        const wrapped = new Error(msg || 'pick')
        wrapped.code = 'fail'
        reject(wrapped)
      }
    })
  })
}

function consume(promise, onFile) {
  promise.then(onFile).catch(function (err) {
    if (!err || err.code === 'cancel' || err.code === 'fail') return
    wx.showToast({ title: '没能读取照片', icon: 'none' })
  })
}

module.exports = {
  choose: choose,
  consume: consume
}
