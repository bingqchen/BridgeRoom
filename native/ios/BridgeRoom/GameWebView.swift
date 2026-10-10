import SwiftUI
import WebKit
import UIKit

struct GameWebView: UIViewRepresentable {
    let entry: String

    func makeCoordinator() -> Coordinator { Coordinator(entry: entry) }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.add(context.coordinator, name: "bridgeRoom")
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = context.coordinator
        view.uiDelegate = context.coordinator
        view.isOpaque = false
        view.backgroundColor = UIColor(red: 0.06, green: 0.22, blue: 0.18, alpha: 1)
        view.scrollView.backgroundColor = view.backgroundColor
        view.scrollView.contentInsetAdjustmentBehavior = .never
        context.coordinator.attach(view)
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {}

    static func dismantleUIView(_ view: WKWebView, coordinator: Coordinator) {
        coordinator.shutdown()
        view.stopLoading()
        view.navigationDelegate = nil
        view.uiDelegate = nil
        view.configuration.userContentController.removeScriptMessageHandler(forName: "bridgeRoom")
    }

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
        private let entry: String
        private let transport = NearbyTransport()
        private weak var webView: WKWebView?
        private var allowedURL: URL?
        private var ready = false
        private var events: [[String: Any]] = []
        private var observers: [NSObjectProtocol] = []
        private var wasIdleDisabled = false
        private var stopped = false

        init(entry: String) {
            self.entry = entry
            super.init()
            transport.onEvent = { [weak self] event in self?.deliver(event) }
        }

        func attach(_ view: WKWebView) {
            webView = view
            wasIdleDisabled = UIApplication.shared.isIdleTimerDisabled
            UIApplication.shared.isIdleTimerDisabled = true
            observers = [
                NotificationCenter.default.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
                    self?.transport.setActive(false)
                },
                NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
                    self?.transport.setActive(true)
                }
            ]
            guard ["solo", "nearby"].contains(entry),
                  let url = Bundle.main.url(forResource: entry, withExtension: "html", subdirectory: "Web") else {
                view.loadHTMLString("<meta name='viewport' content='width=device-width'><p>The bundled game could not be found. Rebuild the app’s web assets and install again.</p>", baseURL: nil)
                return
            }
            allowedURL = url.resolvingSymlinksInPath().standardizedFileURL
            view.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        }

        func shutdown() {
            guard !stopped else { return }
            stopped = true
            transport.onEvent = nil
            transport.leave(notify: false)
            observers.forEach(NotificationCenter.default.removeObserver)
            observers = []; events = []
            UIApplication.shared.isIdleTimerDisabled = wasIdleDisabled
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard !stopped, message.name == "bridgeRoom", message.webView === webView,
                  message.frameInfo.isMainFrame, isAllowed(message.frameInfo.request.url),
                  let body = message.body as? [String: Any], JSONSerialization.isValidJSONObject(body),
                  let data = try? JSONSerialization.data(withJSONObject: body), data.count <= NearbyTransport.maximumFrame,
                  let type = body["type"] as? String else { return }
            if type == "ready" {
                ready = true
                let queued = events; events = []
                queued.forEach(deliver)
                transport.setActive(UIApplication.shared.applicationState == .active)
            } else if type == "copy", let text = body["text"] as? String, text.utf8.count <= 4096 {
                UIPasteboard.general.string = text
                deliver(["type": "status", "message": "Seat PIN copied. Share it with that player."])
            } else if type == "share", let text = body["text"] as? String, text.utf8.count <= 4096,
                      let view = webView, let presenter = presenter(for: view) {
                let activity = UIActivityViewController(activityItems: [text], applicationActivities: nil)
                if let popover = activity.popoverPresentationController {
                    popover.sourceView = view
                    popover.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
                    popover.permittedArrowDirections = []
                }
                presenter.present(activity, animated: true)
            } else if entry == "nearby", ready {
                transport.handle(body)
            }
        }

        private func isAllowed(_ url: URL?) -> Bool {
            guard let url, url.isFileURL, let allowedURL else { return false }
            return url.resolvingSymlinksInPath().standardizedFileURL.path == allowedURL.path
        }

        private func deliver(_ event: [String: Any]) {
            guard !stopped else { return }
            guard ready, let webView else {
                // Only setup/lifecycle events arrive before the local page is ready.
                if events.count < 64 { events.append(event) }
                return
            }
            webView.callAsyncJavaScript("if (typeof window.bridgeNativeEvent === 'function') { window.bridgeNativeEvent(event); }",
                                       arguments: ["event": event], in: nil, in: .page) { _ in }
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            // No remote navigation, new windows, subframes or arbitrary local files
            // may acquire the native transport bridge.
            guard navigationAction.targetFrame?.isMainFrame == true, isAllowed(navigationAction.request.url) else {
                decisionHandler(.cancel); return
            }
            decisionHandler(.allow)
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            ready = false; events = []
            transport.leave(notify: false)
            if let allowedURL { webView.loadFileURL(allowedURL, allowingReadAccessTo: allowedURL.deletingLastPathComponent()) }
        }

        func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                     initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
            guard frame.isMainFrame, isAllowed(frame.request.url), let presenter = presenter(for: webView) else {
                completionHandler(false); return
            }
            let alert = UIAlertController(title: "Bridge Room", message: String(message.prefix(2000)), preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
            alert.addAction(UIAlertAction(title: "Continue", style: .default) { _ in completionHandler(true) })
            presenter.present(alert, animated: true)
        }

        func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                     initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
            guard frame.isMainFrame, isAllowed(frame.request.url), let presenter = presenter(for: webView) else {
                completionHandler(); return
            }
            let alert = UIAlertController(title: "Bridge Room", message: String(message.prefix(2000)), preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
            presenter.present(alert, animated: true)
        }

        private func presenter(for view: WKWebView) -> UIViewController? {
            var controller = view.window?.rootViewController
            while let presented = controller?.presentedViewController { controller = presented }
            guard !(controller is UIAlertController) else { return nil }
            return controller
        }
    }
}
