import AppKit
import Foundation
import PDFKit

// Read-only source rendering for calibration evidence. Page numbers are one based.
let arguments = CommandLine.arguments
guard arguments.count >= 4,
      let document = PDFDocument(url: URL(fileURLWithPath: arguments[1])) else {
    fputs("Usage: swift render-score-page.swift input.pdf output-directory page[,page...]\n", stderr)
    exit(1)
}
let output = URL(fileURLWithPath: arguments[2])
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
for number in arguments[3].split(separator: ",").compactMap({ Int($0) }) {
    guard number > 0, let page = document.page(at: number - 1) else {
        fatalError("Invalid PDF page \(number)")
    }
    let bounds = page.bounds(for: .mediaBox)
    let scale: CGFloat = 2
    let width = Int(bounds.width * scale)
    let height = Int(bounds.height * scale)
    let context = CGContext(
        data: nil, width: width, height: height, bitsPerComponent: 8,
        bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    )!
    context.setFillColor(NSColor.white.cgColor)
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    context.scaleBy(x: scale, y: scale)
    page.draw(with: .mediaBox, to: context)
    let image = NSBitmapImageRep(cgImage: context.makeImage()!)
    let path = output.appendingPathComponent("page-\(number).png")
    try image.representation(using: .png, properties: [:])!.write(to: path)
    print(path.path)
}
