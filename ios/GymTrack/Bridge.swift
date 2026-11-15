import UIKit
import WebKit
import WidgetKit

/// Viestit verkkosovelluksesta (js/native.js): window.webkit.messageHandlers.gymtrack.postMessage({ type, id, ... })
/// Jokaiseen viestiin vastataan kutsumalla sivulla GT.native._reply(id, vastaus), joten JS saa vastauksen Promisena.
final class Bridge: NSObject, WKScriptMessageHandler {
    private var reloadWork: DispatchWorkItem?

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        let id = (body["id"] as? NSNumber)?.intValue ?? 0
        weak var webView = message.webView
        let replyHandler: (Any?, String?) -> Void = { value, error in
            DispatchQueue.main.async {
                guard id > 0, let webView else { return }
                var payload: Any = value ?? ["ok": false, "error": error ?? ""]
                if !JSONSerialization.isValidJSONObject(payload) { payload = ["ok": true] }
                guard let data = try? JSONSerialization.data(withJSONObject: payload),
                      let json = String(data: data, encoding: .utf8) else { return }
                webView.evaluateJavaScript("window.GT && GT.native && GT.native._reply(\(id), \(json));", completionHandler: nil)
            }
        }
        switch type {
        case "ready":
            AppModel.shared.pageReady = true
            let actions = SharedStore.drainActions().map(\.dictionary)
            replyHandler(["actions": actions], nil)
            if let hash = AppModel.shared.pendingHash {
                AppModel.shared.pendingHash = nil
                AppModel.shared.open(hash: hash)
            }

        case "drain":
            replyHandler(["actions": SharedStore.drainActions().map(\.dictionary)], nil)

        case "sync":
            handleSync(body)
            replyHandler(["ok": true], nil)

        case "notifStatus":
            Notifications.status { replyHandler(["permission": $0], nil) }

        case "notifRequest":
            Notifications.request { granted in replyHandler(["granted": granted], nil) }

        case "notifTest":
            Notifications.test(delay: (body["delay"] as? NSNumber)?.doubleValue ?? 5)
            replyHandler(["ok": true], nil)

        case "saveFile":
            share(text: body["text"] as? String ?? "", filename: body["filename"] as? String ?? "gymtrack.json")
            replyHandler(["ok": true], nil)

        case "openSettings":
            if let url = URL(string: UIApplication.openNotificationSettingsURLString) { UIApplication.shared.open(url) }
            replyHandler(["ok": true], nil)

        default:
            replyHandler(nil, "Tuntematon viesti: \(type)")
        }
    }

    private func handleSync(_ body: [String: Any]) {
        if let widget = body["widget"], JSONSerialization.isValidJSONObject(widget),
           let data = try? JSONSerialization.data(withJSONObject: widget) {
            if SharedStore.saveSnapshot(data: data) { scheduleWidgetReload() }
        }
        if let list = body["notifications"] as? [[String: Any]] {
            Notifications.schedule(list)
        }
        if let state = body["state"] as? String {
            StateBackup.save(state)
        }
    }

    /// Widgetit päivitetään korkeintaan kerran sekunnissa.
    private func scheduleWidgetReload() {
        reloadWork?.cancel()
        let work = DispatchWorkItem { WidgetCenter.shared.reloadAllTimelines() }
        reloadWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 1, execute: work)
    }

    private func share(text: String, filename: String) {
        let safe = filename.replacingOccurrences(of: "/", with: "-")
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(safe)
        do { try Data(text.utf8).write(to: url, options: .atomic) } catch { return }
        guard let top = AppModel.topViewController() else { return }
        let vc = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        if let pop = vc.popoverPresentationController {
            pop.sourceView = top.view
            pop.sourceRect = CGRect(x: top.view.bounds.midX, y: top.view.bounds.maxY - 80, width: 1, height: 1)
        }
        top.present(vc, animated: true)
    }
}

/// Varmuuskopio sovelluksen tiedoista. Jos iOS joskus tyhjentäisi verkkonäkymän tallennustilan,
/// tiedot palautetaan tästä automaattisesti käynnistyksessä.
enum StateBackup {
    private static var url: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("gymtrack-state.json")
    }

    static func save(_ json: String) {
        guard !json.isEmpty else { return }
        try? Data(json.utf8).write(to: url, options: .atomic)
    }

    static func load() -> String? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return String(data: data, encoding: .utf8)
    }
}
