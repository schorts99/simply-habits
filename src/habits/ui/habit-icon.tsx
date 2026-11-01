import { BookOpen, Droplets, Footprints, Leaf, Sparkles } from "lucide-react";
import type { HabitCategory } from "../domain/habit.entity";

const icons = { Wellbeing: Droplets, Movement: Footprints, Learning: BookOpen, Focus: Leaf, Everyday: Sparkles };
export function HabitIcon({ category, size = 22 }: { category: HabitCategory; size?: number }) {
  const Icon = icons[category];
  return <Icon size={size} strokeWidth={1.7} aria-hidden="true" />;
}
