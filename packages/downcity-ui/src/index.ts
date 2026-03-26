/**
 * Downcity UI SDK 导出入口。
 *
 * 关键说明（中文）
 * - 这里只导出可复用的基础 UI 原语，不导出业务组件。
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
export { Toaster } from "./components/sonner";
