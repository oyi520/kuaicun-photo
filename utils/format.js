function formatBytes(bytes) {
  const n = Number(bytes)
  if (!isFinite(n) || n < 0) return '0 B'
  if (n < 1024) return Math.round(n) + ' B'
  if (n < 1024 * 1024) {
    const kb = n / 1024
    return (kb >= 100 ? kb.toFixed(0) : kb.toFixed(1)) + ' KB'
  }
  return (n / (1024 * 1024)).toFixed(2) + ' MB'
}

function formatPx(width, height) {
  return width + ' × ' + height + ' 像素'
}

module.exports = {
  formatBytes: formatBytes,
  formatPx: formatPx
}
