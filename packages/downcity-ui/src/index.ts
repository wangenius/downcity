/**
 * Downcity UI SDK 导出入口。
 *
 * 关键说明（中文）
 * - 默认导出可复用的基础 UI 原语。
 * - 少量经过抽象的复合组件也会在这里公开，例如 workboard。
 * - `styles.css` 作为独立样式入口，由宿主应用按需引入。
 */

export { cn } from "./lib/utils";
export type {
  DowncityButtonSize,
  DowncityButtonVariant,
  DowncityCardSize,
  DowncityDropdownMenuItemVariant,
  DowncityToasterTheme,
} from "./types/components";
export type {
  DowncityWorkboardActivityItem,
  DowncityWorkboardActivityKind,
  DowncityWorkboardActivityStatus,
  DowncityWorkboardAgentSummary,
  DowncityWorkboardProps,
  DowncityWorkboardSignalItem,
  DowncityWorkboardSignalTone,
  DowncityWorkboardSnapshot,
  DowncityWorkboardSummary,
} from "./types/workboard";

export { Button, buttonVariants } from "./components/button";
export { Badge, badgeVariants } from "./components/badge";
export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./components/card";
export { Checkbox } from "./components/checkbox";
export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "./components/dialog";
export { Input } from "./components/input";
export { Label } from "./components/label";
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./components/dropdown-menu";
export {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./components/popover";
export { Separator } from "./components/separator";
export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetPortal,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from "./components/sheet";
export { Skeleton } from "./components/skeleton";
export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants } from "./components/tabs";
export { Textarea, type TextareaProps } from "./components/textarea";
export { Toaster } from "./components/sonner";
export { Toggle, toggleVariants } from "./components/toggle";
export { ToggleGroup, ToggleGroupItem } from "./components/toggle-group";
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "./components/tooltip";
export { Workboard } from "./components/workboard";
