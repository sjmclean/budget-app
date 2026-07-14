import {
  Archive,
  BadgeDollarSign,
  Bell,
  Bike,
  BookOpen,
  Box,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Camera,
  Car,
  CheckCircle2,
  CircleAlert,
  CircleHelp,
  Info,
  CircleX,
  Clapperboard,
  Coffee,
  CreditCard,
  Dumbbell,
  FileText,
  Gift,
  Grid3X3,
  Headphones,
  Heart,
  Home,
  Image,
  Layers3,
  Lightbulb,
  List,
  Mail,
  Music2,
  Package,
  Phone,
  PiggyBank,
  Plane,
  Radio,
  ShoppingCart,
  Star,
  Tag,
  Tv,
  Utensils,
  Video,
  WalletCards,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ComponentProps } from "react";
import type { TransactionTagIcon } from "./transactionTagIconTypes";

export const transactionTagIconOptions = [
  { value: "tag", label: "Tag", icon: Tag },
  { value: "money", label: "Money", icon: BadgeDollarSign },
  { value: "credit-card", label: "Credit card", icon: CreditCard },
  { value: "shopping", label: "Shopping", icon: ShoppingCart },
  { value: "coffee", label: "Coffee", icon: Coffee },
  { value: "food", label: "Food", icon: Utensils },
  { value: "car", label: "Car", icon: Car },
  { value: "plane", label: "Travel", icon: Plane },
  { value: "home", label: "Home", icon: Home },
  { value: "briefcase", label: "Work", icon: BriefcaseBusiness },
  { value: "heart", label: "Heart", icon: Heart },
  { value: "star", label: "Star", icon: Star },
  { value: "gift", label: "Gift", icon: Gift },
  { value: "calendar", label: "Calendar", icon: CalendarDays },
  { value: "trending", label: "Savings", icon: PiggyBank },
  { value: "wallet", label: "Wallet", icon: WalletCards },
  { value: "file", label: "Document", icon: FileText },
  { value: "music", label: "Music", icon: Music2 },
  { value: "movie", label: "Movie", icon: Clapperboard },
  { value: "gaming", label: "Gaming", icon: Box },
  { value: "book", label: "Book", icon: BookOpen },
  { value: "fitness", label: "Fitness", icon: Dumbbell },
  { value: "bike", label: "Bike", icon: Bike },
  { value: "package", label: "Package", icon: Package },
  { value: "layers", label: "Layers", icon: Layers3 },
  { value: "grid", label: "Grid", icon: Grid3X3 },
  { value: "list", label: "List", icon: List },
  { value: "complete", label: "Complete", icon: CheckCircle2 },
  { value: "cancelled", label: "Cancelled", icon: CircleX },
  { value: "warning", label: "Warning", icon: CircleAlert },
  { value: "info", label: "Information", icon: Info },
  { value: "idea", label: "Idea", icon: Lightbulb },
  { value: "tools", label: "Tools", icon: Wrench },
  { value: "settings", label: "Archive", icon: Archive },
  { value: "notification", label: "Notification", icon: Bell },
  { value: "mail", label: "Mail", icon: Mail },
  { value: "phone", label: "Phone", icon: Phone },
  { value: "camera", label: "Camera", icon: Camera },
  { value: "image", label: "Image", icon: Image },
  { value: "video", label: "Video", icon: Video },
  { value: "headphones", label: "Headphones", icon: Headphones },
  { value: "radio", label: "Radio", icon: Radio },
  { value: "television", label: "Television", icon: Tv },
  { value: "building", label: "Building", icon: Building2 },
  { value: "help", label: "Help", icon: CircleHelp },
] as const satisfies ReadonlyArray<{
  value: string;
  label: string;
  icon: LucideIcon;
}>;


const transactionTagIconById = new Map<TransactionTagIcon, LucideIcon>(
  transactionTagIconOptions.map((option) => [option.value, option.icon]),
);


export function TransactionTagIconGraphic({
  icon,
  ...props
}: {
  icon?: TransactionTagIcon;
} & ComponentProps<LucideIcon>) {
  const Icon = icon ? transactionTagIconById.get(icon) ?? Tag : Tag;
  return <Icon {...props} />;
}
