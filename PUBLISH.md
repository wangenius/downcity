# 发布指南

这个项目已经配置为一个可发布的npm包。以下是发布步骤：

## 发布前检查

1. 确保所有代码已提交到git仓库
2. 确保版本号正确（在package.json中）
3. 确保README.md文档完整
4. 运行构建命令确保没有错误：
   ```bash
   npm run build
   ```

## 发布到npm

### 首次发布

1. 登录npm账户：
   ```bash
   npm login
   ```

2. 发布包：
   ```bash
   npm publish
   ```

### 更新版本

1. 更新版本号：
   ```bash
   # 补丁版本 (1.0.0 -> 1.0.1)
   npm version patch
   
   # 小版本 (1.0.0 -> 1.1.0)
   npm version minor
   
   # 大版本 (1.0.0 -> 2.0.0)
   npm version major
   ```

2. 推送到git：
   ```bash
   git push && git push --tags
   ```

3. 发布新版本：
   ```bash
   npm publish
   ```

## 包信息

- **包名**: feishub
- **当前版本**: 1.0.0
- **主入口**: dist/index.js
- **类型定义**: dist/index.d.ts
- **包含文件**: dist/, README.md, LICENSE


## 注意事项

- 发布前会自动运行 `npm run build` 构建项目
- 只有 `dist/` 目录、`README.md` 和 `LICENSE` 会被包含在发布的包中
- 源代码 `src/` 目录不会被发布，保护源代码