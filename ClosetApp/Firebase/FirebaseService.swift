import FirebaseFirestore
import FirebaseStorage

/// Central access point for Firebase services.
/// Add domain-specific query methods here as the app grows.
@MainActor
enum FirebaseService {
    static let db = Firestore.firestore()
    static let storageRoot = Storage.storage().reference(forURL: "gs://sneaker-app-fca1c.appspot.com")
}
