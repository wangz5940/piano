# 练琴簿

练琴簿是一套以简谱视奏、双手协调和真实教材阅读为核心的钢琴学习系统。

## 内容模型

- **课程**：`src/features/course/data.ts` 定义 36 周课程、每日练习和实时判定步骤。
- **教材原谱**：`public/materials/catalog.json`、MusicXML 与跟弹事件是课程教材的规范资源。
- **简谱教材**：`public/materials/jianpu-catalog.json` 由 `.trae/scripts/build_jianpu_library.py` 生成。
- **阅读层级**：教材 -> 原书章节 -> 完整乐曲或练习。跨页、跨文件的同一曲目合并阅读，原页文字保留在章节导读中。
- **页内映射**：只有 MusicXML 分页边界可验证时，才生成逐页小节范围；其余内容明确标记为跨页片段，避免把教学文字配到错误的简谱。
- **内容索引**：`npx vite-node scripts/index-textbook-content.ts` 从已核验的转录边界生成 `content_sections`；每个源小节恰好归属一项内容，不改写原谱或校对主键。

## 前端结构

- `src/pages/`：课程路径、今日练习、练习页、教材谱库与简谱教材阅读器。
- `src/components/`：简谱/五线谱、电脑钢琴键盘与教材原谱视图。
- `src/features/`：课程数据、教材加载与缓存、MIDI、实时判定、进度存储。
- `src/pages/Management.tsx`：学习管理页，可切换自由学习权限和左侧导航默认状态。
- `src/features/audio/`：麦克风音高检测、目标音校准和声音输入事件。
- `src/features/repertoire/`：版权状态清晰的公版曲目与项目自编教学谱。
- `server/`：账号、同步、练习归档、内容版本、管理权限、SQLite 与生产静态服务。

简谱教材的导航按原书章节组织，每首乐曲独立显示；章节导读保留原页文字。单手素材只渲染实际手别，原谱标题在谱面外显示。
主导航默认只显示简谱教材、收藏、学习管理、账号与同步。课程、今日练习、练习记录、教材谱库和曲目库等入口在学习管理中分别开启，默认关闭并随账号同步。
课程路径默认允许查看和练习尚未开始的任务；关闭“自由学习”后才恢复按课程顺序提示。左侧主导航支持收缩，设置保存在浏览器本地。
声音输入需要在学习管理中开启并录制一个校准音；练习时会与 MIDI、电脑键盘和虚拟琴键共同参与判定。浏览器通常只允许在 `localhost` 或 HTTPS 页面访问麦克风。

## 开发与验证

```bash
npm run dev
npm run create:cert
npm run start:host
npm run start:secure-host
npm run check:host
npm run stop:host
npm run check
npm run lint
npm test
npm run build
npm run serve
npm run admin:create
npm run backup
npm run capture:jianpu -- --input data/jianpu-authorized-urls.txt
```

`npm run start:host` 会同时启动 Vite 前端和本地业务后端。前端默认监听 `5173`，后端只监听本机 `4173` 并通过 Vite 的同源 `/api` 代理访问；进程号分别写入 `.panio-dev.pid` 和 `.panio-api.pid`。停止服务执行 `npm run stop:host`。如果局域网设备无法访问，执行 `npm run check:host` 查看当前监听状态和优先访问地址。

麦克风输入只能在浏览器认可的安全上下文中使用：本机 `localhost` 可用，普通 `http://局域网IP` 不会触发麦克风授权。需要在局域网设备上测试麦克风时，先运行 `npm run create:cert`，再运行 `npm run start:secure-host`，并在访问设备上信任本地开发证书。

重新生成简谱教材资源：

```bash
python3 .trae/scripts/build_jianpu_library.py
```

## 授权简谱页面截图导入

