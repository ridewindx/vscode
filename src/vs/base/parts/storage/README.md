键值存储接口 IStorage，实现为 Storage 类：
- 数据写入一份到 cache 内存，写入一份到 IStorageDatabase
- IStorageDatabase 有两个实现：
  - InMemoryStorageDatabase 类，读写内存
  - SQLiteStorageDatabase 类，读写指定路径的 SQLite 数据库文件
