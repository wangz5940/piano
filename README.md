# 练琴簿

练琴簿是一套以简谱视奏、双手协调和真实教材阅读为核心的钢琴学习系统。

## 内容模型

- **课程**：`src/features/course/data.ts` 定义 36 周课程、每日练习和实时判定步骤。
- **教材原谱**：`public/materials/catalog.json`、MusicXML 与跟弹事件是课程教材的规范资源。
- **简谱教材**：`public/materials/jianpu-catalog.json` 由 `.trae/scripts/build_jianpu_library.py` 生成。
- **阅读层级**：教材 -> 原书章节 -> 章节导读（原页文字）-> 关联练习片段 -> 对应简谱。理论页也必须归入章节导读，不因没有乐谱而从目录中消失。
- **页内映射**：只有 MusicXML 分页边界可验证时，才生成逐页小节范围；其余内容明确标记为跨页片段，避免把教学文字配到错误的简谱。

## 前端结构

- `src/pages/`：课程路径、今日练习、练习页、教材谱库与简谱教材阅读器。
- `src/components/`：简谱/五线谱、电脑钢琴键盘与教材原谱视图。
- `src/features/`：课程数据、教材加载与缓存、MIDI、实时判定、进度存储。
- `src/pages/Management.tsx`：学习管理页，可切换自由学习权限和左侧导航默认状态。
- `src/features/audio/`：麦克风音高检测、目标音校准和声音输入事件。
- `src/features/repertoire/`：版权状态清晰的公版曲目与项目自编教学谱。
- `server/`：账号、同步、练习归档、内容版本、管理权限、SQLite 与生产静态服务。

简谱教材的导航按原书章节组织。章节导读按原谱页呈现完整文字，并链接到相关练习；练习阅读页展示“文字提示 + 对应简谱”。单手素材只渲染实际手别。
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

应用内限流只能缓解低强度滥用，不能单独抵挡网络层 DDoS。公网部署必须把源站放在 CDN/WAF 或云负载均衡后，启用 TLS、网络层限流、源站访问控制、流量监控和告警；不要把 Node 端口直接暴露到公网。

可调参数：

```bash
RATE_LIMIT_PER_MINUTE=180
AUTH_RATE_LIMIT=10
MAX_CONNECTIONS=1000
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
