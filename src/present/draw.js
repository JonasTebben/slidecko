// drawing while presenting: a pointer position on the shown slide (its screen rect) in logical slide units,
// so a stroke stays in place when the window or the presenter view changes the scale
export const slidePoint = (x, y, rect, w, h) => [Math.round(((x - rect.left) / rect.width) * w * 10) / 10, Math.round(((y - rect.top) / rect.height) * h * 10) / 10]
// the two barbs of an arrow from a to b, sized to the stroke: [barb, tip, barb] for a polyline
export function arrowHead([ax, ay], [bx, by], width) {
  const ang = Math.atan2(by - ay, bx - ax), len = 10 + width * 3, r = v => Math.round(v * 10) / 10
  const barb = d => [r(bx - len * Math.cos(ang + d)), r(by - len * Math.sin(ang + d))]
  return [barb(0.45), [bx, by], barb(-0.45)]
}
