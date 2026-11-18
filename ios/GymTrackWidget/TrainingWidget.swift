import SwiftUI
import WidgetKit

struct TrainingWidget: Widget {
    let kind = "GymTrackTraining"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: GTProvider()) { entry in
            TrainingView(entry: entry)
        }
        .configurationDisplayName("Treeni")
        .description("Seuraava treeni ja viikon treenit.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline])
    }
}

struct WeekDots: View {
    var week: [WidgetSnapshot.WeekDay]
    var today: String
    var size: CGFloat = 13

    var body: some View {
        HStack(spacing: 0) {
            ForEach(week, id: \.date) { d in
                VStack(spacing: 3) {
                    ZStack {
                        if d.done {
                            Circle().fill(Theme.accent).widgetAccentable()
                            Image(systemName: "checkmark").font(.system(size: size * 0.5, weight: .heavy)).foregroundStyle(.white)
                        } else if d.planned != nil {
                            Circle().strokeBorder(d.date < today ? Theme.faint : Theme.accent, lineWidth: 1.8)
                        } else {
                            Circle().fill(Theme.surface2)
                        }
                    }
                    .frame(width: size, height: size)
                    .overlay(
                        Circle().strokeBorder(Theme.text.opacity(d.date == today ? 0.9 : 0), lineWidth: 1)
                            .frame(width: size + 5, height: size + 5)
                    )
                    Text(d.label).font(.label(size * 0.72)).foregroundStyle(d.date == today ? Theme.text : Theme.muted)
                }
                .frame(maxWidth: .infinity)
            }
        }
    }
}

struct TrainingView: View {
    @Environment(\.widgetFamily) private var family
    var entry: GTEntry

    var body: some View {
        content
            .gtBackground(family)
            .widgetURL(URL(string: "gymtrack://workout"))
    }

    private var nextLabel: String { entry.day.nextWorkout?.label ?? "Seuraava" }
    private var nextName: String { entry.day.nextWorkout?.name ?? "Ei ohjelmaa" }

    @ViewBuilder private var content: some View {
        let d = entry.day
        switch family {
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 1) {
                Label("\(nextLabel): \(nextName)", systemImage: "dumbbell.fill").font(.label(15)).widgetAccentable().lineLimit(1)
                Text("Tällä viikolla \(d.workoutsThisWeek) treeniä").font(.system(size: 12, weight: .medium)).foregroundStyle(.secondary)
            }
        case .accessoryInline:
            Label("\(nextLabel): \(nextName)", systemImage: "dumbbell.fill")
        case .systemMedium:
            if d.hasData { medium(d) } else { EmptyStateView() }
        default:
            if d.hasData { small(d) } else { EmptyStateView() }
        }
    }

    private func nextBlock(_ d: DayState, nameSize: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(nextLabel.uppercased()).font(.label(12)).tracking(0.6).foregroundStyle(Theme.accentStrong)
            Text(nextName).font(.display(nameSize)).foregroundStyle(Theme.text).lineLimit(1).minimumScaleFactor(0.5)
        }
    }

    private func small(_ d: DayState) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            WidgetHeader(icon: "dumbbell.fill", title: "Treeni")
            Spacer(minLength: 0)
            nextBlock(d, nameSize: 30)
            Spacer(minLength: 0)
            if d.week.isEmpty {
                Text("Viikolla \(d.workoutsThisWeek) treeniä").font(.system(size: 12, weight: .medium)).foregroundStyle(Theme.muted)
            } else {
                WeekDots(week: d.week, today: d.dateISO, size: 12)
            }
        }
    }

    private func medium(_ d: DayState) -> some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                WidgetHeader(icon: "dumbbell.fill", title: "Treeni")
                Spacer(minLength: 0)
                nextBlock(d, nameSize: 34)
                Spacer(minLength: 0)
                HStack(spacing: 4) {
                    Image(systemName: "play.fill").font(.system(size: 10, weight: .bold))
                    Text("Aloita treeni").font(.label(13))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 10).padding(.vertical, 6)
                .background(Capsule().fill(Theme.accent))
                .widgetAccentable()
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text("\(d.workoutsThisWeek)").font(.display(30)).foregroundStyle(Theme.text)
                    Text(d.workoutsThisWeek == 1 ? "treeni\ntällä viikolla" : "treeniä\ntällä viikolla")
                        .font(.system(size: 10.5, weight: .medium)).foregroundStyle(Theme.muted).lineLimit(2)
                }
                if !d.week.isEmpty { WeekDots(week: d.week, today: d.dateISO, size: 13) }
                if let last = d.lastWorkout {
                    Text("Edellinen: \(last.name) \(Self.shortDate(last.date))")
                        .font(.system(size: 11, weight: .medium)).foregroundStyle(Theme.muted).lineLimit(1)
                }
            }
            .frame(width: 150)
        }
    }

    static func shortDate(_ iso: String) -> String {
        guard let d = DateUtil.parse(iso) else { return "" }
        if Calendar.current.isDateInToday(d) { return "tänään" }
        if Calendar.current.isDateInYesterday(d) { return "eilen" }
        let c = Calendar.current.dateComponents([.day, .month], from: d)
        return "\(c.day ?? 1).\(c.month ?? 1)."
    }
}
