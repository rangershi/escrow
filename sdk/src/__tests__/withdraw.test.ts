import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, Transaction } from '@solana/web3.js';
import { EscrowSDK } from '../index';
import * as anchor from '@coral-xyz/anchor';
import { BN } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID, createMint, mintTo, getAccount, createAssociatedTokenAccount } from '@solana/spl-token';

describe('EscrowSDK Withdraw Tests', () => {
  let sdk: EscrowSDK;
  let connection: Connection;
  let wallet: anchor.Wallet;
  let programId: PublicKey;
  let mint: PublicKey;
  let user: Keypair;
  let keeper: Keypair;
  let userTokenAccount: PublicKey;
  let keeperTokenAccount: PublicKey;
  let orderId: BN;
  let depositAmount: BN;
  let timeout: BN;

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
    programId = new PublicKey('Bi8JW8SSePkgqQrKrjB3SSmFBZ3Bf1yWq1dMfC423D6j');
    
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

    // 创建用户代币账户
    userTokenAccount = await createAssociatedTokenAccount(
      connection,
      wallet.payer,
      mint,
      user.publicKey
    );

    // 创建keeper代币账户
    keeperTokenAccount = await createAssociatedTokenAccount(
      connection,
      wallet.payer,
      mint,
      keeper.publicKey
    );

    // 设置测试参数
    orderId = new BN(1);
    depositAmount = new BN(1_000_000); // 1 token with 6 decimals
    timeout = new BN(301); // 设置301秒的超时时间，略高于最小超时时间要求

    // 铸造代币到用户账户
    await mintTo(
      connection,
      wallet.payer,
      mint,
      userTokenAccount,
      wallet.payer,
      depositAmount.toNumber()
    );

    // 创建存款订单并存入代币
    const depositInstructions = await sdk.makeDepositTokensInstructions(
      user.publicKey.toString(),
      orderId,
      depositAmount,
      keeper.publicKey.toString(),
      timeout,
      mint.toString()
    );

    const depositTx = new Transaction().add(...depositInstructions.instructions);
    const depositSig = await connection.sendTransaction(depositTx, [wallet.payer, ...depositInstructions.signers]);
    await connection.confirmTransaction(depositSig, 'confirmed');

    // 更新订单状态为 ReadyToExecute
    const readyInstructions = await sdk.makeUpdateOrderStatusToReadyInstructions(
      orderId,
      mint.toString(),
      keeper.publicKey.toString()
    );

    const readyTx = new Transaction().add(...readyInstructions.instructions);
    const readySig = await connection.sendTransaction(readyTx, [keeper]);
    await connection.confirmTransaction(readySig, 'confirmed');
  });

  it('should allow keeper to withdraw funds and verify balance changes', async () => {
    const withdrawAmount = new BN(500_000); // 0.5 token

    // 记录提取前的余额
    const beforeKeeperBalance = new BN((await getAccount(connection, keeperTokenAccount)).amount.toString());
    const vaultTokenAccount = await sdk.getVaultTokenAccount(mint.toString());
    const beforeVaultBalance = new BN((await getAccount(connection, vaultTokenAccount)).amount.toString());

    // 提取资金
    const withdrawInstructions = await sdk.makeWithdrawTokensInstructions(
      orderId,
      mint.toString(),
      keeper.publicKey.toString(),
      withdrawAmount
    );

    const withdrawTx = new Transaction().add(...withdrawInstructions.instructions);
    const withdrawSig = await connection.sendTransaction(withdrawTx, [keeper]);
    await connection.confirmTransaction(withdrawSig, 'confirmed');

    // 验证余额变化
    const afterKeeperBalance = new BN((await getAccount(connection, keeperTokenAccount)).amount.toString());
    const afterVaultBalance = new BN((await getAccount(connection, vaultTokenAccount)).amount.toString());

    expect(afterKeeperBalance.toString()).toBe(beforeKeeperBalance.add(withdrawAmount).toString());
    expect(afterVaultBalance.toString()).toBe(beforeVaultBalance.sub(withdrawAmount).toString());
    expect(beforeKeeperBalance.add(beforeVaultBalance).toString())
      .toBe(afterKeeperBalance.add(afterVaultBalance).toString());
  });

  it('should allow multiple withdrawals with correct balance changes', async () => {
    const firstWithdraw = new BN(300_000);
    const secondWithdraw = new BN(200_000);

    const vaultTokenAccount = await sdk.getVaultTokenAccount(mint.toString());
    const initialKeeperBalance = new BN((await getAccount(connection, keeperTokenAccount)).amount.toString());
    const initialVaultBalance = new BN((await getAccount(connection, vaultTokenAccount)).amount.toString());

    // 第一次提取
    const firstWithdrawInstructions = await sdk.makeWithdrawTokensInstructions(
      orderId,
      mint.toString(),
      keeper.publicKey.toString(),
      firstWithdraw
    );

    const firstWithdrawTx = new Transaction().add(...firstWithdrawInstructions.instructions);
    const firstWithdrawSig = await connection.sendTransaction(firstWithdrawTx, [keeper]);
    await connection.confirmTransaction(firstWithdrawSig, 'confirmed');

    // 第二次提取
    const secondWithdrawInstructions = await sdk.makeWithdrawTokensInstructions(
      orderId,
      mint.toString(),
      keeper.publicKey.toString(),
      secondWithdraw
    );

    const secondWithdrawTx = new Transaction().add(...secondWithdrawInstructions.instructions);
    const secondWithdrawSig = await connection.sendTransaction(secondWithdrawTx, [keeper]);
    await connection.confirmTransaction(secondWithdrawSig, 'confirmed');

    // 验证最终余额
    const finalKeeperBalance = new BN((await getAccount(connection, keeperTokenAccount)).amount.toString());
    const finalVaultBalance = new BN((await getAccount(connection, vaultTokenAccount)).amount.toString());

    expect(finalKeeperBalance.toString()).toBe(
      initialKeeperBalance.add(firstWithdraw).add(secondWithdraw).toString()
    );
    expect(finalVaultBalance.toString()).toBe(
      initialVaultBalance.sub(firstWithdraw).sub(secondWithdraw).toString()
    );
  });

  it('should not allow unauthorized keeper to withdraw', async () => {
    const withdrawAmount = new BN(500_000);
    const fakeKeeper = Keypair.generate();

    // 给fake keeper空投SOL
    const fakeKeeperAirdrop = await connection.requestAirdrop(
      fakeKeeper.publicKey,
      5 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(fakeKeeperAirdrop);

    const fakeKeeperTokenAccount = await createAssociatedTokenAccount(
      connection,
      wallet.payer,
      mint,
      fakeKeeper.publicKey
    );

    try {
      const withdrawInstructions = await sdk.makeWithdrawTokensInstructions(
        orderId,
        mint.toString(),
        fakeKeeper.publicKey.toString(),
        withdrawAmount
      );

      const withdrawTx = new Transaction().add(...withdrawInstructions.instructions);
      await connection.sendTransaction(withdrawTx, [fakeKeeper]);
      fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.message).toContain('Unauthorized');
    }
  });

  it('should not allow withdrawal of more than available amount', async () => {
    const withdrawAmount = depositAmount.add(new BN(1));

    try {
      const withdrawInstructions = await sdk.makeWithdrawTokensInstructions(
        orderId,
        mint.toString(),
        keeper.publicKey.toString(),
        withdrawAmount
      );

      const withdrawTx = new Transaction().add(...withdrawInstructions.instructions);
      await connection.sendTransaction(withdrawTx, [keeper]);
      fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.message).toContain('InvalidAmount');
    }
  });

  it('should not allow withdrawal after timeout', async () => {
    const timeoutSeconds = timeout.toNumber();
    console.log(`等待订单超时中... 需要等待 ${timeoutSeconds} 秒`);
    
    // 每秒更新等待状态
    for (let i = timeoutSeconds; i > 0; i--) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (i % 10 === 0 || i <= 3) { // 每10秒显示一次，最后3秒每秒显示
        console.log(`还需等待 ${i} 秒...`);
      }
    }

    const withdrawAmount = new BN(500_000);

    try {
      const withdrawInstructions = await sdk.makeWithdrawTokensInstructions(
        orderId,
        mint.toString(),
        keeper.publicKey.toString(),
        withdrawAmount
      );

      const withdrawTx = new Transaction().add(...withdrawInstructions.instructions);
      await connection.sendTransaction(withdrawTx, [keeper]);
      fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.message).toContain('OrderTimeout');
    }
  }, 310000); // 设置310秒超时，比订单超时时间长一点
}); 