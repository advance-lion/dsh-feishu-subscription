## 飞书豆包工作订阅 v0.4.0（跨平台预发布版）

同一插件包支持 Windows / macOS 桌面和 Linux Web。通过 DSH 的“添加插件”安装 `.tgz`、GitHub 仓库链接或本地解包目录；Windows 原有凭据目录和 DPAPI 格式保持兼容。

### 本次变化

- macOS 使用 Application Support 路径和系统 Keychain；Linux 使用 XDG 路径和持久 Secret Service。
- Mac / Linux 账号文件采用 AES-256-GCM；无桌面服务器可显式配置固定的 `FEISHU_SUBSCRIPTION_VAULT_KEY`。无可用密钥时明确报错，不保存明文。
- 无桌面 Linux 的扫码登录与安全验证页面显示在 DSH 内。用户亲自扫码、点击或拖动；官方验证成功后恢复原请求一次。预览结束后立即失效，不导出 Cookie、页面 URL 或远程调试端口。
- 新入口支持取消、超时和卸载清理；预览高度适配小窗口。Windows / Mac 默认继续使用独立 Chrome。
- 模型目录、请求参数、流式解析、归档与已读、提醒关闭、验证后恢复协议沿用 v0.3.2。

### 环境要求

- DSH 桌面或 Web，CLI 使用 Node.js 22+；DSH 所在机器安装 Google Chrome。
- Linux 浏览器以普通用户运行，并保留沙箱；无桌面环境不需要 Xvfb。
- Linux 使用 Secret Service 或固定服务器加密密钥。配置与安装说明见 README。
- Windows 原安装与账号不用迁移；桌面升级仍由应用内插件管理器完成。

### 验证与范围

- Windows / macOS / Ubuntu：回归测试、真实 Chrome 无头交互、打包、官方 DSH Profile 安装及实际 Web 宿主启动/RPC 检查。
- macOS Keychain / Linux Secret Service：在独立 CI 环境中验证原生密钥持久化、并发初始化及跨进程解密。
- Windows 真实企业账号：模型目录 13 项；人工验证码后原请求成功恢复，长回复结束标记与归档/已读清理确认成功。
- 实际 DSH 页面：内嵌官方扫码预览、完整标题/关闭按钮及取消流程已检查。

macOS / Linux 尚未完成真实企业账号的端到端登录和模型计费验收，当前作为预发布提供；CI 使用合成登录与验证码组件，不代表真人验证已被自动化。上游可能分批送达正文，流式展示不保证逐字匀速。

企业总额与剩余额度、真正“不保存历史”仍不在本次完成范围；继续使用已确认归属任务的归档方案，不删除已有对话。
