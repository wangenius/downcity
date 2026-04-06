/**
 * Extension Popup 头部操作图标。
 *
 * 关键点（中文）：
 * - 统一使用 SVG 图标替代字符符号，稳定控制尺寸、描边和留白。
 * - 图形语言遵循 control-plane 风格：克制、利落、带一点机械感。
 * - 所有图标默认继承父级颜色，便于按钮在 hover / disabled 状态下统一响应。
 */

export function PopupChevronLeftIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="size-[18px]"
    >
      <path
        d="M14.75 6.75L9 12l5.75 5.25"
        stroke="currentColor"
        strokeWidth="1.95"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 12h8"
        stroke="currentColor"
        strokeWidth="1.95"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PopupChevronRightIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="size-[18px]"
    >
      <path
        d="M9.25 6.75L15 12l-5.75 5.25"
        stroke="currentColor"
        strokeWidth="1.95"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 12h8"
        stroke="currentColor"
        strokeWidth="1.95"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PopupSettingsSlidersIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="size-[18px]"
    >
      <path
        d="M6.5 5.5v13"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
      />
      <path
        d="M17.5 5.5v13"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
      />
      <path
        d="M6.5 9.5h4"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
      />
      <path
        d="M13.5 14.5h4"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
      />
      <circle
        cx="11.75"
        cy="9.5"
        r="2.15"
        stroke="currentColor"
        strokeWidth="1.85"
      />
      <circle
        cx="12.25"
        cy="14.5"
        r="2.15"
        stroke="currentColor"
        strokeWidth="1.85"
      />
    </svg>
  );
}
