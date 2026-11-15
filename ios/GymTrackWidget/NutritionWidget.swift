import SwiftUI
import WidgetKit

struct NutritionWidget: Widget {
    let kind = "GymTrackNutrition"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: GTProvider()) { entry in
            NutritionView(entry: entry)
        }
        .configurationDisplayName("Ravinto")
        .description("Päivän kalorit ja proteiini suhteessa tavoitteeseen.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

struct NutritionView: View {
    @Environment(\.widgetFamily) private var family
    var entry: GTEntry

    var body: some View {
        content
            .gtBackground(family)
            .widgetURL(URL(string: "gymtrack://food"))
    }

    @ViewBuilder private var content: some View {
        let d = entry.day
        switch family {
        case .accessoryCircular:
            Gauge(value: min(d.kcal, max(d.goalKcal, 1)), in: 0...max(d.goalKcal, 1)) {
                Image(systemName: "flame.fill")
            } currentValueLabel: {
                Text(d.kcal >= 10000 ? "\(Int(d.kcal / 1000))k" : Fmt.int(d.kcal)).font(.label(13))
            }
            .gaugeStyle(.accessoryCircular)
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 2) {
                Label("\(Fmt.int(d.kcal)) / \(Fmt.int(d.goalKcal)) kcal", systemImage: "flame.fill")
                    .font(.label(15)).widgetAccentable()
                ProgressView(value: min(d.kcalProgress, 1))
                Text("Proteiini \(Fmt.int(d.protein)) / \(Fmt.int(d.goalProtein)) g").font(.system(size: 12, weight: .medium))
            }
        case .accessoryInline:
            Label("\(Fmt.int(d.kcal)) kcal · \(Fmt.int(d.protein)) g proteiinia", systemImage: "flame.fill")
        case .systemMedium:
            if d.hasData { medium(d) } else { EmptyStateView() }
        default:
            if d.hasData { small(d) } else { EmptyStateView() }
        }
    }

    private func small(_ d: DayState) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            WidgetHeader(icon: "flame.fill", title: "Ravinto")
            ZStack {
                Ring(progress: d.kcalProgress, lineWidth: 9)
                VStack(spacing: -2) {
                    Text(Fmt.int(d.kcal)).font(.display(26)).foregroundStyle(Theme.text).minimumScaleFactor(0.6)
                    Text("/ \(Fmt.int(d.goalKcal)) kcal").font(.system(size: 9.5, weight: .semibold)).foregroundStyle(Theme.muted)
                }
                .padding(.horizontal, 10)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            MacroRow(label: "Proteiini", value: d.protein, goal: d.goalProtein, color: Theme.protein)
        }
    }

    private func medium(_ d: DayState) -> some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 8) {
                WidgetHeader(icon: "flame.fill", title: "Ravinto")
                ZStack {
                    Ring(progress: d.kcalProgress, lineWidth: 10)
                    VStack(spacing: -2) {
                        Text(Fmt.int(d.kcal)).font(.display(28)).foregroundStyle(Theme.text).minimumScaleFactor(0.6)
                        Text("kcal").font(.system(size: 10, weight: .semibold)).foregroundStyle(Theme.muted)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .frame(width: 112)

            VStack(alignment: .leading, spacing: 9) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(d.kcal > d.goalKcal && d.goalKcal > 0 ? "Yli tavoitteen" : "Jäljellä")
                        .font(.system(size: 11, weight: .medium)).foregroundStyle(Theme.muted)
                    HStack(alignment: .firstTextBaseline, spacing: 3) {
                        Text(Fmt.int(d.kcal > d.goalKcal ? d.kcal - d.goalKcal : d.kcalLeft))
                            .font(.display(24)).foregroundStyle(d.kcal > d.goalKcal * 1.1 && d.goalKcal > 0 ? Theme.accentStrong : Theme.text)
                        Text("kcal").font(.label(12)).foregroundStyle(Theme.muted)
                    }
                }
                MacroRow(label: "Proteiini", value: d.protein, goal: d.goalProtein, color: Theme.protein)
                MacroRow(label: "Hiilihydraatit", value: d.carbs, goal: d.goalCarbs, color: Theme.accent.opacity(0.75))
                MacroRow(label: "Rasva", value: d.fat, goal: d.goalFat, color: Theme.muted)
            }
        }
    }
}
