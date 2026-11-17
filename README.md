# Center Common

configcenter、authcenter 和 certcenter 长期共同维护的基础设施仓库。三个业务仓库保持独立的 Git 历史、数据模型、权限、页面和部署周期；共享实现通过依赖引用，不复制到业务仓库。

| 目录               | 共享能力                                                                    |
| ------------------ | --------------------------------------------------------------------------- |
| `oauth/`           | OAuth 2.0 / OIDC、PKCE、发现、签名验证、用户信息和 GitHub 适配              |
| `httpassets/`      | 嵌入式静态资源、gzip 协商、范围请求                                         |
| `ui/`              | CheckboxField、DropdownMenu、DropdownSelect、定位、主题、设计变量和公共样式 |
| `tools/`           | Vite/Vue/Tailwind 工厂、开发代理、图标、压缩、共享 lint 和工具链版本检查    |
| `config/`          | Go lint/format 和业务仓库的 Make 构建入口                                   |
| `.github/actions/` | 可复用的安装与完整检查流水线                                                |

业务配置通过参数传入。业务表单、DialogPanel 中的具体字段、权限、危险操作注册、翻译目录、通知宿主和部署凭据仍由各项目管理。OAuth 的 GitHub 邮箱验证策略是显式参数，保留各项目原有行为。

## 本地联动

四个仓库放在同一级目录。进入每个业务仓库执行一次：

```sh
make common-local COMMON_DIR=../center-common
make bootstrap
make check
make build
```

`.tmp/common-local` 保存本地选择，`.tmp/common` 指向同一份源码。npm 的 `file:.tmp/common` 依赖和 Go 的 `replace => ./.tmp/common` 都经由这个入口；本地未提交的 common 修改会参与三个项目下一次构建。Vue 开发服务器可热更新共享组件，Go 修改需要重新编译或重启。更换依赖后重新运行 `make bootstrap`；更改构建配置后重启开发服务器。

common 自身的依赖也通过它自己的 package-lock.json 安装。Vite 对 Vue 去重，避免多个 Vue 运行时。`check-consumer.ts` 阻止三个项目私自漂移工具链版本。

## 独立检出与部署

每个项目提交 `common.lock.json`，其中 `repository` 是 common Git 地址，`revision` 必须是完整的 40 位提交 SHA。首次使用：

```sh
CI=true make bootstrap
CI=true make check build
```

该模式从锁定地址拉取指定提交，检出到 `.tmp/common-cache/<SHA>`，再建立 `.tmp/common` 链接。不需要相邻业务仓库，也不需要 npm registry 发布。缓存有修改、版本错误、拉取失败都会中止，不能退回 main 或本地源码。CI 忽略本地联调选择，拒绝 `--local`。

`node tools/common.ts --locked` 只为当前操作选择锁定源码，不删除本地联调选择；后续普通 `make` 会恢复本地选择。需要完整的可复现发布时，对整个命令设置 `CI=true`。`make scf-package` 自身也强制选择锁定源码。

部署流水线先拉取 common，再调用其中的 setup/check composite actions；其版本与源码使用同一锁文件。各项目仍保留 MySQL 服务、部署开关、生产环境和业务专属部署步骤。最终 Go 二进制已包含前端资源，生产进程不需要联网拉取 common。

私有 common 仓库可使用专用只读 deploy key，在消费者中配置 `COMMON_REPO_SSH_KEY` Actions secret；公钥只授予 common 仓库读取权限。脚本固定 GitHub 的 Ed25519 主机公钥，私钥只写入 `.tmp/` 下权限为 0600 的临时文件，Git 完成后立即删除。也支持 `COMMON_REPO_TOKEN` secret（仅能读取 common 的细粒度令牌），它只传给 Git 子进程，不写入锁文件或 Git 配置。普通开发机使用已有 Git 凭据即可。PR 的凭据可用性仍受 GitHub 的 fork/secret 策略限制。

## 升级与回滚

1. 在 common 开发公共能力，在各项目保留业务适配。新增公共能力不能反向依赖消费者。
2. 运行 common 的 `make check`，并以本地联调方式运行三个消费者的 `make check build`。
3. 提交并推送 common。将需要升级的消费者 `common.lock.json` 的 revision 改为该提交；不跟随浮动分支。
4. 若 npm 依赖清单变化，运行 `make bootstrap`，并更新消费者 package-lock.json；必要时同步其工具链版本声明。
5. 对消费者运行 `CI=true make bootstrap check build`，提交锁文件与适配改动，分别发布。

回滚只需恢复消费者的锁文件及同次升级的适配改动。破坏性 API 变化必须提供迁移说明；消费者可以停留在旧提交，独立安排升级。建议以 SemVer tag 标注 common 发布，锁文件仍保存实际 SHA。

`tools/common.ts` 是消费者启动 common 前唯一需要保留的引导程序，来源为本仓库 `tools/bootstrap.ts`。变更引导协议时同步它们；CI 比较二者，防止悄悄产生不同实现。

JavaScript/TypeScript 脚本统一使用 `.ts`，Vue 的每个脚本块必须声明 `lang="ts"`。`npm run lint` 先运行共享的 `tools/lint-files.ts`，扫描全仓已跟踪文件和未被 Git 忽略的新文件，禁止 `.js`、`.jsx`、`.cjs`、`.mjs`、`.mts`、`.cts` 和 `.tsx`，包括隐藏目录、测试和配置文件。被忽略的依赖与 `.tmp/` 构建产物不参与检查。消费者的 lint 命令以 `node .tmp/common/tools/lint-files.ts` 开始。

`no-restricted-files` 按文件路径约束说明文档：根目录仅允许 `README.md`、`AGENTS.md`，正式文档集中在顶层 `docs/`，GitHub 管理文档保留在 `.github/`。其他位置的 `.md`、`.mdx`、`.markdown`、`.mdown`、`.mkd`、`.txt`、`.text`、`.rst`、`.adoc`、`.asciidoc` 文件（扩展名不区分大小写）都会使 lint 失败，包含源码目录里的 README 和嵌套 `docs/`。实现总结、修改说明、排查报告等临时文档应留在对话中或被忽略的 `.tmp/`，不要随手加入仓库。规则不判断作者是否为 AI，也不读取文档内容。

所有生成物位于 `.tmp/`，依赖安装位于 `node_modules/`。保留 `.tmp/common*`、`.tmp/ui`、`.tmp/docs` 和构建二进制供后续构建使用；测试临时目录自动清理。

依赖机制参考 [Go module replace](https://go.dev/ref/mod#go-mod-file-replace)、[npm 本地路径依赖](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#local-paths) 与 [GitHub composite actions](https://docs.github.com/en/actions/tutorials/create-actions/create-a-composite-action)。