`scripts/capture-jianpu.mjs` 使用本机 Chrome 的 DevTools 协议，对 URL 清单中的页面进行
滚动截图。它默认处理前 100 个 URL，每个页面按滚动容器保存为多张 PNG，并在每个曲目目录和
输出目录写入 `manifest.json`。对于 `#ai-score` 简谱 iframe，脚本会先点击谱面中央的播放
按钮，等待播放遮罩隐藏后再截图，避免把播放按钮截进谱面。脚本不会绕过登录、验证码、付费墙
或其他访问限制。

先创建本地 URL 清单：

```bash
mkdir -p data
cp scripts/jianpu-urls.example.txt data/jianpu-authorized-urls.txt
# 编辑 data/jianpu-authorized-urls.txt，只保留自己拥有或已获授权的页面
npm run capture:jianpu -- --input data/jianpu-authorized-urls.txt
```

如果页面自动选择的滚动区域不准确，先查看候选容器：

```bash
npm run capture:jianpu -- \
  --input data/jianpu-authorized-urls.txt \
  --inspect-only

npm run capture:jianpu -- \
  --input data/jianpu-authorized-urls.txt \
  --selector '.你的滚动容器选择器'
```

你提供的页面目前会自动识别为 `#ai-score` iframe；如自动识别受页面改版影响，可显式指定：

```bash
npm run capture:jianpu -- \
  --input data/jianpu-authorized-urls.txt \
  --selector '#ai-score'
```

可通过 `--output` 指定输出目录，`--limit 100` 控制批量数量，`--max-pages 100` 限制单曲
截图页数。默认输出到被忽略的 `data/jianpu-imported/`，人工确认版权和内容后，再把获准素材
录入 `public/materials/jianpu/` 及 `public/materials/jianpu-catalog.json`。

在受限容器或 CI 环境中如果 Chrome 无法启动，可使用
`PANIO_CHROME_NO_SANDBOX=1`；普通本机运行不需要该参数。

## 生产后端

运行环境要求 Node.js 26 或更高版本。先构建，再启动生产服务：

```bash
npm run build
HOST=0.0.0.0 PORT=4173 npm run serve
```

服务提供：

- 注册、登录、退出与 `HttpOnly` 服务端会话。
- 学习进度、个人偏好、练习结果和长期练习摘要。
- 教材目录、后台内容与不可变谱面版本接口。
- 管理员内容上传、版本发布和用户角色调整。
- `/api/v1/health` 健康检查。
- `dist/` 静态资源与 HashRouter 页面回退。
- CSP、权限策略、防嵌入、防 MIME 嗅探等安全响应头。
- 全局限流、登录注册独立限流、连接数与超时上限。
- 参数化 SQL、对象级授权、角色门禁、请求体上限与目录穿越防护。

游客的练习记录仍先保存在浏览器本地。登录后，系统会把本地进度与服务端数据合并，再同步到其他设备。实时 MIDI 和声音判定始终在浏览器完成；服务端只接收结果指标，不上传麦克风录音。

首次创建管理员：

```bash
PANIO_ADMIN_EMAIL=admin@example.com \
PANIO_ADMIN_NAME=内容管理员 \
PANIO_ADMIN_PASSWORD='至少十个字符的强密码' \
npm run admin:create
```

数据库默认位于 `data/panio.sqlite`。创建一致性备份：

```bash
npm run backup
```

备份默认写入 `backups/` 并保留最近 14 份。生产环境应把备份复制到独立加密存储，并定期进行恢复演练；只生成备份但从不验证恢复不构成可靠备份方案。

应用内限流用于保护服务容量，不能抵挡网络层 DDoS；需要这类防护时，应增加云侧防护、CDN/WAF、流量监控和告警。

Docker Compose 通过 Caddy 暴露 HTTPS 443，Node 仅在容器网络监听。旧的 HTTP 4173 地址自动跳转到 HTTPS，不接受账号操作。Caddy 自动申请并续期 Let's Encrypt 短期 IP 证书，证书和 ACME 账号存入持久化卷；验证使用 443 上的 TLS-ALPN，不占用服务器已有的 80 端口。首次使用 HTTPS 需重新登录，服务端已同步的数据保留。

