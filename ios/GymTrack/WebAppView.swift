import SafariServices
import SwiftUI
import WebKit

/// Koko näytön verkkonäkymä, jossa GymTrack-verkkosovellus pyörii.
struct WebAppView: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.setURLSchemeHandler(LocalSchemeHandler(), forURLScheme: LocalSchemeHandler.scheme)
        config.allowsInlineMediaPlayback = true
        config.defaultWebpagePreferences.preferredContentMode = .mobile

        let controller = WKUserContentController()
        controller.add(context.coordinator.bridge, name: "gymtrack")
        controller.addUserScript(WKUserScript(source: Self.bootstrapScript(), injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.userContentController = controller

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.isOpaque = false
        webView.backgroundColor = Theme.uiBackground
        webView.scrollView.backgroundColor = Theme.uiBackground
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = false
        if #available(iOS 16.4, *) { webView.isInspectable = true }

        AppModel.shared.webView = webView
        var url = LocalSchemeHandler.startURL
        if let hash = AppModel.shared.pendingHash, var comps = URLComponents(url: url, resolvingAgainstBaseURL: false) {
            comps.fragment = String(hash.dropFirst())
            url = comps.url ?? url
            AppModel.shared.pendingHash = nil
        }
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    /// Ajetaan ennen sivun omia skriptejä: kerrotaan sivulle, että se on iPhone-sovelluksessa,
    /// ja palautetaan tiedot varmuuskopiosta, jos selaintallennus on tyhjä.
    static func bootstrapScript() -> String {
        let version = (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? "1.0"
        var js = "window.GT_NATIVE = { platform: 'ios', version: \(AppModel.jsString(version)), widgets: true };\n"
        if let backup = StateBackup.load() {
            js += """
            try { if (!localStorage.getItem('gymtrack.v1')) localStorage.setItem('gymtrack.v1', \(AppModel.jsString(backup))); } catch (e) {}

            """
        }
        return js
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        let bridge = Bridge()

        // Sovelluksen omat sivut avataan näkymässä, ulkoiset linkit Safarissa.
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
            if url.scheme == LocalSchemeHandler.scheme || url.scheme == "about" || url.scheme == "blob" || url.scheme == "data" {
                decisionHandler(.allow); return
            }
            if navigationAction.targetFrame?.isMainFrame == false { decisionHandler(.allow); return }
            openExternally(url)
            decisionHandler(.cancel)
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            AppModel.shared.pageReady = false
        }

        // Jos iOS sulkee verkkonäkymän prosessin taustalla, ladataan sivu uudelleen.
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            AppModel.shared.pageReady = false
            webView.reload()
        }

        // target="_blank" ja window.open
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                     for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = navigationAction.request.url { openExternally(url) }
            return nil
        }

        func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                     initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
            guard let top = AppModel.topViewController() else { completionHandler(); return }
            top.present(alert, animated: true)
        }

        func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                     initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Peruuta", style: .cancel) { _ in completionHandler(false) })
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
            guard let top = AppModel.topViewController() else { completionHandler(false); return }
            top.present(alert, animated: true)
        }

        private func openExternally(_ url: URL) {
            if url.scheme == "http" || url.scheme == "https", let top = AppModel.topViewController() {
                let safari = SFSafariViewController(url: url)
                safari.preferredControlTintColor = UIColor(red: 229 / 255, green: 57 / 255, blue: 59 / 255, alpha: 1)
                top.present(safari, animated: true)
            } else {
                UIApplication.shared.open(url)
            }
        }
    }
}
