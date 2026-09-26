import {
  Building2,
  Calculator,
  CirclePlus,
  FileChartColumn,
  FileText,
  History,
  LayoutDashboard,
  Megaphone,
  Printer,
  ScrollText,
  Search,
  Settings,
  Undo2,
  User,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * One icon per menu destination, keyed by the stable `key` of `src/lib/cms-shell-navigation.ts`
 * (the navigation module stays free of React so server code and tests can import it).
 */
export const NAV_ICONS: Record<string, LucideIcon> = {
  announcements: Megaphone,
  dashboard: LayoutDashboard,
  "shipment-new": CirclePlus,
  shipments: FileText,
  rts: Undo2,
  "print-label": Printer,
  "contacts-sender": User,
  "contacts-recipient": Users,
  "tracking-lookup": Search,
  "quick-rate": Calculator,
  "shipment-report": FileChartColumn,
  "print-history-report": History,
  settings: Settings,
  "platform-overview": LayoutDashboard,
  "platform-tenants": Building2,
  "platform-registrations": UserPlus,
  "platform-audit": ScrollText,
  "platform-announcements": Megaphone,
};
