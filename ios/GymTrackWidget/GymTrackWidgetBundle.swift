import SwiftUI
import WidgetKit

@main
struct GymTrackWidgetBundle: WidgetBundle {
    var body: some Widget {
        NutritionWidget()
        TasksWidget()
        DashboardWidget()
    }
}
