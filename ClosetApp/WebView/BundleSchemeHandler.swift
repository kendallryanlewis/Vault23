@preconcurrency import WebKit
import OSLog

private let log = Logger(subsystem: "com.kndl.Vault23", category: "BundleSchemeHandler")

/// Serves the Angular bundle (copied to `www/` in the app bundle) over the
/// custom `app://` scheme.  This bypasses WKWebView's `file://` sandbox
/// restrictions on physical iOS devices where the WebContent process cannot
/// obtain sandbox extensions for bundle resources.
///
/// File reads are dispatched to a background queue so the main thread is never
/// blocked while the WebContent process loads the Angular bundle.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {

    static let scheme   = "app"
    static let startURL = URL(string: "app://localhost/index.html")!

    private let wwwRoot = Bundle.main.bundleURL.appendingPathComponent("www")
    private let ioQueue = DispatchQueue(label: "com.kndl.BundleSchemeHandler.io",
                                        qos: .userInteractive)
    // Tracks active tasks on the main thread so stop() can cancel pending reads.
    private var activeTasks: [ObjectIdentifier: WKURLSchemeTask] = [:]

    // MARK: - WKURLSchemeHandler

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let requestURL = task.request.url else {
            task.didFailWithError(URLError(.badURL))
            return
        }

        var path = requestURL.path
        if path == "/" || path.isEmpty { path = "/index.html" }

        let fileURL = wwwRoot.appendingPathComponent(String(path.dropFirst()))
        let taskID  = ObjectIdentifier(task)
        activeTasks[taskID] = task

        // Capture immutable values for the background closure.
        let wwwRoot = self.wwwRoot

        ioQueue.async { [weak self] in
            let (data, mimeURL): (Data, URL)
            if let d = try? Data(contentsOf: fileURL) {
                data    = d
                mimeURL = fileURL
            } else if let d = try? Data(contentsOf: wwwRoot.appendingPathComponent("index.html")) {
                // Unknown path — fall back to index.html for Angular's client-side router.
                data    = d
                mimeURL = wwwRoot.appendingPathComponent("index.html")
            } else {
                log.error("www/index.html missing — run the Angular build first")
                DispatchQueue.main.async { [weak self] in
                    guard self?.activeTasks[taskID] != nil else { return }
                    task.didFailWithError(URLError(.fileDoesNotExist))
                    self?.activeTasks.removeValue(forKey: taskID)
                }
                return
            }

            DispatchQueue.main.async { [weak self] in
                // Guard: task may have been cancelled by stop() while we were reading.
                guard let self, self.activeTasks[taskID] != nil else { return }
                let response = URLResponse(
                    url: requestURL,
                    mimeType: Self.mimeType(for: mimeURL.pathExtension),
                    expectedContentLength: data.count,
                    textEncodingName: "utf-8"
                )
                task.didReceive(response)
                task.didReceive(data)
                task.didFinish()
                self.activeTasks.removeValue(forKey: taskID)
            }
        }
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
        // Remove the task so the ioQueue's main-thread callback is a no-op.
        activeTasks.removeValue(forKey: ObjectIdentifier(task))
    }

    // MARK: - MIME helpers

    private static func mimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "html":          return "text/html"
        case "css":           return "text/css"
        case "js":            return "application/javascript"
        case "json", "map":   return "application/json"
        case "png":           return "image/png"
        case "jpg", "jpeg":   return "image/jpeg"
        case "svg":           return "image/svg+xml"
        case "woff2":         return "font/woff2"
        case "woff":          return "font/woff"
        case "ico":           return "image/x-icon"
        case "txt":           return "text/plain"
        default:              return "application/octet-stream"
        }
    }
}
