import SwiftUI
import WebKit

/// `UIViewRepresentable` wrapper around `WKWebView`.
///
/// Serves the Angular bundle via `BundleSchemeHandler` under the custom
/// `app://` scheme, which avoids WKWebView's `file://` sandbox restrictions
/// on physical iOS devices.
@MainActor
struct WebView: UIViewRepresentable {
    /// Called once on the first successful navigation, used to dismiss the
    /// native splash overlay in `ContentView`.
    var onLoaded: (() -> Void)? = nil

    func makeCoordinator() -> WebBridge {
        WebBridge(onLoaded: onLoaded)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: BundleSchemeHandler.scheme)
        config.userContentController.add(context.coordinator, name: "nativeBridge")
        // Prevent media elements from triggering full-screen interruptions.
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let webView = WKWebView(frame: .zero, configuration: config)
        // Match the app's --bg-primary surface color so the WKWebView renders
        // the correct background before the first HTML paint, eliminating the
        // white flash that appears while the Angular bundle loads.
        webView.backgroundColor = UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0.173, green: 0.173, blue: 0.180, alpha: 1) // #2C2C2E
                : UIColor(red: 0.969, green: 0.969, blue: 0.969, alpha: 1) // #f7f7f7
        }
        webView.isOpaque = false
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = false
        // Disable link-preview long-press (3D/Haptic Touch) — eliminates the
        // ~300 ms timer WKWebView starts on every touch near an <a> element.
        webView.allowsLinkPreview = false
        context.coordinator.webView = webView

        // Angular manages all scrollable areas via CSS overflow — disabling the
        // WKWebView's own root scroll removes the dual-scroll conflict that causes
        // gesture gate timeouts.
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.bounces = false
        webView.scrollView.decelerationRate = .normal

        // By default UIScrollView holds touch events for ~150 ms to classify
        // scroll vs. tap gestures. Clearing these flags delivers touches to web
        // content immediately, eliminating the primary source of touch latency
        // when the WKWebView's root scroll is disabled.
        webView.scrollView.delaysContentTouches = false
        webView.scrollView.panGestureRecognizer.delaysTouchesBegan = false

        #if DEBUG
        webView.isInspectable = true
        #endif

        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        // Only load once; navigation within Angular manages further routing.
        guard webView.url == nil else { return }
        webView.load(URLRequest(url: BundleSchemeHandler.startURL))
    }
}
