# 安全修复 TBS 301 重定向

## 背景与根因

2026-07-15 的定时运行和手动运行均在获取 TBS 阶段失败，日志为 `贴吧请求被拒绝（HTTP 301）`。独立 HTTP 探针确认：`https://tieba.baidu.com/dc/common/tbs` 返回 301，并要求跳转到 `http://tieba.baidu.com/dc/common/tbs?...`。当前传输层设置 `maxRedirects: 0`，因此把该响应归类为永久失败。

这不是 BDUSS、邮件 Secret 或 GitHub Actions 配置问题。根因是旧 Web TBS 接口出现 HTTPS 到 HTTP 的降级重定向，而重写后的客户端明确禁止重定向。

## 方案比较

1. 直接改用 HTTP TBS 地址：与旧上游一致，改动最小，但会通过明文连接传输 BDUSS，不采用。
2. 允许 Axios 自动跟随重定向：可能发生 HTTPS 到 HTTP 的安全降级，而且重定向库可能移除 Cookie，行为不可控，不采用。
3. 通过 `https://tiebac.baidu.com/c/s/login` 获取 TBS：请求和响应全程 HTTPS，TBS 位于成功响应的 `anti.tbs` 字段。采用该方案。

## 设计

`AxiosTiebaClient.login()` 改为调用移动端登录接口，并在一次响应中同时验证 BDUSS 和保存 TBS。请求体包含 `_client_version`、`bdusstoken` 和贴吧客户端 MD5 签名；签名只在内存中计算，BDUSS 不写入日志或错误对象。

`getTbs()` 不再访问旧 Web TBS 接口，而是返回最近一次成功登录缓存的 TBS。如果调用顺序错误或登录响应缺少 TBS，则抛出明确的永久错误。现有签到执行器始终先调用 `login()`，因此正常数据流保持为：登录并取得 TBS → 获取关注贴吧 → 对未签到贴吧执行签到。

传输层继续保持 `maxRedirects: 0`。所有业务接口仍要求 HTTPS；修复不通过放宽全局网络安全策略实现。

## 错误处理

- 移动端登录返回非零 `error_code`：归类为认证失败，并保持不泄露 BDUSS 的错误文本。
- 登录响应缺少 `anti.tbs`：归类为响应格式错误。
- 在成功登录前调用 `getTbs()`：抛出明确的调用顺序错误。
- HTTP 429、5xx、超时等仍沿用现有可重试分类。

## 测试与验收

- 回归测试必须先证明旧实现仍会请求 `/dc/common/tbs` 或无法从登录响应提供 TBS，然后在修复后转绿。
- 测试移动端登录请求的 HTTPS 地址、表单字段和确定性 MD5 签名。
- 测试成功响应缓存 TBS、认证失败、缺少 TBS、未登录读取 TBS和 BDUSS 不泄露。
- 全量类型检查、测试和构建必须通过。
- 无凭据网络探针必须证明移动端登录端点可通过 HTTPS 到达且返回结构化 JSON；真实账号验收由更新后的 GitHub Actions 完成。

## 范围

仅修改 TBS 获取与相关测试、说明。Secret 名称、签到接口、邮件通知、定时计划和单账号约束均不变。
