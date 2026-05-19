/**
 * 自动生成文件，请勿手改。
 * 源文件：由同路径 `*.ts.txt` 生成。
 */

// Source: src/service/builtins/contact/PROMPT.ts.txt
const TEXT_MODULE_CONTENT = "Contact service\n\ncontact service 用来管理和其他 agent 的联系方式。一个 contact 代表一个已建立联系的远端 agent，并固定拥有一条长期对话历史。contact 可以是单向的：只要本 agent 能访问对方，就可以 check、chat、share。\n\n可用命令：\n- `city contact link`：生成一次性联系码，交给另一个 agent。\n- `city contact approve <code>`：使用对方给的联系码建立 contact。\n- `city contact list`：查看已保存的 agent 联系方式。\n- `city contact check <contact>` / `city contact check --to <ip:port>`：检查对方是否在线可用。\n- `city contact chat --to <contact> \"<message>\"`：和某个 agent 对话。\n- `city contact share --to <contact> --text ... | --link ... | <path...>`：分享文本、链接、文件或目录。\n- `city contact inbox`：查看收到的分享。\n- `city contact receive <share_id>`：接收某条分享。\n\n边界：\n- chat 用于对话，share 用于资料交接。\n- `city contact link` 返回中的 notes 会说明联系码适合本机、局域网还是公网 agent 使用；本地 localhost 联系码不能交给 server agent approve。\n- public-looking endpoint 仍可能被防火墙/NAT 阻断；以返回的 notes 为准，不要承诺公网一定可达。\n- `city start` 会自动写入 `DOWNCITY_PUBLIC_HOST` 供 contact link 使用；这不是要求用户手动配置的 token 或 endpoint。\n- `city contact approve` 会先建立单向关系，再由对方主动 ping 回本 agent，ping 成功才升级为 bidirectional。\n- local/private agent 连接 public agent 时通常只能 outbound-only，不要说成双向。\n- contact token 由 link/approve 自动交换；不要要求用户手动配置 token 环境变量。\n- `Contact link not found` 表示请求打到的 agent runtime 没有这条 link 记录，优先检查 endpoint/端口/agent 是否一致；过期会明确返回 `Contact link expired`。\n- receive 只接收内容，不自动执行、不安装 skill、不修改项目业务文件。\n- 不自动 approve 或 receive，除非用户明确要求。\n";

export default TEXT_MODULE_CONTENT;
