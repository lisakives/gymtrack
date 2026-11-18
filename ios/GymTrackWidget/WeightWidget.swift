import Charts
import SwiftUI
import WidgetKit

struct WeightWidget: Widget {
    let kind = "GymTrackWeight"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: GTProvider()) { entry in
            WeightView(entry: entry)
        }
        .configurationDisplayName("Paino")
        .description("Viimeisin paino, muutos ja kehitys käyränä.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}

struct WeightChart: View {
    var points: [WidgetSnapshot.WeightPoint]
    var goal: Double?
    var showGoal = false

    var body: some View {
        let values = points.map(\.value) + (showGoal ? [goal].compactMap { $0 } : [])
        let lo = (values.min() ?? 0) - 0.6
        let hi = (values.max() ?? 1) + 0.6
        Chart {
            ForEach(Array(points.enumerated()), id: \.offset) { i, p in
                AreaMark(x: .value("i", i), yStart: .value("min", lo), yEnd: .value("kg", p.value))
                    .foregroundStyle(LinearGradient(colors: [Theme.accent.opacity(0.35), Theme.accent.opacity(0)], startPoint: .top, endPoint: .bottom))
                    .interpolationMethod(.catmullRom)
                LineMark(x: .value("i", i), y: .value("kg", p.value))
                    .foregroundStyle(Theme.accent)
                    .lineStyle(StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
                    .interpolationMethod(.catmullRom)
            }
            if let last = points.indices.last {
                PointMark(x: .value("i", last), y: .value("kg", points[last].value))
                    .foregroundStyle(Theme.accentStrong)
                    .symbolSize(40)
            }
            if showGoal, let goal {
                RuleMark(y: .value("tavoite", goal))
                    .foregroundStyle(Theme.good.opacity(0.7))
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
            }
        }
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .chartYScale(domain: lo...hi)
        .chartLegend(.hidden)
        .widgetAccentable()
    }
}

struct WeightView: View {
    @Environment(\.widgetFamily) private var family
    var entry: GTEntry

    var body: some View {
        content
            .gtBackground(family)
            .widgetURL(URL(string: "gymtrack://body"))
    }

    private func changeText(_ d: DayState) -> some View {
        Group {
            if let c = d.weightChange {
                Text("\(c > 0 ? "+" : c < 0 ? "−" : "±")\(Fmt.one(abs(c))) kg")
                    .foregroundStyle(d.weightChangeIsGood == true ? Theme.good : d.weightChangeIsGood == false ? Theme.accentStrong : Theme.muted)
            } else {
                Text("Ensimmäinen mittaus").foregroundStyle(Theme.muted)
            }
        }
        .font(.label(13))
    }

    @ViewBuilder private var content: some View {
        let d = entry.day
        let current = d.weights.last?.value ?? d.weight?.value
        switch family {
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 1) {
                Label(current.map { "\(Fmt.one($0)) kg" } ?? "Ei mittauksia", systemImage: "scalemass.fill").font(.label(15)).widgetAccentable()
                if d.weights.count >= 2 { WeightChart(points: d.weights, goal: nil).frame(height: 22) }
            }
        case .systemMedium:
            if !d.hasData { EmptyStateView() } else {
                HStack(spacing: 14) {
                    VStack(alignment: .leading, spacing: 4) {
                        WidgetHeader(icon: "scalemass.fill", title: "Paino")
                        Spacer(minLength: 0)
                        HStack(alignment: .firstTextBaseline, spacing: 3) {
                            Text(current.map { Fmt.one($0) } ?? "–").font(.display(34)).foregroundStyle(Theme.text)
                            Text("kg").font(.label(14)).foregroundStyle(Theme.muted)
                        }
                        changeText(d)
                        Spacer(minLength: 0)
                        if let goal = d.goalWeight {
                            Text("Tavoite \(Fmt.one(goal)) kg").font(.system(size: 11, weight: .medium)).foregroundStyle(Theme.muted)
                        } else {
                            Text("\(d.weights.count) mittausta").font(.system(size: 11, weight: .medium)).foregroundStyle(Theme.muted)
                        }
                    }
                    .frame(width: 112, alignment: .leading)
                    if d.weights.count >= 2 {
                        WeightChart(points: d.weights, goal: d.goalWeight, showGoal: true)
                    } else {
                        Text("Lisää mittauksia, niin kehitys näkyy käyränä.").font(.system(size: 12)).foregroundStyle(Theme.muted)
                    }
                }
            }
        default:
            if !d.hasData { EmptyStateView() } else {
                VStack(alignment: .leading, spacing: 2) {
                    WidgetHeader(icon: "scalemass.fill", title: "Paino")
                    HStack(alignment: .firstTextBaseline, spacing: 3) {
                        Text(current.map { Fmt.one($0) } ?? "–").font(.display(30)).foregroundStyle(Theme.text)
                        Text("kg").font(.label(13)).foregroundStyle(Theme.muted)
                    }
                    .padding(.top, 2)
                    changeText(d)
                    Spacer(minLength: 4)
                    if d.weights.count >= 2 { WeightChart(points: d.weights, goal: d.goalWeight) }
                }
            }
        }
    }
}
