# Baggage - Solana 去中心化交易所智能合约项目

## 项目简介
这是一个基于 Solana 区块链的去中心化交易所智能合约项目，使用 Anchor 框架开发。该项目实现了一个安全、高效的去中心化交易系统，支持用户存款管理、Keeper 授权和交易执行等功能。

## 程序 ID
9aaJ19ZKGUoGQDkzHVFVyhpK7iAviedofonxiT3Ayz81

## 功能特性
- 存款管理：用户可以存入资产并生成唯一订单
- Keeper 授权管理：用户可以授权特定的 Keeper 执行交易
- 订单执行：支持订单的完整执行和部分执行
- 超时处理：自动处理超时订单并返还资金（超时时间 5分钟 - 24小时）
- 安全机制：完整的权限验证和资金安全保护
- 日志记录：详细的操作日志记录，方便监控和调试

## 订单状态说明
订单在生命周期中可能处于以下状态：
- Initialized：初始状态，订单刚创建
- ReadyToExecute：Keeper 已准备好执行交易
- Completed：订单已完全执行完成
- Cancelled：订单已取消（可能是超时取消或手动取消）

## 错误码说明
- OrderTimeout：订单已超时
- InvalidOrderStatus：订单状态无效
- InvalidAmount：无效的金额
- Unauthorized：未授权的操作
- InvalidTokenAccountOwner：Token Account 所有权验证失败
- InvalidTokenMint：Token Account Mint 不匹配
- InvalidTimeout：超时时间设置无效（必须在 5分钟到24小时之间）

## 核心功能模块
1. 存款管理模块
   - 用户资产存储和管理
   - 订单生成和状态跟踪
   - 支持部分执行和完整执行

2. 授权管理模块
   - Keeper 授权机制
   - 权限验证系统
   - 超时时间管理

3. 交易执行模块
   - 订单执行和状态更新
   - 部分执行支持
   - 资金返还机制

4. 安全模块
   - 权限控制
   - 资金安全保护
   - 异常处理机制
   - 超时自动处理

## 技术栈
- Solana 区块链
- Anchor Framework
- Rust 编程语言
- SPL Token 标准

## 开发环境要求
- Rust 最新稳定版
- Solana CLI 工具
- Anchor Framework
- Node.js (用于测试和部署脚本)
- Yarn 包管理器

## 如何运行
1. 环境配置
   ```bash
   # 安装 Rust
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

   # 安装 Solana
   sh -c "$(curl -sSfL https://release.solana.com/v1.17.0/install)"

   # 安装 Anchor
   cargo install --git https://github.com/coral-xyz/anchor avm --locked
   ```

2. 项目设置
   ```bash
   # 克隆项目
   git clone [项目地址]
   cd baggage

   # 安装依赖
   yarn install
   ```

3. 编译和部署
   ```bash
   # 编译项目
   anchor build

   # 部署到网络
   anchor deploy
   ```

## 测试
```bash
# 运行单元测试（跳过本地验证器）
anchor test --skip-local-validator
```

## 注意事项
- 确保 Solana 配置正确（开发网络/主网）
- 部署前检查程序 ID 配置
- 确保有足够的 SOL 支付交易费用
- 遵循安全最佳实践进行部署和使用
- 如果测试失败，检查是否有 VPN 代理影响节点连接

## 安全考虑
- 所有资金操作都需要适当的权限验证
- 实现了完整的超时机制（5分钟到24小时）和异常处理
- 使用 PDA 派生账户确保资金安全
- 建议在主网部署前进行完整的安全审计
- 订单状态转换严格控制，防止非法操作

## 订单生命周期
1. 用户创建订单（Initialized）
2. Keeper 准备执行（ReadyToExecute）
3. 订单执行（可部分执行）
4. 订单完成（Completed）或取消（Cancelled）

## 常见问题
1. 订单超时：订单必须在指定的超时时间内完成，否则将可以被取消
2. 部分执行：订单支持部分执行，未执行部分可以取消
3. 权限验证：所有操作都需要正确的权限验证，包括用户和 Keeper
4. Token 账户：确保使用正确的 Token 账户和 Mint 地址

