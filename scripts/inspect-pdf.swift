import AppKit
import PDFKit

let args = CommandLine.arguments
if args.count < 3 { fatalError("Usage: swift scripts/inspect-pdf.swift input.pdf output-directory") }
let input = URL(fileURLWithPath: args[1])
let directory = URL(fileURLWithPath: args[2])
try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
guard let document = PDFDocument(url: input) else { fatalError("Cannot open PDF") }
var pages: [[String: Any]] = []
for index in 0..<document.pageCount {
    guard let page = document.page(at: index) else { fatalError("Missing page") }
    let bounds = page.bounds(for: .mediaBox)
    let image = page.thumbnail(of: NSSize(width: 1400, height: 1400), for: .mediaBox)
    guard let tiff = image.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff), let png = bitmap.representation(using: .png, properties: [:]) else { fatalError("Cannot render page") }
    let name = String(format: "page-%02d.png", index + 1)
    try png.write(to: directory.appendingPathComponent(name))
    pages.append(["page": index+1, "width": bounds.width, "height": bounds.height, "image": name, "text": page.string ?? ""])
}
let data = try JSONSerialization.data(withJSONObject: ["source": input.path, "pages": pages], options: [.prettyPrinted, .sortedKeys])
try data.write(to: directory.appendingPathComponent("inspection.json"))
print("Rendered \(document.pageCount) pages to \(directory.path)")
