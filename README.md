<!--
  Author: MoyuZJ
  Team: LinearTeam
  Contact: linearteam@foxmail.com
  Made by MoyuZJ in China with ♥
-->

# LinearPress 高级用户管理插件（advanced-user-management）

Cordis 原生插件，**不依赖 Base 内部实现**，仅通过公开的 Cordis Context 服务
（`auth` / `users` / `posts` / `comments` / `permissions` / `plugins` / `config` / `linearpress`）工作，
可独立部署与使用。不包含个人资料管理——个人资料扩展由独立的「多彩个人资料」插件提供。

- **插件 id**：`advanced-user-management`
- **版本**：1.0.0
- **类型**：`both`
- **依赖**：无硬依赖；SMTP 邮件激活需要可选依赖 `nodemailer`

---

## 功能

1. **注册增强（Registration）**
   - 注册表单新增「确认密码」字段，前端实时校验 + 后端强校验（`POST /register` 接管），
     可配置开关。
2. **登录限流与阶梯封禁（Login Rate Limiting）**
   - 默认按「用户名 + 来源 IP」双主体跟踪：
     - 10 分钟窗口失败 ≥10 次 → 封禁 15 分钟
     - 30 分钟窗口失败 ≥15 次 → 封禁 60 分钟
     - 1 小时窗口失败 ≥25 次 → 封禁 90 分钟
   - 单日同一主体触发封禁 ≥3 次 → 阶梯封禁：第 1 阶 3 天 / 第 2 阶 7 天 / 第 3 阶永久。
     「是否允许永久封禁」可关闭，关闭后第 3 阶退化为可配置天数（默认 30 天）。
   - 所有窗口/阈值/封禁时长/阶梯/兜底天数均可后台调整；管理端提供**解封队列**（单独解封/全部清空）。
3. **SMTP 邮件激活（Email Verification）**
   - 新用户注册默认标记「未验证」，通过邮件链接激活后获得完整权限；未验证用户发表评论会被拦截。
   - 插件设置面板中配置 SMTP（地址/端口/StartTLS 或 SSL/账号/发件人）、验证链接有效期。
   - **邮箱域名白名单**：默认 `qq.com / outlook.com / hotmail.com / gmail.com / foxmail.com / 163.com / 126.com`，可整体开关与编辑。
   - 邮件模板支持「默认模板」与「上传自定义模板」（HTML 占位符 `{{siteName}} {{username}} {{verifyUrl}} {{siteUrl}}`）。
   - 注册成功提示框：*欢迎！[邮箱]，请登录 [邮箱服务商网站] 查看邮件完成验证。*
4. **账号注销（Account Deletion）**
   - 用户端：右上角「头像 + 名字」下拉菜单 → 个人资料 → 账户设置 → 提交注销申请（可填原因）。
   - 管理组在「账户安全 → 注销审批」中批准 / 驳回；批准后进入**冷却期（默认 30 天，可配置）**，
     期满由定时任务自动**物理注销**（删除账号；其文章默认一并删除，可配置为转交超级管理员）。
   - 冷却期内用户可撤销申请；超级管理员不可注销。

管理端入口：侧栏「**账户安全**」；插件列表「**高级用户管理设置**」为配置页面。

---

## 部署

```bash
# 将插件整体复制到站点 src/plugins/<id>/（目录名必须与插件 id 一致）
cp -r Plugins/advanced-user-management <站点>/src/plugins/advanced-user-management

# SMTP 邮件激活需要 nodemailer（二选一）：
# 站点根目录
npm install nodemailer
# 或插件目录内安装（解析时同样生效）
cd <站点>/src/plugins/advanced-user-management && npm install nodemailer
```

重启站点，进入后台「插件」确认已启用；侧栏出现「账户安全」。

> nodemailer 为**可选**依赖：未安装或未配置 SMTP 时，仅邮件激活相关操作给出明确错误提示，
> 登录限流、注册校验、账号注销等功能不受影响。

---

## 配置项

所有配置在后台「账户安全 → 插件设置」表单中修改并即时生效（无需重启）：

| 分组 | 项 | 默认 |
| --- | --- | --- |
| 注册增强 | 确认密码二次输入 | 开 |
| 登录限流 | 启停 | 开 |
| | 三档窗口（分钟）/ 阈值 / 封禁（分钟） | 10/10/15 · 30/15/60 · 60/25/90 |
| | 单日阶梯触发次数 | 3 |
| | 阶梯时长（天，0=永久） | 3,7,0 |
| | 允许永久封禁 | 开（关闭时第 3 阶用下方天数） |
| | 不允许永久时的第 3 阶天数 | 30 |
| 邮件激活 | 启停 | 关 |
| | SMTP 地址 / 端口 / 加密 / 账号 / 密码 / 发件人 | 空 |
| | 验证链接有效期（小时） | 48 |
| | 域名白名单（开关 + 列表） | 开；7 个常见邮箱后缀 |
| | 邮件模板（默认 / 自定义上传） | 默认 |
| 账号注销 | 批准后冷却期（天） | 30 |
| | 物理注销时删除该用户文章 | 开 |

数据表（自动创建，标准 SQL，兼容 SQLite 与 MySQL 驱动）：

- `aum_users`：邮箱验证状态与令牌
- `aum_login_failures`：登录失败记录（限流窗口计数）
- `aum_bans`：封禁记录（含阶梯、永久标记）
- `aum_delete_requests`：注销申请 / 审批 / 冷却

---

## 覆盖行为（重要）

- 本插件接管 `POST /login`、`POST /register`（插件路由优先于核心路由挂载）；
  登录失败计数、封禁判定、注册校验、验证邮件等逻辑全部在插件内完成。
- 插件视图目录优先于 Base（视图覆盖顺序由 LinearPress 保证）：
  - `views/auth/register.ejs`、`views/auth/login.ejs`
  - `views/layouts/web.ejs`：为登录用户增加「头像 + 名字」下拉菜单（个人资料 / 设置 / 后台 / 退出），
    覆盖自 Base 前台布局，若 Base 布局大幅升级请同步本文件。
- 静态资源挂载于 `/plugins/advanced-user-management/`；CSS/JS 自动注入前台与后台布局。

## 卸载

后台「插件」页删除或停用即可。Fiber 销毁自动清理定时任务与路由；`aum_*` 业务表会保留
（避免误删账户安全数据），如需一并清除请先备份数据库。