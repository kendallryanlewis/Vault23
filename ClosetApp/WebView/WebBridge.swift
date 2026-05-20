import WebKit
import VisionKit
import OSLog
import UIKit
import AuthenticationServices
import CryptoKit
import Security

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
    UINavigationControllerDelegate,
    ASAuthorizationControllerDelegate,
    ASAuthorizationControllerPresentationContextProviding {

    weak var webView: WKWebView?
    private weak var presentedScanner: DataScannerViewController?
    private let onLoaded: (() -> Void)?
    private var pendingAppleRequestId: String?
    private var pendingAppleNonce: String?

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
        case "socialAuth":
            handleSocialAuth(payload: payload)
        default:
            log.warning("Unhandled bridge action: \(action)")
        }
    }

    private func handleSocialAuth(payload: Any?) {
        guard let dict = payload as? [String: Any],
              let provider = dict["provider"] as? String,
              let requestId = dict["requestId"] as? String
        else {
            log.warning("Malformed socialAuth payload")
            return
        }

        switch provider {
        case "apple":
            startAppleSignIn(requestId: requestId)
        default:
            dispatchNativeAuthResult([
                "provider": provider,
                "requestId": requestId,
                "error": "Unsupported provider: \(provider)"
            ])
        }
    }

    private func startAppleSignIn(requestId: String) {
        let nonce = randomNonceString()
        pendingAppleRequestId = requestId
        pendingAppleNonce = nonce

        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = sha256(nonce)

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performRequests()
    }

    func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let requestId = pendingAppleRequestId
        else {
            resetAppleState()
            return
        }

        guard let tokenData = credential.identityToken,
              let idToken = String(data: tokenData, encoding: .utf8),
              !idToken.isEmpty
        else {
            dispatchNativeAuthResult([
                "provider": "apple",
                "requestId": requestId,
                "error": "Apple sign-in did not return an identity token"
            ])
            resetAppleState()
            return
        }

        let nonce = pendingAppleNonce ?? ""
        dispatchNativeAuthResult([
            "provider": "apple",
            "requestId": requestId,
            "idToken": idToken,
            "nonce": nonce
        ])
        resetAppleState()
    }

    func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: Error
    ) {
        let requestId = pendingAppleRequestId ?? ""
        dispatchNativeAuthResult([
            "provider": "apple",
            "requestId": requestId,
            "error": error.localizedDescription
        ])
        resetAppleState()
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        if let window = webView?.window {
            return window
        }

        let activeScene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }

        if let keyWindow = activeScene?.windows.first(where: { $0.isKeyWindow }) {
            return keyWindow
        }

        return activeScene?.windows.first ?? UIWindow()
    }

    private func resetAppleState() {
        pendingAppleRequestId = nil
        pendingAppleNonce = nil
    }

    private func dispatchNativeAuthResult(_ detail: [String: String]) {
        guard JSONSerialization.isValidJSONObject(detail),
              let data = try? JSONSerialization.data(withJSONObject: detail),
              let json = String(data: data, encoding: .utf8)
        else {
            log.error("Failed to serialize native auth result")
            return
        }

        let js = "window.dispatchEvent(new CustomEvent('nativeAuthResult', { detail: \(json) }))"
        webView?.evaluateJavaScript(js) { _, error in
            if let error { log.error("Failed to dispatch nativeAuthResult: \(error.localizedDescription)") }
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

private func randomNonceString(length: Int = 32) -> String {
    let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
    var result = ""
    var remainingLength = length

    while remainingLength > 0 {
        let randoms: [UInt8] = (0..<16).map { _ in
            var random: UInt8 = 0
            let status = SecRandomCopyBytes(kSecRandomDefault, 1, &random)
            if status != errSecSuccess {
                fatalError("Unable to generate nonce. SecRandomCopyBytes failed with status \(status)")
            }
            return random
        }

        randoms.forEach { random in
            if remainingLength == 0 {
                return
            }

            if random < charset.count {
                result.append(charset[Int(random)])
                remainingLength -= 1
            }
        }
    }

    return result
}

private func sha256(_ input: String) -> String {
    let inputData = Data(input.utf8)
    let hashedData = SHA256.hash(data: inputData)
    return hashedData.compactMap { String(format: "%02x", $0) }.joined()
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
