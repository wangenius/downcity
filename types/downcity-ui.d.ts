/**
 * Downcity UI SDK 本地开发声明。
 *
 * 关键说明（中文）
 * - 这里用于仓库内未安装 workspace 依赖时的类型兜底。
 * - 运行时仍由 Vite 别名指向 `packages/downcity-ui/src` 的真实源码。
 */

declare module "@downcity/ui" {
  export function cn(...inputs: unknown[]): string;

  export const Button: any;
  export const buttonVariants: any;
  export const Badge: any;
  export const badgeVariants: any;
  export const Card: any;
  export const CardAction: any;
  export const CardContent: any;
  export const CardDescription: any;
  export const CardFooter: any;
  export const CardHeader: any;
  export const CardTitle: any;
  export const DropdownMenu: any;
  export const DropdownMenuCheckboxItem: any;
  export const DropdownMenuContent: any;
  export const DropdownMenuGroup: any;
  export const DropdownMenuItem: any;
  export const DropdownMenuLabel: any;
  export const DropdownMenuPortal: any;
  export const DropdownMenuRadioGroup: any;
  export const DropdownMenuRadioItem: any;
  export const DropdownMenuSeparator: any;
  export const DropdownMenuShortcut: any;
  export const DropdownMenuSub: any;
  export const DropdownMenuSubContent: any;
  export const DropdownMenuSubTrigger: any;
  export const DropdownMenuTrigger: any;
  export const Popover: any;
  export const PopoverContent: any;
  export const PopoverTrigger: any;
  export const Toaster: any;
}
