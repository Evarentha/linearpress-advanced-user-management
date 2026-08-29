<!--
  Author: MoyuZJ
  Team: LinearTeam
  Contact: linearteam@foxmail.com
  Made by MoyuZJ in China with ♥
-->

# 高级用户管理（advanced-user-management）

注册增强、**登录限流与阶梯封禁**、**SMTP 邮件激活**、账号注销审批与冷却删除——
Cordis 原生插件，**仅通过公开 Cordis Context 服务工作**，不依赖 Base 内部实现，可独立部署。

> 本仓库是 LinearPress 插件 **advanced-user-management** 的独立开发仓库。插件即 Cordis 插件函数，即插即用、可停用可卸载。
> 个人资料扩展由独立的「多彩个人资料」插件提供，本插件不包含。

## 插件化的优势

- **零侵入**：不依赖 Base 内部实现，只使用公开服务（`auth/users/posts/comments/permissions/plugins/config/linearpress`）。
- **服务级协作**：注册/登录接管走 Hook 与路由覆盖；邮件激活的 SMTP 配置同时被 colorful-profiles 复用，一处配置两插件受益。
- **可选依赖**：`nodemailer` 为可选依赖，不装只影响邮件激活。

## 功能

1. **注册增强**——注册表单「确认密码」字段，前端实时校验 + 后端强校验（可配置开关）。
2. **登录限流与阶梯封禁**——按「用户名 + IP」双主体跟踪：10 分钟窗口 ≥10 次→封 15 分钟；30 分钟 ≥15 次→封 60 分钟；1 小时 ≥25 次→封 90 分钟；单日触发 ≥3 次→阶梯封禁（3 天/7 天/永久，可关永久并设兜底天数）。全部阈值后台可调，管理端有**解封队列**。
3. **SMTP 邮件激活**——新用户默认「未验证」，邮件链接激活后获得完整权限；邮箱域名白名单（qq.com/outlook.com/…可编辑）；自定义邮件模板（HTML 占位符 `{{siteName}} {{username}} {{verifyUrl}} {{siteUrl}}`）；注册成功提示进入邮箱验证。
4. **账号注销**——用户端提交注销申请（可填原因）；管理端批准后进入冷却期（默认 30 天，可配），期满定时任务物理注销（文章默认同删，可转交超管）；冷却期内可撤销；超级管理员不可注销。

管理端入口：侧栏「账户安全」；插件列表「高级用户管理设置」。

## 部署

```bash
# 复制到站点 src/plugins/<id>/（目录名必须与插件 id 一致）
cp -r Plugins/advanced-user-management <站点>/src/plugins/advanced-user-management

# SMTP 邮件激活需要 nodemailer（二选一）：
cd <站点> && npm install nodemailer
# 或 cd <站点>/src/plugins/advanced-user-management && npm install nodemailer
```

## 本地开发：怎么拉 / 怎么改 / 怎么跑

```bash
git clone <本仓库地址> LinearPress/Plugins/advanced-user-management
cd LinearPress/base
npm install && npm run db:init
sh scripts/sync-plugins.sh advanced-user-management
npm run dev
```

## 目录结构

```text
advanced-user-management/
├── plugin.json                  # Manifest（permissions: aum:manage）
├── index.ts                     # 入口：注册/登录接管、限流封禁、邮件、注销流程
├── src/
│   ├── config.ts / email.ts / rate-limit.ts / store.ts / deletion.ts
├── views/                       # login/register 覆盖、个人设置、验证页、后台管理页
├── public/                      # 前端脚本与样式
└── types/                       # cordis/session 声明
```

## 贡献与发布

- conventional commits；提交前 `cd base && npm run typecheck`
- 版本：`git tag v1.0.0 && git push --tags`
- License：MIT（见仓库 LICENSE）