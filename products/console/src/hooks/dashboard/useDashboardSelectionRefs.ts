/**
 * Console Dashboard 当前选择项引用。
 *
 * 关键点（中文）
 * - 将 selected session / archive 的最新值保存在 ref 中，供异步刷新逻辑读取。
 */

import { useEffect, useRef } from "react";

export function useDashboardSelectionRefs(selected_session_id: string, selected_archive_id: string) {
  const selected_session_id_ref = useRef("");
  const selected_archive_id_ref = useRef("");

  useEffect(() => {
    selected_session_id_ref.current = selected_session_id;
  }, [selected_session_id]);

  useEffect(() => {
    selected_archive_id_ref.current = selected_archive_id;
  }, [selected_archive_id]);

  return {
    selected_session_id_ref,
    selected_archive_id_ref,
  };
}
