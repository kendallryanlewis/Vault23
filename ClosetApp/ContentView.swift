import SwiftUI

struct ContentView: View {
    @State private var webLoaded = false

    var body: some View {
        ZStack {
            WebView(onLoaded: { webLoaded = true })
                .ignoresSafeArea()
        }
        .animation(.easeOut(duration: 0.35), value: webLoaded)
    }
}
