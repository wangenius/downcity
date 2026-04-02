# Downcity 开发文档索引

当前 `packages/downcity` 的开发架构文档统一放在 `devdocs/`。

建议阅读顺序：

1. [整体架构总览](./agent-native-architecture-design.md)
2. [文件结构与模块职责](./file-structure-and-dependencies.md)
3. [Agent 与 Session 架构](./agent-and-session.md)
4. [Service 与 Plugin 架构](./service-and-plugin.md)
5. [Chat 端到端流程](./chat-end-to-end-flow.md)
6. [启动与 HTTP/API 装配流程](./startup-and-api-flow.md)
7. [Task / Shell / Memory 执行链路](./task-shell-memory-flow.md)
8. [认证与授权架构设计稿](./platform/auth-and-authorization-architecture-design.md)
9. [认证与授权 V1 实施稿](./platform/auth-and-authorization-v1-implementation-plan.md)
10. [认证与授权 V1 详细设计稿](./platform/auth-and-authorization-v1-detailed-design.md)
11. [AUTH 文档集合](./AUTH/README.md)

如果你只想快速建立心智模型，先看：

1. `整体架构总览`
2. `Agent 与 Session 架构`
3. `Service 与 Plugin 架构`
4. `Chat 端到端流程`

当前目录只保留“描述现状”的文档。

补充：

1. `platform/认证与授权架构设计稿` 是面向后续服务器部署目标的正式设计文档。
2. `platform/认证与授权 V1 实施稿` 是第一阶段落地清单，包含 schema、API、模块和实施顺序。
3. `platform/认证与授权 V1 详细设计稿` 继续下钻到接口契约、字段、模块关系、测试矩阵与实施阶段。
4. 这些文档用于指导后续实现，不代表当前代码已经全部具备这些能力。

已经删除：

1. 迁移设计稿
2. 阶段性重构计划

原因：

1. 这些文档主要记录迁移过程，和当前实现已经不再一致
2. 继续放在主索引里会干扰阅读顺序
