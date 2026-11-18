import SwiftUI
import WidgetKit

/// Päivän tilanne widgetille. Jos sovellusta ei ole avattu tänään, ruoka on nollissa
/// ja tehtävälista on tämän päivän lista (lähetetty edellisenä päivänä "huomisena").
struct DayState {
    var hasData: Bool
    var dateISO: String
    var kcal: Double
    var protein: Double
    var carbs: Double
    var fat: Double
    var goalKcal: Double
    var goalProtein: Double
    var goalCarbs: Double
    var goalFat: Double
    var meals: [WidgetSnapshot.Meal]
    var tasks: [WidgetSnapshot.TaskItem]
    var next: WidgetSnapshot.Upcoming?
    var workoutsThisWeek: Int
    var nextWorkout: WidgetSnapshot.NextWorkout?
    var weight: WidgetSnapshot.Weight?
    var trip: Bool
    var week: [WidgetSnapshot.WeekDay]
    var weights: [WidgetSnapshot.WeightPoint]
    var goalWeight: Double?
    var lastWorkout: WidgetSnapshot.LastWorkout?

    /// Painon muutos edellisestä mittauksesta
    var weightChange: Double? {
        guard weights.count >= 2 else { return nil }
        return weights[weights.count - 1].value - weights[weights.count - 2].value
    }
    /// Onko muutos tavoitteen suuntaan (nil, jos tavoitetta ei ole)
    var weightChangeIsGood: Bool? {
        guard let goal = goalWeight, let change = weightChange, let current = weights.last?.value, change != 0 else { return nil }
        return (goal - current) * change > 0 || abs(goal - current) < 0.3
    }

    var tasksDone: Int { tasks.filter(\.done).count }
    var tasksTotal: Int { tasks.count }
    var taskProgress: Double { tasksTotal == 0 ? 0 : Double(tasksDone) / Double(tasksTotal) }
    var kcalProgress: Double { goalKcal > 0 ? kcal / goalKcal : 0 }
    var proteinProgress: Double { goalProtein > 0 ? protein / goalProtein : 0 }
    var kcalLeft: Double { max(0, goalKcal - kcal) }
    /// Seuraavat tekemättömät tehtävät (ensin ne, joiden aika ei ole vielä mennyt)
    func openTasks(now: Date) -> [WidgetSnapshot.TaskItem] {
        let nowClock = String(format: "%02d:%02d", Calendar.current.component(.hour, from: now), Calendar.current.component(.minute, from: now))
        let open = tasks.filter { !$0.done }
        return open.filter { $0.time >= nowClock } + open.filter { $0.time < nowClock }
    }

    init(snapshot s: WidgetSnapshot, now: Date) {
        let today = DateUtil.iso(now)
        hasData = true
        dateISO = today
        goalKcal = s.food.goalKcal; goalProtein = s.food.goalProtein; goalCarbs = s.food.goalCarbs; goalFat = s.food.goalFat
        if s.date == today {
            kcal = s.food.kcal; protein = s.food.protein; carbs = s.food.carbs; fat = s.food.fat
            meals = s.food.meals
            tasks = s.tasks
            trip = s.trip
        } else {
            kcal = 0; protein = 0; carbs = 0; fat = 0
            meals = s.food.meals.map { var m = $0; m.kcal = 0; m.protein = 0; m.count = 0; return m }
            tasks = DateUtil.addDays(s.date, 1) == today ? s.tomorrowTasks : []
            trip = false
        }
        let doneIDs = Set((s.date == today ? s.tasks : s.tomorrowTasks).filter { $0.done }.map { $0.id })
        next = s.upcoming.first { $0.atDate > now && !($0.date == today && doneIDs.contains($0.rid)) }
        workoutsThisWeek = s.workoutsThisWeek
        nextWorkout = s.nextWorkout
        weight = s.weight
        // Uuden viikon alkaessa vanha viikkonäkymä piilotetaan, kunnes sovellus avataan
        week = (s.week ?? []).contains { $0.date == today } ? (s.week ?? []) : []
        weights = s.weights ?? []
        goalWeight = s.goalWeight
        lastWorkout = s.lastWorkout
    }

    private init(empty: Bool) {
        hasData = false; dateISO = DateUtil.iso(Date())
        kcal = 0; protein = 0; carbs = 0; fat = 0
        goalKcal = 2400; goalProtein = 160; goalCarbs = 250; goalFat = 80
        meals = []; tasks = []; next = nil; workoutsThisWeek = 0; nextWorkout = nil; weight = nil; trip = false
        week = []; weights = []; goalWeight = nil; lastWorkout = nil
    }

    static let empty = DayState(empty: true)

