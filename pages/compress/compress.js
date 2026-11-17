const image = require('../../utils/image')
const session = require('../../utils/session')
const picker = require('../../utils/picker')
const compress = require('../../utils/compress')
const format = require('../../utils/format')
const nav = require('../../utils/nav')

Page({
  data: {
    src: '',
    preview: '',
    error: '',
    fromText: '',
    originPx: '',
    presets: [
      { kb: 20, label: '20KB' },
      { kb: 50, label: '50KB' },
      { kb: 100, label: '100KB' },
      { kb: 200, label: '200KB' }
    ],
    targetKb: 100,
    usingCustom: false,
    customKb: '',
    targetError: '',
    busy: false,
    busyText: '',
    note: '',
    done: false,
    skipped: false,
    resultText: '',
    resultPx: ''
  },

  onLoad(query) {
    this.alive = true
    const saved = session.get()
    if (query.hasImage === '1' && (saved.currentPath || saved.sourcePath)) {
      this.useFile({
        path: saved.currentPath || saved.sourcePath,
        size: 0
      })
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
        originalBytes: file.size || 0,
        flow: 'compress'
      })
      page.useFile(file)
    })
  },

  async useFile(file) {
    this.src = file.path
    this.fromBytes = file.size || 0
    this.resultPath = ''
    this.setData({
      src: file.path,
      preview: file.path,
      error: '',
      done: false,
      skipped: false,
      note: '',
      resultText: '',
      resultPx: '',
      fromText: this.fromBytes ? format.formatBytes(this.fromBytes) : '计算中…'
    })
    try {
      const info = await image.getImageInfo(file.path)
      if (!this.fromBytes) this.fromBytes = await image.getFileSize(file.path)
      if (!this.alive) return
      this.info = info
      this.setData({
        fromText: format.formatBytes(this.fromBytes),
        originPx: info.width + ' × ' + info.height
      })
    } catch (err) {
      this.setData({
        src: '',
        error: '没能读取这张照片，请换一张。'
      })
    }
  },

  onChip(e) {
    this.setData({
      targetKb: Number(e.currentTarget.dataset.kb),
      usingCustom: false,
      targetError: ''
    })
  },

  onCustomChip() {
    this.setData({ usingCustom: true, targetError: '' })
  },

  onCustomKb(e) {
    this.setData({ customKb: e.detail.value, usingCustom: true, targetError: '' })
  },

  resolveTarget() {
    if (!this.data.usingCustom) {
      return { ok: true, bytes: this.data.targetKb * 1024, label: this.data.targetKb + ' KB' }
    }
    const text = String(this.data.customKb || '').trim()
    if (!/^[0-9]+$/.test(text)) return { ok: false, message: '请填写整数 KB' }
    const kb = parseInt(text, 10)
    if (kb < 10 || kb > 10240) return { ok: false, message: '目标请填 10 到 10240 KB' }
    return { ok: true, bytes: kb * 1024, label: kb + ' KB' }
  },

  onCompress() {
    this.run(false)
  },

  onForce() {
    this.run(true)
  },

  async run(force) {
    if (this.data.busy || !this.src) return
    const target = this.resolveTarget()
    if (!target.ok) {
      this.setData({ targetError: target.message })
      return
    }
    const info = this.info
    const jpeg = info && (info.type === 'jpg' || info.type === 'jpeg')
    if (!force && jpeg && this.fromBytes > 0 && this.fromBytes <= target.bytes) {
      this.resultPath = this.src
      this.resultBytes = this.fromBytes
      this.resultW = info.width
      this.resultH = info.height
      this.overTarget = false
      this.noteText = '原图已经小于 ' + target.label + '，没有重新编码，这样更清晰。'
      this.setData({
        done: true,
        skipped: true,
        note: this.noteText,
        preview: this.src,
        resultText: format.formatBytes(this.fromBytes),
        resultPx: info.width + ' × ' + info.height,
        targetError: ''
      })
      return
    }

    this.setData({
      busy: true,
      busyText: '正在压缩…',
      note: '',
      done: false,
      skipped: false,
      targetError: ''
    })
    const page = this
    let tries = 0
    try {
      const packed = await compress.compressToTarget(this, this.src, target.bytes, async function (step) {
        tries += 1
        if (!page.alive) return
        page.setData({
          busyText: '正在压缩… 已试 ' + tries + ' 次，画质 ' + Math.round(step.quality * 100) + '%'
        })
        await image.sleep(16)
      })
      if (!this.alive) return
      const result = packed.result
      if (!result || !result.path) throw new Error('empty')
      const notes = []
      if (result.width !== packed.originalWidth || result.height !== packed.originalHeight) {
        notes.push(
          '为了压到目标大小，尺寸从 ' +
            packed.originalWidth +
            '×' +
            packed.originalHeight +
            ' 调整为 ' +
            result.width +
            '×' +
            result.height +
            '。'
        )
      }
      if (result.size > target.bytes) {
        notes.push('已经尽量压过了，仍比目标大一点。可以把目标调高，或换一张画面更简单的照片。')
      }
      this.resultPath = result.path
      this.resultBytes = result.size
      this.resultW = result.width
      this.resultH = result.height
      this.overTarget = result.size > target.bytes
      this.noteText = notes.join('')
      this.setData({
        busy: false,
        done: true,
        skipped: false,
        note: this.noteText,
        preview: result.path,
        resultText: format.formatBytes(result.size),
        resultPx: result.width + ' × ' + result.height
      })
    } catch (err) {
      if (!this.alive) return
      this.setData({ busy: false })
      wx.showToast({ title: '压缩失败，请换一张或重试', icon: 'none' })
    }
  },

  onUse() {
    if (!this.resultPath) return
    session.update({
      currentPath: this.resultPath,
      width: this.resultW,
      height: this.resultH,
      resultBytes: this.resultBytes,
      compareFromBytes: this.fromBytes,
      compareToBytes: this.resultBytes,
      dimensionNote: this.noteText || '',
      overTarget: !!this.overTarget,
      flow: 'compress'
    })
    nav.finish('/pages/result/result')
  }
})
