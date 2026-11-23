import Foundation
import HealthKit

/// Ravintotietojen luku Apple Healthista (esim. Yazio kirjoittaa sinne kalorit ja makrot).
/// Verkkosovellus (js/native.js) pyytää luvan viestillä "healthAuthorize" ja hakee tiedot viestillä "healthNutrition".
/// GymTrack vain lukee tietoja, se ei kirjoita Apple Healthiin mitään.
enum HealthNutrition {
    private static let store = HKHealthStore()

    private static let types: [(key: String, id: HKQuantityTypeIdentifier, unit: HKUnit)] = [
        ("kcal", .dietaryEnergyConsumed, .kilocalorie()),
        ("p", .dietaryProtein, .gram()),
        ("c", .dietaryCarbohydrates, .gram()),
        ("f", .dietaryFatTotal, .gram())
    ]

    private static var readTypes: Set<HKObjectType> {
        Set(types.compactMap { HKObjectType.quantityType(forIdentifier: $0.id) })
    }

    static var available: Bool { HKHealthStore.isHealthDataAvailable() }

    /// Pyytää lukuoikeuden. iOS näyttää kyselyn vain ensimmäisellä kerralla; sen jälkeen oikeudet muutetaan Terveys-apista.
    /// HealthKit ei kerro sovellukselle, onko lukuoikeus annettu, joten tyhjä tulos voi tarkoittaa myös estettyä oikeutta.
    static func authorize(_ done: @escaping (Bool, String?) -> Void) {
        guard available else { done(false, "Apple Health ei ole käytettävissä tässä laitteessa."); return }
        store.requestAuthorization(toShare: nil, read: readTypes) { ok, error in
            done(ok, error?.localizedDescription)
        }
    }

    /// Hakee ravintonäytteet `days` päivältä (tänään mukaan lukien).
    /// Näytteet ryhmitellään aterioiksi lähteen, aloitusajan ja HealthKitin ruokatyypin (HKFoodType) mukaan.
    /// Vastaus: { ok, from, to, entries: [{ key, date, time, foodType, source, bundle, kcal, p, c, f }], sources: [{ name, bundle, count }] }
    static func fetch(days: Int, _ done: @escaping ([String: Any]) -> Void) {
        guard available else { done(["ok": false, "error": "Apple Health ei ole käytettävissä tässä laitteessa."]); return }
        let cal = Calendar.current
        let span = max(1, min(days, 62))
        let end = cal.date(byAdding: .day, value: 1, to: cal.startOfDay(for: Date()))!
        let start = cal.date(byAdding: .day, value: -span, to: end)!
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
        let own = Bundle.main.bundleIdentifier ?? ""

        let dayFmt = DateFormatter()
        dayFmt.calendar = cal
        dayFmt.locale = Locale(identifier: "en_US_POSIX")
        dayFmt.timeZone = .current
        dayFmt.dateFormat = "yyyy-MM-dd"
        let timeFmt = DateFormatter()
        timeFmt.locale = Locale(identifier: "en_US_POSIX")
        timeFmt.timeZone = .current
        timeFmt.dateFormat = "HH:mm"

        struct Group { var date: String; var time: String; var foodType: String; var source: String; var bundle: String; var values: [String: Double] = [:] }
        var groups: [String: Group] = [:]
        var order: [String] = []
        var sources: [String: (name: String, count: Int)] = [:]
        var firstError: String?

        let lock = NSLock()
        let wait = DispatchGroup()
        for t in types {
            guard let qt = HKQuantityType.quantityType(forIdentifier: t.id) else { continue }
            wait.enter()
            let q = HKSampleQuery(sampleType: qt, predicate: predicate, limit: HKObjectQueryNoLimit,
                                  sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]) { _, samples, error in
                lock.lock()
                defer { lock.unlock(); wait.leave() }
                if let error, firstError == nil { firstError = error.localizedDescription }
                for case let s as HKQuantitySample in samples ?? [] {
                    let bundle = s.sourceRevision.source.bundleIdentifier
                    if bundle == own { continue }
                    let name = s.sourceRevision.source.name
                    let foodType = (s.metadata?[HKMetadataKeyFoodType] as? String) ?? ""
                    let minute = Int(s.startDate.timeIntervalSince1970 / 60)
                    let key = "\(bundle)|\(minute)|\(foodType)"
                    if groups[key] == nil {
                        groups[key] = Group(date: dayFmt.string(from: s.startDate), time: timeFmt.string(from: s.startDate),
                                            foodType: foodType, source: name, bundle: bundle)
                        order.append(key)
                    }
                    groups[key]!.values[t.key, default: 0] += s.quantity.doubleValue(for: t.unit)
                    if sources[bundle] == nil { sources[bundle] = (name, 0) }
                    if t.key == "kcal" { sources[bundle]!.count += 1 }
                }
            }
            store.execute(q)
        }

        wait.notify(queue: .main) {
            let entries: [[String: Any]] = order.compactMap { key in
                guard let g = groups[key] else { return nil }
                return [
                    "key": key, "date": g.date, "time": g.time, "foodType": g.foodType,
                    "source": g.source, "bundle": g.bundle,
                    "kcal": g.values["kcal"] ?? 0, "p": g.values["p"] ?? 0, "c": g.values["c"] ?? 0, "f": g.values["f"] ?? 0
                ]
            }
            var out: [String: Any] = [
                "ok": true,
                "from": dayFmt.string(from: start),
                "to": dayFmt.string(from: cal.date(byAdding: .day, value: -1, to: end)!),
                "entries": entries,
                "sources": sources.map { ["bundle": $0.key, "name": $0.value.name, "count": $0.value.count] }
            ]
            if let firstError, entries.isEmpty { out["error"] = firstError }
            done(out)
        }
    }
}
