import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, Transaction } from '@solana/web3.js';
import { EscrowSDK } from '../escrow';
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
}); 