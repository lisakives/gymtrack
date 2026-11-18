import Foundation
import UniformTypeIdentifiers
import WebKit

/// Tarjoilee sovelluksen mukana tulevat verkkotiedostot (kansio "web") osoitteesta gtapp://localhost/.
/// Näin sovellus toimii ilman verkkoyhteyttä ja tiedot säilyvät sovelluksen omassa tallennustilassa.
final class LocalSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "gtapp"
    static let startURL = URL(string: "gtapp://localhost/index.html")!

    private let root: URL = (Bundle.main.resourceURL ?? Bundle.main.bundleURL).appendingPathComponent("web", isDirectory: true)

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else {
            task.didFailWithError(URLError(.badURL)); return
        }
        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        let file = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
        let inside = file.path.hasPrefix(root.standardizedFileURL.path)

        guard inside, let data = try? Data(contentsOf: file) else {
            let resp = HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "text/plain"])!
            task.didReceive(resp)
            task.didReceive(Data("Not found".utf8))
            task.didFinish()
            return
        }
        let headers = [
            "Content-Type": Self.mime(for: file.pathExtension),
            "Content-Length": String(data.count),
            "Cache-Control": "no-cache"
        ]
        let resp = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!
        task.didReceive(resp)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

    static func mime(for ext: String) -> String {
        switch ext.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js", "mjs": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json", "webmanifest": return "application/json; charset=utf-8"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        default: return UTType(filenameExtension: ext)?.preferredMIMEType ?? "application/octet-stream"
        }
    }
}
