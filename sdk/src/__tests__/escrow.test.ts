import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, Transaction } from '@solana/web3.js';
import { EscrowSDK } from '../index';
import * as anchor from '@coral-xyz/anchor';
import { BN } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID, createMint, mintTo, getAccount, createAssociatedTokenAccount, getAssociatedTokenAddress } from '@solana/spl-token';

// 添加 OrderStatus 类型定义
type OrderStatus = {
  initialized?: {};
  readyToExecute?: {};
  completed?: {};
  cancelled?: {};
};

describe('EscrowSDK', () => {
  let sdk: EscrowSDK;
  let connection: Connection;
  let wallet: anchor.Wallet;
  let programId: PublicKey;
  let mint: PublicKey;
  let user: Keypair;
  let keeper: Keypair;
  let userTokenAccount: PublicKey;

  beforeEach(async () => {
    // 使用本地测试网络
    connection = new Connection('http://localhost:8899', 'confirmed');
    
    // 创建一个有资金的钱包用于测试
    const payer = Keypair.generate();
    wallet = new anchor.Wallet(payer);
    
    // 给测试钱包空投 SOL
    const signature = await connection.requestAirdrop(
      wallet.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(signature);
    
    // 使用正确的程序ID
    programId = new PublicKey('9aaJ19ZKGUoGQDkzHVFVyhpK7iAviedofonxiT3Ayz81');
    
    // 创建测试用户和keeper
    user = wallet.payer;
    keeper = Keypair.generate();

    // 给keeper空投SOL
    const keeperAirdrop = await connection.requestAirdrop(
      keeper.publicKey,
      5 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(keeperAirdrop);

    // 初始化SDK
    sdk = new EscrowSDK(
      connection,
      wallet,
      programId.toString()
    );

    // 创建测试代币
    mint = await createMint(
      connection,
      wallet.payer,
      wallet.publicKey,
      null,
      6
    );

    // 创建用户代币账户并铸造一些代币
    userTokenAccount = await createAssociatedTokenAccount(
      connection,
      wallet.payer,
      mint,
      user.publicKey
    );

    // 铸造1个代币到用户账户
    await mintTo(
      connection,
      wallet.payer,
      mint,
      userTokenAccount,
      wallet.payer,
      1_000_000 // 1 token with 6 decimals
    );
  });

  it('should create vault authority PDA', async () => {
    const [vaultAuthority, bump] = await sdk.getVaultAuthority();
    expect(vaultAuthority).toBeInstanceOf(PublicKey);
    expect(bump).toBeLessThan(256);
  });

  it('should get vault token account and verify it exists', async () => {
    // 先创建一个存款订单，这样会自动创建金库代币账户
    const orderId = new BN(1);
    const amount = new BN(1_000_000); // 1 token
    const timeout = new BN(3600); // 1 hour

    const depositInstructions = await sdk.makeDepositTokensInstructions(
      user.publicKey.toString(),
      orderId,
      amount,
      keeper.publicKey.toString(),
      timeout,
      mint.toString()
    );

    const depositTx = new Transaction().add(...depositInstructions.instructions);
    const depositSig = await connection.sendTransaction(depositTx, [wallet.payer, ...depositInstructions.signers]);
    await connection.confirmTransaction(depositSig, 'confirmed');

    // 然后验证金库代币账户
    const vaultTokenAccount = await sdk.getVaultTokenAccount(mint.toString());
    expect(vaultTokenAccount).toBeInstanceOf(PublicKey);

    // 验证账户是否存在
    const account = await getAccount(connection, vaultTokenAccount);
    const [vaultAuthority] = await sdk.getVaultAuthority();
    expect(account.mint.toString()).toBe(mint.toString());
    expect(account.owner.toString()).toBe(vaultAuthority.toString());
  });

  it('should create deposit order and execute full flow', async () => {
    const orderId = new BN(1);
    const amount = new BN(1_000_000); // 1 token
    const timeout = new BN(3600); // 1 hour

    // 1. 创建存款指令
    const depositInstructions = await sdk.makeDepositTokensInstructions(
      user.publicKey.toString(),
      orderId,
      amount,
      keeper.publicKey.toString(),
      timeout,
      mint.toString()
    );

    // 执行存款交易
    const depositTx = new Transaction().add(...depositInstructions.instructions);
    const depositSig = await connection.sendTransaction(depositTx, [wallet.payer, ...depositInstructions.signers]);

    // 等待交易确认
    await connection.confirmTransaction(depositSig, 'confirmed');

    // 2. 取消订单（在 Initialized 状态下）
    const cancelInstructions = await sdk.makeCancelOrderInstructions(
      orderId,
      mint.toString(),
      user.publicKey.toString()
    );

    // 执行取消交易
    const cancelTx = new Transaction().add(...cancelInstructions.instructions);
    const cancelSig = await connection.sendTransaction(cancelTx, [wallet.payer]);
    await connection.confirmTransaction(cancelSig, 'confirmed');

    // 验证最终状态
    const [depositOrder] = await sdk.getDepositOrderPDA(orderId, mint.toString());
    const orderAccount = await sdk.getDepositOrder(depositOrder);
    
    // 修改这里，使用类型断言
    const status = (orderAccount as { status: OrderStatus }).status;
    expect(status.cancelled).toBeDefined();

    // 验证代币已经返还给用户
    const userTokenAccountInfo = await getAccount(connection, userTokenAccount);
    expect(userTokenAccountInfo.amount.toString()).toBe(amount.toString());
  });

  it('should withdraw tokens successfully and verify balance changes', async () => {
    // 1. 首先创建一个存款订单
    const orderId = new BN(1);
    const depositAmount = new BN(1_000_000); // 1 token
    const timeout = new BN(3600); // 1 hour

    const depositInstructions = await sdk.makeDepositTokensInstructions(
      user.publicKey.toString(),
      orderId,
      depositAmount,
      keeper.publicKey.toString(),
      timeout,
      mint.toString()
    );

    // 执行存款交易
    const depositTx = new Transaction().add(...depositInstructions.instructions);
    const depositSig = await connection.sendTransaction(depositTx, [wallet.payer, ...depositInstructions.signers]);
    await connection.confirmTransaction(depositSig, 'confirmed');

    // 2. 更新订单状态为准备执行
    const updateStatusInstructions = await sdk.makeUpdateOrderStatusToReadyInstructions(
      orderId,
      mint.toString(),
      keeper.publicKey.toString()
    );

    const updateTx = new Transaction().add(...updateStatusInstructions.instructions);
    const updateSig = await connection.sendTransaction(updateTx, [keeper]);
    await connection.confirmTransaction(updateSig, 'confirmed');

    // 3. 记录提取前的余额
    const keeperTokenAccount = await getAssociatedTokenAddress(mint, keeper.publicKey);
    const vaultTokenAccount = await sdk.getVaultTokenAccount(mint.toString());
    
    const beforeKeeperBalance = (await getAccount(connection, keeperTokenAccount)).amount;
    const beforeVaultBalance = (await getAccount(connection, vaultTokenAccount)).amount;

    // 4. 提取资金
    const withdrawAmount = new BN(500_000); // 提取0.5个代币
    const withdrawInstructions = await sdk.makeWithdrawTokensInstructions(
      orderId,
      mint.toString(),
      keeper.publicKey.toString(),
      withdrawAmount
    );

    const withdrawTx = new Transaction().add(...withdrawInstructions.instructions);
    const withdrawSig = await connection.sendTransaction(withdrawTx, [keeper]);
    await connection.confirmTransaction(withdrawSig, 'confirmed');

    // 5. 验证余额变化
    const afterKeeperBalance = (await getAccount(connection, keeperTokenAccount)).amount;
    const afterVaultBalance = (await getAccount(connection, vaultTokenAccount)).amount;

    expect(afterKeeperBalance - beforeKeeperBalance).toBe(withdrawAmount.toNumber());
    expect(beforeVaultBalance - afterVaultBalance).toBe(withdrawAmount.toNumber());
  });

  it('should handle multiple withdrawals correctly', async () => {
    // 1. 创建存款订单
    const orderId = new BN(2);
    const depositAmount = new BN(1_000_000); // 1 token
    const timeout = new BN(3600);

    const depositInstructions = await sdk.makeDepositTokensInstructions(
      user.publicKey.toString(),
      orderId,
      depositAmount,
      keeper.publicKey.toString(),
      timeout,
      mint.toString()
    );

    const depositTx = new Transaction().add(...depositInstructions.instructions);
    await connection.sendTransaction(depositTx, [wallet.payer, ...depositInstructions.signers]);

    // 2. 更新状态为准备执行
    const updateStatusInstructions = await sdk.makeUpdateOrderStatusToReadyInstructions(
      orderId,
      mint.toString(),
      keeper.publicKey.toString()
    );

    const updateTx = new Transaction().add(...updateStatusInstructions.instructions);
    await connection.sendTransaction(updateTx, [keeper]);

    // 3. 多次提取并验证余额
    const withdrawAmounts = [
      new BN(300_000),
      new BN(400_000),
      new BN(300_000)
    ];

    const keeperTokenAccount = await getAssociatedTokenAddress(mint, keeper.publicKey);
    const vaultTokenAccount = await sdk.getVaultTokenAccount(mint.toString());
    const initialKeeperBalance = (await getAccount(connection, keeperTokenAccount)).amount;
    const initialVaultBalance = (await getAccount(connection, vaultTokenAccount)).amount;

    for (const amount of withdrawAmounts) {
      const withdrawInstructions = await sdk.makeWithdrawTokensInstructions(
        orderId,
        mint.toString(),
        keeper.publicKey.toString(),
        amount
      );

      const withdrawTx = new Transaction().add(...withdrawInstructions.instructions);
      await connection.sendTransaction(withdrawTx, [keeper]);
    }

    const finalKeeperBalance = (await getAccount(connection, keeperTokenAccount)).amount;
    const finalVaultBalance = (await getAccount(connection, vaultTokenAccount)).amount;

    const totalWithdrawn = withdrawAmounts.reduce((acc, curr) => acc + curr.toNumber(), 0);
    expect(finalKeeperBalance - initialKeeperBalance).toBe(totalWithdrawn);
    expect(initialVaultBalance - finalVaultBalance).toBe(totalWithdrawn);
  });

  it('should not allow withdrawal from timed out order', async () => {
    // 1. 创建一个即将超时的订单
    const orderId = new BN(3);
    const depositAmount = new BN(1_000_000);
    const timeout = new BN(301); // 设置一个较短的超时时间

    const depositInstructions = await sdk.makeDepositTokensInstructions(
      user.publicKey.toString(),
      orderId,
      depositAmount,
      keeper.publicKey.toString(),
      timeout,
      mint.toString()
    );

    const depositTx = new Transaction().add(...depositInstructions.instructions);
    await connection.sendTransaction(depositTx, [wallet.payer, ...depositInstructions.signers]);

    // 2. 等待订单超时
    console.log('等待订单超时...');
    await new Promise(resolve => setTimeout(resolve, timeout.toNumber() * 1000));

    // 3. 尝试提取资金
    const withdrawAmount = new BN(500_000);
    const withdrawInstructions = await sdk.makeWithdrawTokensInstructions(
      orderId,
      mint.toString(),
      keeper.publicKey.toString(),
      withdrawAmount
    );

    const withdrawTx = new Transaction().add(...withdrawInstructions.instructions);
    
    // 4. 验证交易失败
    await expect(
      connection.sendTransaction(withdrawTx, [keeper])
    ).rejects.toThrow();
  });
}); 