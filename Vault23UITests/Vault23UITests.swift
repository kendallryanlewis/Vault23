import XCTest

/// Vault23 App Store Screenshot Tests
///
/// Credentials are passed via environment variables so they are never
/// committed to source control. Set them in fastlane/.env before running:
///
///   SCREENSHOT_EMAIL=test@example.com
///   SCREENSHOT_PASSWORD=yourpassword
///
/// Run with: fastlane screenshots
@MainActor
class Vault23UITests: XCTestCase {

    var app: XCUIApplication!

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
        app = XCUIApplication()
        setupSnapshot(app)

        // Forward credentials from the shell environment into the app process
        let env = ProcessInfo.processInfo.environment
        app.launchEnvironment["SCREENSHOT_EMAIL"]    = env["SCREENSHOT_EMAIL"]    ?? ""
        app.launchEnvironment["SCREENSHOT_PASSWORD"] = env["SCREENSHOT_PASSWORD"] ?? ""

        app.launch()
    }

    // MARK: – Screenshot capture

    func testCaptureScreenshots() throws {
        let webView = app.webViews.firstMatch
        XCTAssertTrue(webView.waitForExistence(timeout: 30), "WebView did not load within 30 s")

        // ── Step 1: Log in ────────────────────────────────────────────────────
        let email    = app.launchEnvironment["SCREENSHOT_EMAIL"]    ?? ""
        let password = app.launchEnvironment["SCREENSHOT_PASSWORD"] ?? ""

        let emailField = webView.textFields.firstMatch
        if !email.isEmpty, emailField.waitForExistence(timeout: 10) {
            emailField.tap()
            Thread.sleep(forTimeInterval: 0.5)
            emailField.typeText(email)

            let passField = webView.secureTextFields.firstMatch
            if passField.waitForExistence(timeout: 5) {
                passField.tap()
                Thread.sleep(forTimeInterval: 0.5)
                passField.typeText(password)
            }

            // Tap the Sign In / Log In button
            let signInPredicate = NSPredicate(format:
                "label CONTAINS[c] 'sign in' OR label CONTAINS[c] 'log in' OR label CONTAINS[c] 'login'")
            let signInBtn = webView.buttons.matching(signInPredicate).firstMatch
            if signInBtn.waitForExistence(timeout: 3) {
                signInBtn.tap()
            }
        }

        // Wait for the authenticated home screen to fully render
        Thread.sleep(forTimeInterval: 6)

        // ── Step 2: Home – closet grid ────────────────────────────────────────
        snapshot("1_Home")

        // ── Step 3: Search ────────────────────────────────────────────────────
        tapNavButton(in: webView, label: "Search")
        Thread.sleep(forTimeInterval: 2)
        snapshot("2_Search")

        // ── Step 4: Drops ─────────────────────────────────────────────────────
        // Drops lives in the home sidebar; look for any button labelled "Drops"
        let dropsBtn = webView.buttons.matching(
            NSPredicate(format: "label CONTAINS[c] 'drops'")
        ).firstMatch
        if dropsBtn.waitForExistence(timeout: 5) {
            dropsBtn.tap()
            Thread.sleep(forTimeInterval: 2)
            snapshot("3_Drops")
        }

        // ── Step 5: Messages ──────────────────────────────────────────────────
        tapNavButton(in: webView, label: "Messages")
        Thread.sleep(forTimeInterval: 2)
        snapshot("4_Messages")

        // ── Step 6: Profile ───────────────────────────────────────────────────
        tapNavButton(in: webView, label: "Profile")
        Thread.sleep(forTimeInterval: 2)
        snapshot("5_Profile")

        // ── Step 7: Return Home ───────────────────────────────────────────────
        tapNavButton(in: webView, label: "Home")
        Thread.sleep(forTimeInterval: 1)
    }

    // MARK: – Helpers

    /// Taps the bottom-nav button whose aria-label matches `label`.
    private func tapNavButton(in webView: XCUIElement, label: String) {
        let btn = webView.buttons[label]
        if btn.waitForExistence(timeout: 5) {
            btn.tap()
        }
    }
}