```bash
# 可在 .env 设置 PANIO_PUBLIC_HOST；当前服务器默认 101.96.229.102
docker compose build piano
docker compose up -d
```

443 必须能从公网访问，以便首次验证和自动续期。不得将应用容器的 4173 端口直接映射到公网，也不要删除 `caddy-data` 或数据库卷。部署前运行 `docker compose exec -T piano node server/backup.mjs`，上线后检查 `https://101.96.229.102/api/v1/health`。

## 个人校对与审批

登录后可从简谱教材进入校对。“保存到本机”按账号隔离，并在当前浏览器的简谱和原谱中即时生效；其他账号只能看到公共版本。跨文件曲目提供各来源的校对入口，阅读仍保持完整曲目。

普通账号可提交不可变的校对快照，每人最多 10 个待审批项。最高权限账号 `admin`（界面显示超管）可以直接应用自己的校对，也可以比较并通过或拒绝提交。自助注册和账号角色管理均不能授予超管权限。

公共发布由服务器校验乐谱和基础版本，旧版本提交返回 409，避免覆盖后来修正。审批、校对记录与公共资源快照在同一 SQLite 事务内保存，再更新对应的简谱 JSON、MusicXML 和目录文件。重建容器时从持久化数据库恢复已发布资源，数据库备份包含这些校对。

## 2c2g 容量参数

默认同时允许 60 个活跃浏览器，同 IP 最多 10 个。在线租约 90 秒，前台每 25 秒续期；页面关闭或长期在后台后自动释放。超额访问显示重试提示。

API 总量 30 QPS（突发 60），单 IP 8 QPS（突发 16），并叠加每 IP 每分钟 180 次的限制。登录注册每 IP 每 15 分钟最多 10 次，密码运算最多并发 2 个。静态资源独立限流，不占 API 配额。

应用容器最多使用 1.75 CPU、1536 MiB 内存、128 个进程，Node 堆上限 768 MiB；应用连接上限 128，同时处理请求上限 48。参数是保守的初始容量配置，应根据实际监控调整。

可调参数：

```bash
RATE_LIMIT_PER_MINUTE=180
AUTH_RATE_LIMIT=10
MAX_CONNECTIONS=128
API_QPS=30
CLIENT_QPS=8
ONLINE_LIMIT=60
ONLINE_PER_IP=10
MAX_INFLIGHT=48
AUTH_CONCURRENCY=2
STATIC_DIR=dist
PANIO_DATABASE_PATH=data/panio.sqlite
PANIO_UPLOADS_DIR=data/content
PANIO_BACKUP_DIR=backups
PANIO_BACKUP_RETENTION=14
TRUST_PROXY=0
COOKIE_SECURE=1
TLS_KEY_FILE=/path/to/key.pem
TLS_CERT_FILE=/path/to/cert.pem
```

只有源站确实位于受信任反向代理后时才设置 `TRUST_PROXY=1`。否则客户端可伪造转发地址绕过按 IP 限流。若 TLS 在 CDN/WAF 终止而源站使用 HTTP，必须设置 `COOKIE_SECURE=1`，确保登录 Cookie 只通过 HTTPS 浏览器连接发送。

## 数据最小化

- 账号只要求邮箱、显示名称和角色，不要求真实姓名、生日或住址。
- 不保存麦克风录音，只归档输入来源和评测数字。
- 登录用户可在“账号与同步”中导出全部个人数据，或再次验证密码后永久删除账号。
- 自助注册只能选择学生或家长；老师由管理员设置，管理员只能通过服务器命令创建。
- 会话令牌只存在于 `HttpOnly` Cookie，数据库仅保存令牌摘要。
- 请求日志不记录密码、Cookie、谱面正文或练习备注。

## 曲目版权

热门曲目库只接入公版作品或传统旋律，并由练琴簿重新编写适级谱面与伴奏。现代流行歌曲、影视音乐和仍受保护的编配必须取得明确授权后才能加入，不能直接复制网络用户上传谱。