    /// Esikatselu widgettigalleriaan
    static var preview: DayState {
        var d = DayState(empty: true)
        d.hasData = true
        d.kcal = 1640; d.protein = 112; d.carbs = 168; d.fat = 52
        d.meals = [
            .init(key: "m1", label: "1. ateria", kcal: 720, protein: 48, count: 3),
            .init(key: "m2", label: "2. ateria", kcal: 680, protein: 46, count: 2),
            .init(key: "m3", label: "3. ateria", kcal: 0, protein: 0, count: 0),
            .init(key: "snack", label: "Välipalat", kcal: 240, protein: 18, count: 1)
        ]
        d.tasks = [
            .init(id: "r_start", time: "09:00", title: "Päivän käynnistys", done: true, kind: nil),
            .init(id: "r_meal1", time: "12:00", title: "Ensimmäinen ateria", done: true, kind: "meal"),
            .init(id: "r_meal2", time: "15:30", title: "Seuraava ateria", done: true, kind: "meal"),
            .init(id: "r_meal3", time: "19:30", title: "Viimeinen ateria", done: false, kind: "meal"),
            .init(id: "r_summary", time: "20:00", title: "Päivän ruokailujen yhteenveto", done: false, kind: "summary"),
            .init(id: "r_prep", time: "21:00", title: "Huomiseen valmistautuminen", done: false, kind: nil)
        ]
        let at = Calendar.current.date(bySettingHour: 19, minute: 30, second: 0, of: Date()) ?? Date()
        d.next = .init(at: at.timeIntervalSince1970 * 1000, title: "Viimeinen ateria", rid: "r_meal3", date: d.dateISO)
        d.workoutsThisWeek = 3
        d.nextWorkout = .init(name: "PUSH", label: "Huomenna")
        d.weight = .init(value: 82.1, date: d.dateISO)
        let names: [String?] = ["PUSH", nil, "PULL", nil, "LEGS", nil, nil]
        let monday = DateUtil.addDays(d.dateISO, -((Calendar.current.component(.weekday, from: Date()) + 5) % 7))
        let labels = ["ma", "ti", "ke", "to", "pe", "la", "su"]
        var week: [WidgetSnapshot.WeekDay] = []
        for i in 0..<7 {
            let date = DateUtil.addDays(monday, i)
            week.append(WidgetSnapshot.WeekDay(label: labels[i], date: date, planned: names[i], done: names[i] != nil && date < d.dateISO, doneName: nil))
        }
        d.week = week
        let sample: [Double] = [84.0, 83.6, 83.4, 83.1, 82.9, 82.6, 82.4, 82.1]
        var points: [WidgetSnapshot.WeightPoint] = []
        for (i, v) in sample.enumerated() {
            points.append(WidgetSnapshot.WeightPoint(date: DateUtil.addDays(d.dateISO, -7 * (7 - i)), value: v))
        }
        d.weights = points
        d.goalWeight = 80
        d.lastWorkout = .init(name: "PULL", date: DateUtil.addDays(d.dateISO, -1))
        return d
    }
}

struct GTEntry: TimelineEntry {
    let date: Date
    let day: DayState
}

struct GTProvider: TimelineProvider {
    func placeholder(in context: Context) -> GTEntry {
        GTEntry(date: Date(), day: .preview)
    }

    func getSnapshot(in context: Context, completion: @escaping (GTEntry) -> Void) {
        let now = Date()
        if let s = SharedStore.loadSnapshot() {
            completion(GTEntry(date: now, day: DayState(snapshot: s, now: now)))
        } else {
            completion(GTEntry(date: now, day: context.isPreview ? .preview : .empty))
        }
    }

    /// Aikajana: päivitys jokaisen muistutuksen kohdalla (seuraava muistutus vaihtuu) ja keskiyöllä (uusi päivä).
    func getTimeline(in context: Context, completion: @escaping (Timeline<GTEntry>) -> Void) {
        let now = Date()
        let cal = Calendar.current
        let midnight = cal.startOfDay(for: cal.date(byAdding: .day, value: 1, to: now) ?? now.addingTimeInterval(86400))
        guard let s = SharedStore.loadSnapshot() else {
            completion(Timeline(entries: [GTEntry(date: now, day: .empty)], policy: .after(midnight)))
            return
        }
        var dates: [Date] = [now]
        for u in s.upcoming {
            let d = u.atDate.addingTimeInterval(1)
            if d > now && d < midnight { dates.append(d) }
        }
        dates.append(midnight)
        dates = Array(Set(dates)).sorted().prefix(40).map { $0 }
        let entries = dates.map { GTEntry(date: $0, day: DayState(snapshot: s, now: $0)) }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}
