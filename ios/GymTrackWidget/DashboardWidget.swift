import SwiftUI
import WidgetKit

struct DashboardWidget: Widget {
    let kind = "GymTrackDashboard"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: GTProvider()) { entry in
            DashboardView(entry: entry)
        }
        .configurationDisplayName("Päivän yhteenveto")
        .description("Kalorit, proteiini, tehtävät ja seuraava muistutus yhdellä silmäyksellä.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

struct DashboardView: View {
    @Environment(\.widgetFamily) private var family
    var entry: GTEntry

    var body: some View {
        Group {
            if !entry.day.hasData { EmptyStateView() }
            else if family == .systemLarge { large(entry.day) }
            else { medium(entry.day) }
        }
        .gtBackground(family)
        .widgetURL(URL(string: "gymtrack://today"))
    }

    private func ringStat(_ progress: Double, _ value: String, _ label: String, color: Color, size: CGFloat) -> some View {
        VStack(spacing: 5) {
            ZStack {
                Ring(progress: progress, color: color, lineWidth: size * 0.12)
                Text(value).font(.display(size * 0.28)).foregroundStyle(Theme.text).minimumScaleFactor(0.5).padding(.horizontal, 6)
            }
            .frame(width: size, height: size)
            Text(label).font(.label(11)).tracking(0.5).foregroundStyle(Theme.muted).lineLimit(1)
        }
        .frame(maxWidth: .infinity)
    }

    private func rings(_ d: DayState, size: CGFloat) -> some View {
        HStack(spacing: 6) {
            ringStat(d.kcalProgress, Fmt.int(d.kcal), "KCAL / \(Fmt.int(d.goalKcal))", color: Theme.accent, size: size)
            ringStat(d.proteinProgress, "\(Fmt.int(d.protein))g", "PROT / \(Fmt.int(d.goalProtein))", color: Theme.protein, size: size)
            ringStat(d.taskProgress, "\(d.tasksDone)/\(d.tasksTotal)", "TEHTÄVÄT", color: Theme.good, size: size)
        }
    }

    private func medium(_ d: DayState) -> some View {
        VStack(spacing: 10) {
            rings(d, size: 58)
            NextReminderView(next: d.next, compact: true)
        }
    }

    private func large(_ d: DayState) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            WidgetHeader(icon: "dumbbell.fill", title: "Tänään", trailing: dayTitle())
            rings(d, size: 66)
            Rectangle().fill(Theme.border).frame(height: 1)
            VStack(spacing: 5) {
                ForEach(d.meals, id: \.key) { m in
                    HStack {
                        Circle().fill(m.count > 0 ? Theme.accent : Theme.faint.opacity(0.5)).frame(width: 7, height: 7)
                        Text(m.label).font(.system(size: 13, weight: .semibold)).foregroundStyle(m.count > 0 ? Theme.text : Theme.muted)
                        Spacer()
                        Text(m.count > 0 ? "\(Fmt.int(m.kcal)) kcal · \(Fmt.int(m.protein)) g" : "–")
                            .font(.label(13)).foregroundStyle(m.count > 0 ? Theme.text : Theme.faint)
                    }
                }
            }
            Spacer(minLength: 0)
            HStack(spacing: 8) {
                infoTile(icon: "figure.strengthtraining.traditional", title: "Treenit viikolla", value: "\(d.workoutsThisWeek)", sub: d.nextWorkout.map { "\($0.label): \($0.name)" })
                infoTile(icon: "scalemass.fill", title: "Paino", value: d.weight.map { Fmt.one($0.value) + " kg" } ?? "–", sub: nil)
            }
            NextReminderView(next: d.next)
        }
    }

    private func infoTile(icon: String, title: String, value: String, sub: String?) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Label(title, systemImage: icon).font(.system(size: 10.5, weight: .semibold)).foregroundStyle(Theme.muted).lineLimit(1)
            Text(value).font(.display(20)).foregroundStyle(Theme.text)
            if let sub { Text(sub).font(.system(size: 10.5, weight: .medium)).foregroundStyle(Theme.accentStrong).lineLimit(1) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10).padding(.vertical, 7)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.surface2))
    }

    private func dayTitle() -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "fi_FI")
        f.dateFormat = "EEEE d.M."
        return f.string(from: entry.date).uppercased()
    }
}
