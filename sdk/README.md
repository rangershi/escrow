# Baggage Protocol SDK

Baggage Protocol的官方SDK，用于与Solana上的Baggage智能合约进行交互。

## 安装

```bash
npm install @baggage/sdk
# 或
yarn add @baggage/sdk
```

## 使用方法

```typescript
import { Connection } from '@solana/web3.js';
import { BaggageSDK } from '@baggage/sdk';

// 初始化SDK
const connection = new Connection("https://api.devnet.solana.com");
const wallet = yourWallet; // 你的钱包实例
const programId = new PublicKey("你的程序ID");

const sdk = new BaggageSDK(connection, wallet, programId);

// 创建存款订单示例
async function createDepositOrder() {
  const orderId = new BN(1);
  const amount = new BN(100000);
  const keeper = Keypair.generate().publicKey;
  const timeout = new BN(3600);
  const mint = new PublicKey("代币地址");

  // 获取或创建用户代币账户
  const userTokenAccount = await sdk.getUserAssociatedTokenAccount(mint);

  // 获取金库代币账户
  const vaultTokenAccount = new PublicKey("金库代币账户地址");

  // 存款
  await sdk.depositTokens(
    orderId,
    amount,
    keeper,
    timeout,
    mint,
    userTokenAccount,
    vaultTokenAccount
  );
}
```

## API文档

### 初始化

```typescript
const sdk = new BaggageSDK(connection, wallet, programId);
```

### 主要方法

#### depositTokens
创建存款订单。

```typescript
async depositTokens(
  orderId: BN,
  amount: BN,
  keeper: PublicKey,
  timeout: BN,
  mint: PublicKey,
  userTokenAccount: PublicKey,
  vaultTokenAccount: PublicKey
)
```

#### updateOrderStatusToReady
更新订单状态为准备执行。

```typescript
async updateOrderStatusToReady(
  depositOrder: PublicKey,
  keeperKeypair: Keypair
)
```

#### partiallyExecuteOrder
部分执行订单。

```typescript
async partiallyExecuteOrder(
  depositOrder: PublicKey,
  executeAmount: BN,
  keeperKeypair: Keypair
)
```

#### cancelOrder
取消订单。

```typescript
async cancelOrder(
  depositOrder: PublicKey,
  userTokenAccount: PublicKey,
  vaultTokenAccount: PublicKey
)
```

#### getDepositOrder
获取存款订单信息。

```typescript
async getDepositOrder(depositOrder: PublicKey)
```

## 开发

```bash
# 安装依赖
yarn install

# 构建
yarn build

# 测试
yarn test

# 代码格式化
yarn format

# 代码检查
yarn lint
```

## License

MIT 