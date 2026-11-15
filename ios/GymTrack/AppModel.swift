import UIKit
import WebKit

/// Pitää kirjaa verkkonäkymästä: syvälinkit widgeteistä ja ilmoituksista sekä odottavat kuittaukset.
final class AppModel {
    static let shared = AppModel()

    weak var webView: WKWebView?
    /// Sivu on latautunut ja js/native.js on käynnissä
    var pageReady = false
    /// Näkymä, joka avataan kun sivu on valmis (esim. widgetin napautus kylmäkäynnistyksessä)
    var pendingHash: String?

    /// gymtrack://food, gymtrack://today, gymtrack://reminders, gymtrack://task/<id>, gymtrack://body, gymtrack://workout
    func open(url: URL) {
        guard url.scheme == "gymtrack" else { return }
        let host = url.host ?? "today"
        let hash: String
        switch host {
        case "food": hash = "#/food"
        case "reminders": hash = "#/reminders"
        case "body": hash = "#/body"
        case "workout": hash = "#/home"
        case "report": hash = "#/report"
        case "task":
            let rid = url.pathComponents.dropFirst().first ?? ""
            hash = rid.isEmpty ? "#/today" : "#/today?r=" + (rid.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? rid)
        default: hash = "#/today"
        }
        open(hash: hash)
    }

    func open(hash: String) {
        guard let webView, pageReady else { pendingHash = hash; return }
        webView.evaluateJavaScript("location.hash = \(Self.jsString(hash));", completionHandler: nil)
    }

    func becameActive() {
        pullActions()
    }

    /// Pyydetään verkkosovellusta hakemaan widgetistä/ilmoituksesta tehdyt kuittaukset.
    func pullActions() {
        guard let webView, pageReady else { return }
        webView.evaluateJavaScript("window.GT && GT.native && GT.native.pull();", completionHandler: nil)
    }

    static func jsString(_ s: String) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: [s]),
              let json = String(data: data, encoding: .utf8) else { return "\"\"" }
        return String(json.dropFirst().dropLast())
    }

    static func topViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        var vc = scenes.flatMap(\.windows).first(where: \.isKeyWindow)?.rootViewController
        while let presented = vc?.presentedViewController { vc = presented }
        return vc
    }
}
