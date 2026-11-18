import Foundation
import Security
import UserNotifications
import WidgetKit

// MARK: - Widgetin tiedot (verkkosovelluksen js/native.js lähettää nämä)

struct WidgetSnapshot: Codable {
    struct Meal: Codable, Hashable {
        var key: String
        var label: String
        var kcal: Double
        var protein: Double
        var count: Int
    }

    struct Food: Codable {
        var kcal: Double
        var protein: Double
        var carbs: Double
        var fat: Double
        var entries: Int
        var goalKcal: Double
        var goalProtein: Double
        var goalCarbs: Double
        var goalFat: Double
        var meals: [Meal]
    }

    struct TaskItem: Codable, Hashable, Identifiable {
        var id: String
        var time: String
        var title: String
        var done: Bool
        var kind: String?
    }

    struct Upcoming: Codable, Hashable {
        var at: Double          // millisekunteina (JS Date)
        var title: String
        var rid: String
        var date: String
        var atDate: Date { Date(timeIntervalSince1970: at / 1000) }
    }

    struct Weight: Codable { var value: Double; var date: String }
    struct LastWorkout: Codable { var name: String; var date: String }
    struct NextWorkout: Codable { var name: String; var label: String }
    struct WeekDay: Codable, Hashable { var label: String; var date: String; var planned: String?; var done: Bool; var doneName: String? }
    struct WeightPoint: Codable, Hashable { var date: String; var value: Double }

    var v: Int
    var updatedAt: String
    var date: String
    var food: Food
    var tasks: [TaskItem]
    var tomorrowTasks: [TaskItem]
    var upcoming: [Upcoming]
    var weight: Weight?
    var workoutsThisWeek: Int
    var lastWorkout: LastWorkout?
    var nextWorkout: NextWorkout?
    var trip: Bool
    // Lisätty versiossa 2 (vanhemmissa tiedoissa puuttuvat)
    var week: [WeekDay]?
    var weights: [WeightPoint]?
    var goalWeight: Double?
}

/// Widgetistä tai ilmoituksesta tehty kuittaus, joka viedään sovellukseen seuraavalla avauksella.
struct PendingAction: Codable {
    var type: String        // "done" tai "snooze"
    var rid: String
    var date: String?
    var until: Double?      // millisekunteina

    var dictionary: [String: Any] {
        var d: [String: Any] = ["type": type, "rid": rid]
        if let date { d["date"] = date }
        if let until { d["until"] = until }
        return d
    }
}

// MARK: - Yhteinen tallennus, jota sekä sovellus että widgetit lukevat
//
// Tiedot jaetaan yhteisen avainnipun (Keychain Sharing) kautta. Se toimii myös ilmaisella
// Apple ID:llä, toisin kuin App Groups, jota ilmainen tunnus ei voi allekirjoittaa.

enum SharedStore {
    private static let snapshotKey = "widgetSnapshot"
    private static let actionsKey = "pendingActions"

    // Widgetin tiedot

    static func loadSnapshot() -> WidgetSnapshot? {
        guard let data = SharedKeychain.get(snapshotKey) else { return nil }
        return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
    }

    @discardableResult
    static func saveSnapshot(data: Data) -> Bool {
        guard (try? JSONDecoder().decode(WidgetSnapshot.self, from: data)) != nil else { return false }
        return SharedKeychain.set(snapshotKey, data)
    }

    static func saveSnapshot(_ snapshot: WidgetSnapshot) {
        if let data = try? JSONEncoder().encode(snapshot) { SharedKeychain.set(snapshotKey, data) }
    }

    // Odottavat kuittaukset

    static func enqueue(_ action: PendingAction) {
        var list = pendingActions()
        list.append(action)
        if let data = try? JSONEncoder().encode(list) { SharedKeychain.set(actionsKey, data) }
    }

    static func pendingActions() -> [PendingAction] {
        guard let data = SharedKeychain.get(actionsKey) else { return [] }
        return (try? JSONDecoder().decode([PendingAction].self, from: data)) ?? []
    }

    /// Palauttaa odottavat kuittaukset ja tyhjentää jonon.
    static func drainActions() -> [PendingAction] {
        let list = pendingActions()
        if !list.isEmpty { SharedKeychain.delete(actionsKey) }
        return list
    }

    /// Tehtävä kuitattu tehdyksi widgetistä tai ilmoituksesta:
    /// päivitetään widgetin tiedot heti, poistetaan tehtävän ilmoitus ja jätetään kuittaus sovellukselle.
    static func completeTask(rid: String, date: String) {
        enqueue(PendingAction(type: "done", rid: rid, date: date, until: nil))
        if var snap = loadSnapshot() {
            if snap.date == date {
                snap.tasks = snap.tasks.map { var t = $0; if t.id == rid { t.done = true }; return t }
            } else if DateUtil.addDays(snap.date, 1) == date {
                snap.tomorrowTasks = snap.tomorrowTasks.map { var t = $0; if t.id == rid { t.done = true }; return t }
            }
            snap.upcoming.removeAll { $0.rid == rid && $0.date == date }
            saveSnapshot(snap)
        }
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: ["gt-\(rid)-\(date)", "gt-snooze-\(rid)"])
        center.removeDeliveredNotifications(withIdentifiers: ["gt-\(rid)-\(date)", "gt-snooze-\(rid)"])
        WidgetCenter.shared.reloadAllTimelines()
    }
}

// MARK: - Avainnippu, jonka sovellus ja widgetit jakavat

/// Yhteinen ryhmä on molempien kohteiden entitlements-tiedostossa ensimmäisenä
/// (keychain-access-groups), joten iOS käyttää sitä oletuksena.
enum SharedKeychain {
    private static let service = "gymtrack.shared"

    private static func query(_ key: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: key]
    }

    static func get(_ key: String) -> Data? {
        var q = query(key)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess else { return nil }
        return out as? Data
    }

    @discardableResult
    static func set(_ key: String, _ data: Data) -> Bool {
        let attrs: [String: Any] = [kSecValueData as String: data,
                                    kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock]
        let status = SecItemUpdate(query(key) as CFDictionary, attrs as CFDictionary)
        if status == errSecSuccess { return true }
        if status == errSecItemNotFound {
            var add = query(key)
            add.merge(attrs) { _, new in new }
            return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
        }
        return false
    }

    static func delete(_ key: String) {
        SecItemDelete(query(key) as CFDictionary)
    }
}

// MARK: - Päivämäärät (samassa muodossa kuin verkkosovelluksessa: 2026-11-15)

enum DateUtil {
    static func iso(_ date: Date) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 2000, c.month ?? 1, c.day ?? 1)
    }

    static func parse(_ iso: String) -> Date? {
        let p = iso.split(separator: "-").compactMap { Int($0) }
        guard p.count == 3 else { return nil }
        return Calendar.current.date(from: DateComponents(year: p[0], month: p[1], day: p[2]))
    }

    static func addDays(_ iso: String, _ n: Int) -> String {
        guard let d = parse(iso), let x = Calendar.current.date(byAdding: .day, value: n, to: d) else { return iso }
        return DateUtil.iso(x)
    }

    /// "15:30" → "15.30"
    static func clock(_ time: String) -> String { time.replacingOccurrences(of: ":", with: ".") }

    static func clock(_ date: Date) -> String {
        let c = Calendar.current.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d.%02d", c.hour ?? 0, c.minute ?? 0)
    }
}
