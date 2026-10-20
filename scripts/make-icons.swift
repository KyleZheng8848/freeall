import AppKit

let root = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : FileManager.default.currentDirectoryPath)
let assets = root.appendingPathComponent("assets")
try FileManager.default.createDirectory(at: assets, withIntermediateDirectories: true)

func color(_ hex: Int, a: CGFloat = 1) -> NSColor {
  NSColor(
    calibratedRed: CGFloat((hex >> 16) & 0xFF) / 255,
    green: CGFloat((hex >> 8) & 0xFF) / 255,
    blue: CGFloat(hex & 0xFF) / 255,
    alpha: a
  )
}

func roundedRect(_ rect: NSRect, radius: CGFloat) -> NSBezierPath {
  let p = NSBezierPath()
  p.appendRoundedRect(rect, xRadius: radius, yRadius: radius)
  return p
}

func drawAppIcon(size: CGFloat) -> NSImage {
  let img = NSImage(size: NSSize(width: size, height: size))
  img.lockFocus()
  NSGraphicsContext.current?.imageInterpolation = .high

  let bg = roundedRect(NSRect(x: 0, y: 0, width: size, height: size), radius: size * 0.223)
  color(0xF4EEDC).setFill()
  bg.fill()

  let inset = size * 0.18
  let ring = NSBezierPath(ovalIn: NSRect(x: inset, y: inset, width: size - inset * 2, height: size - inset * 2))
  ring.lineWidth = size * 0.055
  color(0x111111).setStroke()
  ring.stroke()

  let font = NSFont(name: "HelveticaNeue-Bold", size: size * 0.42)
    ?? NSFont.boldSystemFont(ofSize: size * 0.42)
  let text = NSString(string: "F")
  let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color(0x111111)]
  let ts = text.size(withAttributes: attrs)
  text.draw(at: NSPoint(x: (size - ts.width) / 2, y: (size - ts.height) / 2 - size * 0.01), withAttributes: attrs)
  img.unlockFocus()
  return img
}

enum TrayKind { case live, busy, down, empty }

/// 菜单栏图标：画在 16pt 逻辑尺寸上（输出 32px = @2x），比旧 22pt/44px 更贴系统状态栏。
func drawTray(into rect: NSRect, kind: TrayKind) {
  let size = rect.width
  // 收边距：小尺寸下多留墨，少留空白，避免「框太大字太小」
  let pad = size * 0.08
  let box = NSRect(x: rect.minX + pad, y: rect.minY + pad, width: size - pad * 2, height: size - pad * 2)
  let path = roundedRect(box, radius: box.width * 0.26)
  path.lineWidth = max(1.5, size * 0.09)
  let font = NSFont.boldSystemFont(ofSize: size * 0.48)
  let text = NSString(string: "F")
  let textSize = text.size(withAttributes: [.font: font])
  let origin = NSPoint(
    x: rect.minX + (size - textSize.width) / 2,
    y: rect.minY + (size - textSize.height) / 2 + size * 0.01
  )

  switch kind {
  case .live:
    NSColor.black.setFill()
    path.fill()
    NSGraphicsContext.current?.compositingOperation = .destinationOut
    text.draw(at: origin, withAttributes: [.font: font, .foregroundColor: NSColor.black])
    NSGraphicsContext.current?.compositingOperation = .sourceOver
  case .busy:
    NSColor.black.setStroke()
    path.stroke()
    text.draw(at: origin, withAttributes: [.font: font, .foregroundColor: NSColor.black])
    let bar = NSRect(x: rect.minX + size * 0.64, y: rect.minY + size * 0.16, width: size * 0.2, height: size * 0.09)
    NSColor.black.setFill()
    NSBezierPath(roundedRect: bar, xRadius: 1, yRadius: 1).fill()
  case .down:
    NSColor.black.setStroke()
    path.stroke()
    text.draw(at: origin, withAttributes: [.font: font, .foregroundColor: NSColor.black.withAlphaComponent(0.4)])
  case .empty:
    let thin = roundedRect(box, radius: box.width * 0.26)
    thin.lineWidth = max(1.25, size * 0.055)
    NSColor.black.withAlphaComponent(0.5).setStroke()
    thin.stroke()
    text.draw(at: origin, withAttributes: [.font: font, .foregroundColor: NSColor.black.withAlphaComponent(0.3)])
  }
}

func writePng(_ name: String, px: Int, draw: (NSRect) -> Void) {
  let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: px,
    pixelsHigh: px,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
  )!
  rep.size = NSSize(width: px, height: px)
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  NSGraphicsContext.current?.imageInterpolation = .high
  // clear
  NSColor.clear.setFill()
  NSRect(x: 0, y: 0, width: px, height: px).fill()
  draw(NSRect(x: 0, y: 0, width: CGFloat(px), height: CGFloat(px)))
  NSGraphicsContext.restoreGraphicsState()
  guard let data = rep.representation(using: .png, properties: [:]) else { return }
  try? data.write(to: assets.appendingPathComponent(name))
}

if !FileManager.default.fileExists(atPath: assets.appendingPathComponent("icon.png").path) {
  writePng("icon.png", px: 1024) { rect in
    drawAppIcon(size: rect.width).draw(in: rect)
  }
}

let trays: [(TrayKind, String)] = [
  (.live, "tray-live.png"),
  (.busy, "tray-busy.png"),
  (.down, "tray-down.png"),
  (.empty, "tray-empty.png"),
]
for (kind, name) in trays {
  // 32px @2x → 菜单栏 16pt（系统状态项常见尺寸；旧版 44px≈22pt 偏大）
  writePng(name, px: 32) { rect in drawTray(into: rect, kind: kind) }
}

print("icons → \(assets.path)")
