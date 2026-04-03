/**
 * API Key 管理页
 */

import * as React from "react"
import { PlusIcon, Loader2Icon, Trash2Icon } from "lucide-react"
import { Button, Input, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Label } from "@downcity/ui"
import { DashboardModule } from "@/components/dashboard/DashboardModule"
import type {
  UiAuthAccessIssuedToken,
  UiAuthAccessTokenSummary,
} from "@/types/AuthAccess"

export interface AccessSectionProps {
  tokens: UiAuthAccessTokenSummary[]
  loading: boolean
  latestIssuedToken: UiAuthAccessIssuedToken | null
  formatTime: (value?: string | number | null) => string
  onCreateToken: (input: { name: string; expiresAt?: string }) => Promise<void>
  onDeleteToken: (input: { tokenId: string }) => Promise<void>
  onClearLatestIssuedToken: () => void
}

export function AccessSection(props: AccessSectionProps) {
  const { tokens, loading, onCreateToken, onDeleteToken, onClearLatestIssuedToken, latestIssuedToken, formatTime } = props

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [tokenName, setTokenName] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const [deletingId, setDeletingId] = React.useState<string>("")

  const activeCount = React.useMemo(() => tokens.length, [tokens])

  const handleCreate = React.useCallback(async () => {
    if (!tokenName.trim()) return
    try {
      setCreating(true)
      await onCreateToken({ name: tokenName.trim() })
      setTokenName("")
      // 不关闭 dialog，useEffect 会在 latestIssuedToken 更新后显示 token
    } finally {
      setCreating(false)
    }
  }, [onCreateToken, tokenName])

  const handleDelete = React.useCallback(async (tokenId: string) => {
    try {
      setDeletingId(tokenId)
      await onDeleteToken({ tokenId })
    } finally {
      setDeletingId("")
    }
  }, [onDeleteToken])

  React.useEffect(() => {
    if (latestIssuedToken) {
      setDialogOpen(true)
    }
  }, [latestIssuedToken])

  return (
    <>
      <DashboardModule
        title="Tokens"
        description={`${tokens.length} total · ${activeCount} active`}
        actions={
          <Button
            type="button"
            size="sm"
            className="h-8 rounded-[11px]"
            onClick={() => setDialogOpen(true)}
            disabled={loading}
          >
            <PlusIcon className="mr-1 size-4" />
            新建
          </Button>
        }
      >
        {tokens.length === 0 ? (
          <div className="rounded-[18px] bg-secondary py-6 text-center text-sm text-muted-foreground">
            暂无 token
          </div>
        ) : (
          <div className="space-y-1">
            {tokens.map((token) => (
              <div
                key={token.id}
                className="group flex items-center gap-3 rounded-[12px] px-3 py-2.5 hover:bg-secondary"
              >
                <span className="truncate text-sm">{token.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatTime(token.createdAt)}
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8 rounded-[10px] text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleDelete(token.id)}
                  disabled={deletingId === token.id}
                >
                  {deletingId === token.id ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <Trash2Icon className="size-4" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </DashboardModule>

      {/* New Token Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[min(92vw,400px)]">
          <DialogHeader>
            <DialogTitle>{latestIssuedToken ? "Token 已创建" : "新建 Token"}</DialogTitle>
          </DialogHeader>

          {latestIssuedToken ? (
            <div className="space-y-4 px-4 py-2">
              <p className="text-sm text-muted-foreground">
                请保存此 token，它只会显示一次
              </p>
              <code className="block break-all rounded-[12px] bg-secondary px-3 py-3 text-xs">
                {latestIssuedToken.token}
              </code>
            </div>
          ) : (
            <div className="space-y-4 px-4 py-2">
              <div className="space-y-2">
                <Label className="text-xs">名称</Label>
                <Input
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  placeholder="Token 名称"
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  autoFocus
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {latestIssuedToken ? (
              <Button
                size="sm"
                onClick={() => {
                  onClearLatestIssuedToken()
                  setDialogOpen(false)
                }}
              >
                完成
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDialogOpen(false)}
                >
                  取消
                </Button>
                <Button
                  size="sm"
                  disabled={!tokenName.trim() || creating}
                  onClick={() => void handleCreate()}
                >
                  {creating && <Loader2Icon className="mr-2 size-4 animate-spin" />}
                  创建
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
