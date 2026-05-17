import WebKit
import VisionKit
import OSLog
import UIKit

private let log = Logger(subsystem: "com.kndl.Vault23", category: "WebBridge")

/// Handles bidirectional communication between the Angular web layer and Swift.
///
/// **Angular → Swift:** call `window.webkit.messageHandlers.nativeBridge.postMessage({ action, payload })`
/// **Swift → Angular:** call `webView.evaluateJavaScript("window.dispatchEvent(...)")`
@MainActor
final class WebBridge: NSObject,
    WKScriptMessageHandler,
    WKNavigationDelegate,
    DataScannerViewControllerDelegate,
    UIImagePickerControllerDelegate,
    UINavigationControllerDelegate {

    weak var webView: WKWebView?
    private weak var presentedScanner: DataScannerViewController?
    private let onLoaded: (() -> Void)?

    // MARK: - Lifecycle

    init(onLoaded: (() -> Void)? = nil) {
        self.onLoaded = onLoaded
        super.init()
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(keyboardWillShow(_:)),
            name: UIResponder.keyboardWillShowNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(keyboardWillHide(_:)),
            name: UIResponder.keyboardWillHideNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(apnsTokenReceived(_:)),
            name: Notification.Name("apnsTokenReceived"),
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: - WKScriptMessageHandler

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == "nativeBridge",
              let body = message.body as? [String: Any],
              let action = body["action"] as? String
        else {
            log.warning("Malformed bridge message received")
            return
        }

        log.debug("Bridge received action: \(action)")
        handle(action: action, payload: body["payload"])
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        log.info("WebView loaded: \(webView.url?.absoluteString ?? "unknown")")
        onLoaded?()
    }

    func webView(
        _ webView: WKWebView,
        didFail navigation: WKNavigation!,
        withError error: Error
    ) {
        log.error("WebView navigation failed: \(error.localizedDescription)")
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        log.error("WebView provisional navigation failed: \(error.localizedDescription)")
    }

    // MARK: - Action dispatch

    private func handle(action: String, payload: Any?) {
        switch action {
        case "openScanner":
            openScanner()
        case "openCamera":
            openImagePicker(source: .camera)
        case "openGallery":
            openImagePicker(source: .photoLibrary)
        default:
            log.warning("Unhandled bridge action: \(action)")
        }
    }

    // MARK: - Barcode Scanner

    private func openScanner() {
        guard DataScannerViewController.isSupported, DataScannerViewController.isAvailable else {
            log.warning("DataScanner not available on this device")
            return
        }
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.ean13, .ean8, .upce, .code39, .code128, .qr])],
            qualityLevel: .accurate,
            recognizesMultipleItems: false,
            isHighFrameRateTrackingEnabled: false,
            isPinchToZoomEnabled: true,
            isGuidanceEnabled: true,
            isHighlightingEnabled: true
        )
        scanner.delegate = self
        presentedScanner = scanner
        guard let vc = webView?.window?.rootViewController else {
            log.warning("No root view controller to present scanner")
            return
        }
        vc.present(scanner, animated: true) {
            try? scanner.startScanning()
        }
    }

    // MARK: - DataScannerViewControllerDelegate

    nonisolated func dataScanner(
        _ dataScanner: DataScannerViewController,
        didAdd addedItems: [RecognizedItem],
        allItems: [RecognizedItem]
    ) {
        guard let item = addedItems.first,
              case .barcode(let barcode) = item else { return }
        let rawValue = barcode.payloadStringValue ?? ""
        MainActor.assumeIsolated { [weak self] in
            self?.presentedScanner?.dismiss(animated: true) {
                self?.dispatchScanResult(barcode: rawValue)
            }
        }
    }

    private func dispatchScanResult(barcode: String) {
        let sanitized = barcode
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
        let js = "window.dispatchEvent(new CustomEvent('scanResult', { detail: { sku: '\(sanitized)', barcode: '\(sanitized)' } }))"
        webView?.evaluateJavaScript(js) { _, error in
            if let error { log.error("Failed to dispatch scanResult: \(error.localizedDescription)") }
        }
    }

    // MARK: - Camera / Photo Library

    private func openImagePicker(source: UIImagePickerController.SourceType) {
        let resolvedSource: UIImagePickerController.SourceType =
            UIImagePickerController.isSourceTypeAvailable(source) ? source : .photoLibrary
        let picker = UIImagePickerController()
        picker.sourceType = resolvedSource
        // Restrict to still images only — prevents video recording mode from appearing
        picker.mediaTypes = ["public.image"]
        picker.allowsEditing = false
        picker.delegate = self
        guard let vc = webView?.window?.rootViewController else {
            log.warning("No root view controller to present image picker")
            return
        }
        vc.present(picker, animated: true)
    }

    // MARK: UIImagePickerControllerDelegate

    func imagePickerController(
        _ picker: UIImagePickerController,
        didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
    ) {
        let image = info[.editedImage] as? UIImage ?? info[.originalImage] as? UIImage
        picker.dismiss(animated: true) { [weak self] in
            guard let self, let image else { return }
            guard let jpeg = image.v23_resized(toMaxWidth: 1024).jpegData(compressionQuality: 0.72) else {
                log.error("Failed to encode captured image as JPEG")
                return
            }
            let base64 = jpeg.base64EncodedString()
            self.dispatchCameraResult(base64: base64)
        }
    }

    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        picker.dismiss(animated: true)
    }

    private func dispatchCameraResult(base64: String) {
        // base64 chars are A-Za-z0-9+/= — safe to embed in a single-quoted JS string
        let js = "window.dispatchEvent(new CustomEvent('cameraResult', { detail: { imageData: '\(base64)', mimeType: 'image/jpeg' } }))"
        webView?.evaluateJavaScript(js) { _, error in
            if let error { log.error("Failed to dispatch cameraResult: \(error.localizedDescription)") }
        }
    }

    // MARK: - Keyboard

    @objc private func keyboardWillShow(_ notification: Notification) {
        guard let frame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect,
              let duration = notification.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double
        else { return }
        dispatchKeyboardChange(height: frame.height, duration: duration)
    }

    @objc private func keyboardWillHide(_ notification: Notification) {
        guard let duration = notification.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double
        else { return }
        dispatchKeyboardChange(height: 0, duration: duration)
    }

    private func dispatchKeyboardChange(height: CGFloat, duration: Double) {
        let js = "window.dispatchEvent(new CustomEvent('keyboardChange', { detail: { height: \(height), duration: \(duration) } }))"
        webView?.evaluateJavaScript(js) { _, error in
            if let error { log.error("Failed to dispatch keyboardChange: \(error.localizedDescription)") }
        }
    }

    // MARK: - Push Notifications

    @objc private func apnsTokenReceived(_ notification: Notification) {
        guard let token = notification.userInfo?["token"] as? String else { return }
        let sanitized = token
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
        let js = "window.dispatchEvent(new CustomEvent('apnsToken', { detail: { token: '\(sanitized)' } }))"
        webView?.evaluateJavaScript(js) { _, error in
            if let error { log.error("Failed to dispatch apnsToken: \(error.localizedDescription)") }
        }
    }
}

// MARK: - UIImage helpers

private extension UIImage {
    /// Proportionally downsizes the image so its width is at most `maxWidth`.
    /// Returns `self` unchanged if already within bounds.
    func v23_resized(toMaxWidth maxWidth: CGFloat) -> UIImage {
        guard size.width > maxWidth else { return self }
        let scale = maxWidth / size.width
        let newSize = CGSize(width: maxWidth, height: (size.height * scale).rounded())
        let renderer = UIGraphicsImageRenderer(size: newSize)
        return renderer.image { _ in draw(in: CGRect(origin: .zero, size: newSize)) }
    }
}
