const EMPTY = {
  sourcePath: '',
  currentPath: '',
  originalBytes: 0,
  resultBytes: 0,
  width: 0,
  height: 0,
  sizeId: '',
  sizeName: '',
  targetW: 0,
  targetH: 0,
  bgColor: '',
  flow: '',
  compareFromBytes: 0,
  compareToBytes: 0,
  dimensionNote: '',
  overTarget: false
}

function store() {
  const app = getApp()
  if (!app.globalData) app.globalData = {}
  if (!app.globalData.session) app.globalData.session = Object.assign({}, EMPTY)
  return app.globalData.session
}

function reset(partial) {
  const app = getApp()
  if (!app.globalData) app.globalData = {}
  app.globalData.session = Object.assign({}, EMPTY, partial || {})
  return app.globalData.session
}

function update(partial) {
  return Object.assign(store(), partial || {})
}

function get() {
  return Object.assign({}, store())
}

module.exports = {
  reset: reset,
  update: update,
  get: get
}
