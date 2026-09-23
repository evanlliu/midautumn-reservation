中秋预约后台升级补丁

只需要更新 main 分支两个文件：
1. admin.html
2. github-api.js

不要覆盖 config.js，不要动 data 分支的 data.json。

新增功能：
- 姓名模糊查询
- 预约编号模糊查询
- 游戏筛选
- 日期筛选
- 多条件组合查询
- 每条预约删除按钮
- 删除二次确认
- 删除时使用 GitHub SHA 乐观锁，遇到 409 自动重试
- 删除成功后 data 分支 data.json 自动更新
- 删除成功后该姓名可以重新预约

上传步骤：
GitHub 仓库 -> main 分支 -> Add file -> Upload files
上传 admin.html 和 github-api.js，选择覆盖同名文件并 Commit changes。
等待 GitHub Pages 更新后 Ctrl+F5 强制刷新 admin.html。
