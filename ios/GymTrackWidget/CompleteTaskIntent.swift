import AppIntents
import WidgetKit

/// Widgetin "kuittaa tehdyksi" -painike. Muutos näkyy widgetissä heti ja siirtyy sovellukseen,
/// kun GymTrack avataan seuraavan kerran.
struct CompleteTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "Merkitse tehtävä tehdyksi"
    static var isDiscoverable: Bool = false

    @Parameter(title: "Tehtävä") var rid: String
    @Parameter(title: "Päivä") var date: String

    init() {}

    init(rid: String, date: String) {
        self.rid = rid
        self.date = date
    }

    func perform() async throws -> some IntentResult {
        SharedStore.completeTask(rid: rid, date: date)
        return .result()
    }
}
