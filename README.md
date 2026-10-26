# 泰拉衣橱 · TERRA WARDROBE

《明日方舟》非官方干员 / 时装 / 官方动态影像档案。

## 线上地址

- 主站（自定义域名，已启用 HTTPS）：https://ark.kixuxs.top/
- GitHub Pages 备用地址：https://xuxakiss.github.io/terra-wardrobe/

## 功能

- 434 位干员、526 套时装、72 套动态时装、26 条精英二动态记录
- 原立绘 / 皮肤立绘滑动对比，支持精英一 / 精英二切换
- 官方 MP4 直接流式播放，支持多段动作切换
- 全站搜索、职业 / 星级 / 系列筛选、排序、加载更多
- 纯静态，无后端、无账号、无追踪

## 数据来源

- 官方动态集录：<https://ak.hypergryph.com/archive/dynamicCompile/index.html>
- 游戏数据：<https://github.com/Kengxxiao/ArknightsGameData>
- 立绘资源：<https://github.com/yuanyan3060/ArknightsGameResource>
- 资料索引：<https://prts.wiki/>

## 本地运行

在仓库根目录执行：

```bash
python -m http.server 8787
```

然后访问 <http://127.0.0.1:8787/>。

## 更新数据

```bash
python scripts/fetch_dynamics.py
python scripts/build_data.py
```

`build_data.py` 会读取 `data/raw/file_dict.json` 校验立绘是否存在，并自动为没有精英二立绘的干员回退到精英一立绘。

## 部署

本站是纯静态站点，把本目录内容放到任意静态服务器的网站根目录即可。GitHub Pages 已启用 `main` 分支根目录发布。

### 自定义域名

已配置完成：

| 类型 | 主机记录 | 记录值 | 代理状态 |
| --- | --- | --- | --- |
| CNAME | `ark` | `xuxakiss.github.io` | DNS only（灰云） |

GitHub 仓库 `Settings → Pages → Custom domain` 已填入 `ark.kixuxs.top`，并开启 `Enforce HTTPS`。仓库根目录的 `CNAME` 文件由 GitHub Pages 维护，内容为 `ark.kixuxs.top`。

## 版权

《明日方舟》及其角色、时装、影像、音乐等内容的版权归上海鹰角网络科技有限公司所有。本站是非官方粉丝项目，与鹰角网络无隶属关系；不存储视频文件，仅引用官方公开 CDN 内容。