<div align="center">

# 百度贴吧自动签到

一个面向单账号的 GitHub Actions 贴吧自动签到工具。每天北京时间 08:00 自动运行，并通过 QQ 邮箱报告准确结果。

</div>

## 功能

- 单账号自动签到，支持批次并发和有上限的指数退避重试。
- 所有贴吧请求均使用 HTTPS，并设置明确的请求超时。
- 成功、部分失败和执行失败都会发送一封 QQ 邮件。
- 只要仍有贴吧失败或邮件发送失败，GitHub Actions 就会显示失败。
- 控制台对贴吧名称脱敏，邮件列出最终失败贴吧和原因。
- 自动化测试不访问百度、不发送真实邮件，也不需要 BDUSS。

## 配置 GitHub Secrets

Fork 后进入仓库的 `Settings → Secrets and variables → Actions`，添加以下四个 Repository secrets：

| 名称 | 用途 |
| --- | --- |
| `BDUSS` | 百度贴吧登录凭据 |
| `MAIL_USERNAME` | QQ 邮箱账号，例如 `123456@qq.com` |
| `MAIL_PASSWORD` | QQ 邮箱 SMTP 授权码，不是 QQ 密码 |
| `MAIL_TO` | 接收签到结果的邮箱地址 |

QQ 邮箱需要先在邮箱设置中开启 SMTP 服务并生成授权码。请勿在代码、Issue、日志或截图中公开 BDUSS 和 SMTP 授权码。

## 运行时间与手动测试

`.github/workflows/tieba-signin.yml` 每天 UTC 00:00 触发，对应北京时间 08:00。GitHub 的定时任务可能因平台调度略有延迟。

需要立即测试时，进入仓库的 `Actions → 百度贴吧自动签到 → Run workflow` 手动运行。一次运行最终只有三种业务状态：

- `签到成功`：所有贴吧都新签到成功或已经签到，并且邮件发送成功。
- `部分失败`：至少一个贴吧在最终重试后仍失败；邮件发出后 Workflow 标记失败。
- `执行失败`：BDUSS 无效、配置错误或关键请求无法完成；能使用邮箱配置时仍会发送失败邮件。

邮件发送失败也会让 Workflow 标记失败，避免出现“没有收到通知但页面显示成功”的情况。

## 本地检查与运行

需要 Node.js 22 或更高版本。

```bash
git clone https://github.com/yunnre060214-sudo/tieba.git
cd tieba
npm ci
npm run check
cp .env.example .env
```

填写 `.env` 中的四项必需配置后，可执行：

```bash
npm run dev
```

`npm run check` 只进行类型检查、离线测试和构建，不会真实签到或发送邮件；`npm run dev` 会执行真实签到并发送结果邮件。

## 可选参数

| 变量 | 默认值 | 合法范围 | 说明 |
| --- | ---: | ---: | --- |
| `BATCH_SIZE` | 5 | 1–20 | 每批最多并发签到数 |
| `BATCH_INTERVAL_MS` | 1500 | 0–60000 | 批次之间的等待时间 |
| `MAX_RETRIES` | 3 | 0–5 | 单个贴吧瞬时失败后的额外尝试次数 |
| `RETRY_BASE_DELAY_MS` | 3000 | 500–60000 | 首次重试的基础等待时间 |
| `REQUEST_TIMEOUT_MS` | 10000 | 1000–60000 | 单次贴吧请求超时 |

这些参数不是必填项。GitHub Actions 如需覆盖默认值，可在工作流的 `env` 中增加对应变量。

## 常见问题

如果提示 BDUSS 失效，请重新登录百度贴吧并更新仓库 Secret。若提示需要验证码、未加入贴吧或等级不足，这类永久错误不会反复重试；请在贴吧客户端或网页中手动处理。网络中断、超时、HTTP 429 和服务端错误属于瞬时错误，程序会自动退避重试。

如果签到完成但 Workflow 因邮件失败而标红，请确认 QQ 邮箱已开启 SMTP、授权码正确、发件账号与 `MAIL_USERNAME` 一致，并检查收件地址。

## 安全与风险

BDUSS 等同于登录凭据，请只保存于 GitHub Secrets 或本地 `.env`。本项目依赖百度贴吧现有网页接口，它们可能随时调整，也可能触发验证码或平台风控。项目不提供验证码识别、风控规避或可用性保证，使用者需自行评估账号和平台规则风险。

## 许可证

[MIT](LICENSE)
