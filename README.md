<div align="center">

# 百度贴吧自动签到

[![百度贴吧](https://img.shields.io/badge/百度贴吧-passing-success.svg?style=flat-square&logo=baidu&logoWidth=20&logoColor=white)](https://github.com/chiupam/tieba/actions)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6-yellow.svg?style=flat-square&logo=javascript)](https://www.javascript.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-16.x-green.svg?style=flat-square&logo=node.js)](https://nodejs.org/)
[![GitHub stars](https://img.shields.io/github/stars/chiupam/tieba?style=flat-square&logo=github)](https://github.com/chiupam/tieba/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/chiupam/tieba?style=flat-square&logo=github)](https://github.com/chiupam/tieba/network/members)
[![License](https://img.shields.io/github/license/chiupam/tieba?style=flat-square)](LICENSE)

这是一个基于 GitHub Actions 的百度贴吧自动签到工具，可以帮助你每天自动完成贴吧签到，不会错过任何奖励。

</div>

## ✨ 功能特点

- 🔄 自动签到：每天自动完成所有关注贴吧的签到
- 🔐 安全可靠：只需配置BDUSS环境变量，无需泄露账号密码
- 📊 详细统计：签到后生成详细的统计报告，包含签到排名和连签天数
- 🚀 部署简单：一次配置，持续运行，无需服务器
- ⚡ 批量处理：支持批量签到，提高效率并避免请求限制
- 🔁 智能重试：对签到失败的贴吧自动进行多次重试，提高签到成功率
- 🧰 TypeScript：使用TypeScript开发，提供更好的类型安全和代码可维护性

## 📝 使用方法

### 🔑 1. 获取百度 BDUSS

首先需要获取百度的 BDUSS，这是百度贴吧 API 的登录凭证。

获取方法：
1. 登录百度贴吧网页版
2. 打开浏览器开发者工具（F12）
3. 切换到 "Application" 或 "应用" 标签
4. 在左侧找到 "Cookies"
5. 找到并复制 BDUSS 的值

> ⚠️ 注意：请勿泄露BDUSS，它相当于您的登录凭证！

### 🔱 2. Fork 本仓库

点击本仓库右上角的 "Fork" 按钮，将本项目复制到您自己的 GitHub 账号下。

### 🔒 3. 配置 GitHub Secrets

在您 Fork 的仓库中：

1. 点击 "Settings" → "Secrets and variables" → "Actions"
2. 点击 "New repository secret" 按钮
3. 添加 Secret：
   - 名称：`BDUSS`
   - 值：您的百度 BDUSS 值

### ▶️ 4. 启用 GitHub Actions

1. 在您 Fork 的仓库中，点击 "Actions" 标签
2. 点击 "I understand my workflows, go ahead and enable them"
3. 找到 "百度贴吧自动签到" workflow 并启用

现在，系统会按照预设的时间（默认每天凌晨）自动运行签到脚本。

## 🖱️ 手动触发签到

如果你想立即测试签到功能，可以手动触发：

1. 进入 "Actions" 标签
2. 选择 "百度贴吧自动签到" workflow
3. 点击 "Run workflow" 按钮
4. 点击 "Run workflow" 确认运行

> 💡 **提示**：手动触发时会使用您在GitHub Secrets中配置的环境变量，如果没有配置则使用默认值。

## ⚙️ 高级设置

### 💻 环境变量配置

本项目使用环境变量进行配置，可以在GitHub Secrets中设置以下变量：

#### 基础配置

| 变量名 | 必填 | 说明 | 默认值 |
| ----- | ---- | ---- | ----- |
| `BDUSS` | ✅ | 百度贴吧登录凭证，用于身份验证 | 无 |
| `BATCH_SIZE` | ❌ | 每批签到的贴吧数量 | 20 |
| `BATCH_INTERVAL` | ❌ | 批次之间的等待时间(毫秒) | 1000 |
| `MAX_RETRIES` | ❌ | 签到失败时的最大重试次数 | 3 |
| `RETRY_INTERVAL` | ❌ | 重试之间的等待时间(毫秒) | 5000 |
| `ENABLE_NOTIFY` | ❌ | 是否启用通知推送功能 | false |

#### 📲 通知配置

启用通知推送功能后（`ENABLE_NOTIFY=true`），可以配置以下通知渠道（至少需要配置一个）：

| 变量名 | 说明 | 参考文档 |
| ----- | ---- | ------- |
| `SERVERCHAN_KEY` | Server酱的推送密钥 | [Server酱文档](https://sct.ftqq.com/) |
| `BARK_KEY` | Bark推送密钥或完整URL | [Bark文档](https://github.com/Finb/Bark) |
| `TG_BOT_TOKEN` | Telegram机器人Token | [Telegram Bot API](https://core.telegram.org/bots/api) |
| `TG_CHAT_ID` | Telegram接收消息的用户或群组ID | [获取Chat ID教程](https://core.telegram.org/bots/features#chat-id) |
| `DINGTALK_WEBHOOK` | 钉钉机器人的Webhook URL | [钉钉自定义机器人文档](https://open.dingtalk.com/document/robots/custom-robot-access) |
| `DINGTALK_SECRET` | 钉钉机器人的安全密钥(可选) | 同上 |
| `WECOM_KEY` | 企业微信机器人的WebHook Key | [企业微信机器人文档](https://developer.work.weixin.qq.com/document/path/91770) |
| `PUSHPLUS_TOKEN` | PushPlus推送Token | [PushPlus文档](https://www.pushplus.plus/) |

> 💡 **提示**：您可以根据自己的需求配置一个或多个通知渠道。如果配置了多个渠道，脚本将向所有渠道发送通知。

**设置方法**:
- 在仓库中点击 Settings → Secrets and variables → Actions
- 点击 "New repository secret" 添加以上对应的配置项

### ⏰ 自定义签到时间

修改 `.github/workflows/tieba-signin.yml` 文件中的 cron 表达式。默认为每天凌晨 2 点（UTC 时间，即北京时间上午 10 点）。

## 📈 查看签到结果

签到完成后，可以在 Actions 的运行记录中查看详细的签到结果和统计信息，包括：
- ✅ 签到成功数量与贴吧列表
- 📌 已经签到的贴吧数量
- ❌ 签到失败的贴吧及原因
- 🏅 成功签到贴吧的排名和连签天数

## 🧪 本地测试

您可以在本地环境中测试签到功能，无需依赖GitHub Actions。

### 本地测试准备工作

1. 克隆此仓库到本地：
   ```bash
   git clone https://github.com/chiupam/tieba.git
   cd tieba
   ```

2. 安装依赖：
   ```bash
   npm install
   ```

3. 创建`.env`文件，用于配置本地测试环境变量：
   ```bash
   cp .env.example .env
   ```

4. 编辑`.env`文件，填入您的`BDUSS`和其他配置

### 测试命令

运行本地测试：
```bash
npm test
```

这个命令会先编译TypeScript代码，然后执行local-test.js文件。

> 💡 **提示**：
> - 要测试BDUSS失效的情况，可以在`.env`文件中填写错误的BDUSS值
> - 本地测试默认使用更小的批次大小和间隔时间

### 开发环境运行

如果你想在开发过程中直接使用ts-node运行TypeScript文件，可以使用：

```bash
npm run dev
```

### 通知行为

本项目的通知逻辑为：

1. 只有当以下情况时才会发送通知：
   - **贴吧签到失败**且**开启了通知功能**时
   - **BDUSS失效**且**开启了通知功能**时
2. 当所有贴吧签到成功时，即使开启了通知功能也不会发送通知

> 💡 **提示**：本地测试时BDUSS的有效性会直接影响到结果，如需测试不同场景，可以修改`.env`文件中的BDUSS值

## 🔄 仓库同步

如果您Fork了本仓库，您可以启用自动同步功能，这样您的Fork仓库将会定期与上游仓库保持同步。

### 启用自动同步

1. 在您Fork的仓库中，进入 "Actions" 标签页
2. 您可能会看到一个提示，点击 "I understand my workflows, go ahead and enable them"
3. 在工作流列表中找到 "同步上游仓库更新" 并启用它
4. 此工作流将会每天自动运行，也可以通过点击 "Run workflow" 手动触发

启用后，您的Fork仓库将会自动与原仓库保持同步，无需手动操作。

## 📁 项目结构

```
tieba/
├── .github/                          # GitHub相关配置
│   └── workflows/                    # GitHub Actions工作流
│       ├── build.yml                 # TypeScript构建工作流
│       ├── keep-alive.yml            # 保持仓库活跃工作流
│       ├── sync-upstream.yml         # 同步上游仓库工作流
│       └── tieba-signin.yml          # 贴吧签到主工作流
├── src/                              # 源代码目录
│   ├── apiService.ts                 # API服务模块，处理与百度服务器的通信
│   ├── dataProcessor.ts              # 数据处理模块，负责处理和生成统计数据
│   ├── index.ts                      # 主程序入口，协调各模块工作并实现签到逻辑
│   ├── local-test.ts                 # 本地测试脚本
│   ├── notify.ts                     # 通知模块，处理各种推送服务的消息发送
│   ├── utils.ts                      # 工具函数模块，提供通用功能
│   └── types/                        # TypeScript类型定义
│       ├── index.ts                  # 类型定义入口
│       ├── apiService.types.ts       # API服务相关类型
│       ├── dataProcessor.types.ts    # 数据处理相关类型
│       ├── notify.types.ts           # 通知相关类型
│       └── utils.types.ts            # 工具函数相关类型
├── dist/                             # 编译后的JavaScript代码（由build.yml自动构建并提交）
│   ├── types/                        # 编译后的类型定义
│   ├── apiService.js                 # 编译后的API服务模块
│   ├── dataProcessor.js              # 编译后的数据处理模块
│   ├── index.js                      # 编译后的主脚本文件
│   ├── local-test.js                 # 编译后的本地测试脚本
│   ├── notify.js                     # 编译后的通知模块
│   └── utils.js                      # 编译后的工具函数模块
├── js-backup/                        # JavaScript原始文件备份
├── .env.example                      # 环境变量示例文件
├── tsconfig.json                     # TypeScript配置文件
├── .gitignore                        # Git忽略文件配置
├── LICENSE                           # 开源协议
├── package.json                      # 项目配置和依赖管理
├── README.md                         # 项目说明文档
└── tsconfig.json                     # TypeScript配置文件
```

## ❓ 常见问题

### 🔧 签到失败怎么办？

- 🔍 检查 BDUSS 是否正确且未过期
- 📋 查看 Actions 运行日志，确认具体错误原因
- 🔄 如果 BDUSS 过期，请重新获取并更新 Secret
- ⏱️ 签到过快导致失败时，可以尝试增大批次间隔时间
- 🔁 对于偶发的网络问题，脚本会自动进行重试（最多3次），可通过配置`MAX_RETRIES`和`RETRY_INTERVAL`调整重试次数和间隔

### 🆕 如何获取新BDUSS？

BDUSS一般有效期较长，但如果失效，需要重新获取。方法同初始配置步骤，然后更新GitHub Secrets中的值。

## ⚖️ 免责声明

本工具仅供学习交流使用，请勿用于任何商业用途。使用本工具产生的任何后果由使用者自行承担。

## 📜 开源协议

MIT

## ⚠️ 免责声明

**请仔细阅读以下声明：**

1. 📚 本项目仅供学习和研究目的使用，不得用于商业或非法用途
2. 📋 使用本项目可能违反百度贴吧的服务条款，请自行评估使用风险
3. ⚠️ 本项目不保证功能的可用性，也不保证不会被百度官方检测或封禁
4. 🛡️ 使用本项目造成的任何问题，包括但不限于账号被封禁、数据丢失等，项目作者概不负责
5. 📢 用户需自行承担使用本项目的全部风险和法律责任

#
