各种服务：
- lifecycle 应用生命周期服务（只在 workbench 中使用，不同于 platform 下面的 lifecycle）
  - 可触发 onBeforeShutdown/onWillShutdown/onDidShutdown 事件
  - 可等待进入指定生命周期阶段
  - 可 shutdown 应用
