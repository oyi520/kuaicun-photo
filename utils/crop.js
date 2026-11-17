/** 裁剪框几何。页面只负责手势，导出用这里的源图矩形。 */

function clamp(v, min, max) {
  if (v < min) return min
  if (v > max) return max
  return v
}

function frameInStage(stageW, stageH, targetW, targetH, margin) {
  const m = margin == null ? 0.86 : margin
  const aspect = targetW / targetH
  const maxW = stageW * m
  const maxH = stageH * m
  let frameW
  let frameH
  if (maxW / maxH > aspect) {
    frameH = maxH
    frameW = frameH * aspect
  } else {
    frameW = maxW
    frameH = frameW / aspect
  }
  return {
    frameX: (stageW - frameW) / 2,
    frameY: (stageH - frameH) / 2,
    frameW: frameW,
    frameH: frameH
  }
}

function coverScale(iw, ih, frameW, frameH) {
  return Math.max(frameW / iw, frameH / ih)
}

function initialPlacement(iw, ih, frame) {
  const cover = coverScale(iw, ih, frame.frameW, frame.frameH)
  const dispW = iw * cover
  const dispH = ih * cover
  return {
    cover: cover,
    userScale: 1,
    dispW: dispW,
    dispH: dispH,
    tx: frame.frameX + (frame.frameW - dispW) / 2,
    ty: frame.frameY + (frame.frameH - dispH) / 2
  }
}

function placementSize(iw, ih, cover, userScale) {
  const displayScale = cover * userScale
  return {
    dispW: iw * displayScale,
    dispH: ih * displayScale,
    displayScale: displayScale
  }
}

function constrain(tx, ty, dispW, dispH, frame) {
  let nx
  let ny
  if (dispW <= frame.frameW + 0.5) {
    nx = frame.frameX + (frame.frameW - dispW) / 2
  } else {
    nx = clamp(tx, frame.frameX + frame.frameW - dispW, frame.frameX)
  }
  if (dispH <= frame.frameH + 0.5) {
    ny = frame.frameY + (frame.frameH - dispH) / 2
  } else {
    ny = clamp(ty, frame.frameY + frame.frameH - dispH, frame.frameY)
  }
  return { tx: nx, ty: ny }
}

function sourceRect(tx, ty, displayScale, frame, iw, ih) {
  let sx = (frame.frameX - tx) / displayScale
  let sy = (frame.frameY - ty) / displayScale
  let sw = frame.frameW / displayScale
  let sh = frame.frameH / displayScale
  if (sw > iw) sw = iw
  if (sh > ih) sh = ih
  if (sx < 0) sx = 0
  if (sy < 0) sy = 0
  if (sx + sw > iw) sx = Math.max(0, iw - sw)
  if (sy + sh > ih) sy = Math.max(0, ih - sh)
  return { sx: sx, sy: sy, sw: sw, sh: sh }
}

module.exports = {
  clamp: clamp,
  frameInStage: frameInStage,
  coverScale: coverScale,
  initialPlacement: initialPlacement,
  placementSize: placementSize,
  constrain: constrain,
  sourceRect: sourceRect
}
