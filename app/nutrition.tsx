import { NutritionBuddyScreen } from "../src/features/nutrition/NutritionBuddyScreen";
import { goHub } from "../src/app-shell/navigation";

export default function NutritionRoute() {
  return <NutritionBuddyScreen onBack={goHub} />;
}
