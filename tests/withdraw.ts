import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Escrow } from "../target/types/escrow";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";
import { BN } from "bn.js";

describe("提取资金模块测试", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Escrow as Program<Escrow>;
  const wallet = provider.wallet as anchor.Wallet;

  let mint: PublicKey;
  let userTokenAccount: PublicKey;
  let vaultTokenAccount: PublicKey;
  let keeper: Keypair;
  let keeperTokenAccount: PublicKey;
  let depositOrder: PublicKey;
  let vaultAuthority: PublicKey;
  const orderId = new BN(1);
  const depositAmount = new BN(100000);
  const timeout = new BN(301); // 设置301秒的超时时间，略高于最小超时时间要求

  beforeEach(async () => {
    // 创建代币
    mint = await createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey,
      null,
      6
    );

    // 创建用户代币账户
    userTokenAccount = await createAccount(
      provider.connection,
      wallet.payer,
      mint,
      wallet.publicKey
    );

    // 获取金库 PDA
    [vaultAuthority] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("vault")],
      program.programId
    );

    // 创建金库代币账户
    const vaultTokenAccountKeypair = anchor.web3.Keypair.generate();
    vaultTokenAccount = vaultTokenAccountKeypair.publicKey;

    const rent = await provider.connection.getMinimumBalanceForRentExemption(165);
    const createAccountIx = anchor.web3.SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: vaultTokenAccount,
      space: 165,
      lamports: rent,
      programId: TOKEN_PROGRAM_ID,
    });

    const initAccountIx = {
      programId: TOKEN_PROGRAM_ID,
      keys: [
        { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: vaultAuthority, isSigner: false, isWritable: false },
        { pubkey: anchor.web3.SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data: Buffer.from([1, ...vaultAuthority.toBytes(), ...mint.toBytes()]),
    };

    const tx = new anchor.web3.Transaction().add(createAccountIx, initAccountIx);
    await provider.sendAndConfirm(tx, [vaultTokenAccountKeypair]);

    // 铸造一些代币到用户账户
    await mintTo(
      provider.connection,
      wallet.payer,
      mint,
      userTokenAccount,
      wallet.publicKey,
      depositAmount.toNumber()
    );

    // 创建 keeper
    keeper = anchor.web3.Keypair.generate();

    // 创建 keeper 的代币账户
    keeperTokenAccount = await createAccount(
      provider.connection,
      wallet.payer,
      mint,
      keeper.publicKey
    );

    // 创建存款订单
    [depositOrder] = await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("deposit_order"),
        orderId.toArrayLike(Buffer, "le", 8),
        mint.toBuffer()
      ],
      program.programId
    );

    // 存入代币
    await program.methods
      .depositTokens(orderId, depositAmount, keeper.publicKey, timeout)
      .accounts({
        depositOrder,
        user: wallet.publicKey,
        mint,
        userTokenAccount,
        vaultTokenAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    // 更新订单状态为 ReadyToExecute
    await program.methods
      .updateOrderStatusToReady()
      .accounts({
        depositOrder,
        keeper: keeper.publicKey,
      })
      .signers([keeper])
      .rpc();
  });

  it("Keeper 可以提取资金并且余额变化准确", async () => {
    const withdrawAmount = new BN(50000);

    // 记录提取前的余额
    const beforeKeeperBalance = new BN((await getAccount(provider.connection, keeperTokenAccount)).amount.toString());
    const beforeVaultBalance = new BN((await getAccount(provider.connection, vaultTokenAccount)).amount.toString());

    // 提取资金
    await program.methods
      .withdrawTokens(withdrawAmount)
      .accounts({
        depositOrder,
        keeper: keeper.publicKey,
        keeperTokenAccount,
        vaultTokenAccount,
        vaultAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([keeper])
      .rpc();

    // 验证 keeper 账户余额增加了正确的金额
    const afterKeeperBalance = new BN((await getAccount(provider.connection, keeperTokenAccount)).amount.toString());
    assert.equal(
      afterKeeperBalance.toString(),
      beforeKeeperBalance.add(withdrawAmount).toString(),
      "Keeper 账户余额增加不正确"
    );

    // 验证金库账户余额减少了正确的金额
    const afterVaultBalance = new BN((await getAccount(provider.connection, vaultTokenAccount)).amount.toString());
    assert.equal(
      afterVaultBalance.toString(),
      beforeVaultBalance.sub(withdrawAmount).toString(),
      "Vault 账户余额减少不正确"
    );

    // 验证总金额守恒
    assert.equal(
      beforeKeeperBalance.add(beforeVaultBalance).toString(),
      afterKeeperBalance.add(afterVaultBalance).toString(),
      "总金额不守恒"
    );
  });

  it("多次提取资金时余额变化准确", async () => {
    const firstWithdraw = new BN(30000);
    const secondWithdraw = new BN(20000);

    // 记录初始余额
    const initialKeeperBalance = new BN((await getAccount(provider.connection, keeperTokenAccount)).amount.toString());
    const initialVaultBalance = new BN((await getAccount(provider.connection, vaultTokenAccount)).amount.toString());

    // 第一次提取
    await program.methods
      .withdrawTokens(firstWithdraw)
      .accounts({
        depositOrder,
        keeper: keeper.publicKey,
        keeperTokenAccount,
        vaultTokenAccount,
        vaultAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([keeper])
      .rpc();

    // 验证第一次提取后的余额
    const afterFirstWithdrawKeeperBalance = new BN((await getAccount(provider.connection, keeperTokenAccount)).amount.toString());
    const afterFirstWithdrawVaultBalance = new BN((await getAccount(provider.connection, vaultTokenAccount)).amount.toString());
    
    assert.equal(
      afterFirstWithdrawKeeperBalance.toString(),
      initialKeeperBalance.add(firstWithdraw).toString(),
      "第一次提取后 Keeper 账户余额不正确"
    );
    assert.equal(
      afterFirstWithdrawVaultBalance.toString(),
      initialVaultBalance.sub(firstWithdraw).toString(),
      "第一次提取后 Vault 账户余额不正确"
    );

    // 第二次提取
    await program.methods
      .withdrawTokens(secondWithdraw)
      .accounts({
        depositOrder,
        keeper: keeper.publicKey,
        keeperTokenAccount,
        vaultTokenAccount,
        vaultAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([keeper])
      .rpc();

    // 验证第二次提取后的余额
    const finalKeeperBalance = new BN((await getAccount(provider.connection, keeperTokenAccount)).amount.toString());
    const finalVaultBalance = new BN((await getAccount(provider.connection, vaultTokenAccount)).amount.toString());

    assert.equal(
      finalKeeperBalance.toString(),
      initialKeeperBalance.add(firstWithdraw).add(secondWithdraw).toString(),
      "最终 Keeper 账户余额不正确"
    );
    assert.equal(
      finalVaultBalance.toString(),
      initialVaultBalance.sub(firstWithdraw).sub(secondWithdraw).toString(),
      "最终 Vault 账户余额不正确"
    );

    // 验证总金额守恒
    assert.equal(
      initialKeeperBalance.add(initialVaultBalance).toString(),
      finalKeeperBalance.add(finalVaultBalance).toString(),
      "总金额不守恒"
    );
  });

  it("非 Keeper 不能提取资金", async () => {
    const withdrawAmount = new BN(50000);
    const fakeKeeper = Keypair.generate();

    try {
      await program.methods
        .withdrawTokens(withdrawAmount)
        .accounts({
          depositOrder,
          keeper: fakeKeeper.publicKey,
          keeperTokenAccount,
          vaultTokenAccount,
          vaultAuthority,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([fakeKeeper])
        .rpc();
      assert.fail("应该抛出未授权错误");
    } catch (error: any) {
      assert.include(error.message, "Unauthorized");
    }
  });

  it("不能提取超过可用金额", async () => {
    const withdrawAmount = depositAmount.add(new BN(1));

    try {
      await program.methods
        .withdrawTokens(withdrawAmount)
        .accounts({
          depositOrder,
          keeper: keeper.publicKey,
          keeperTokenAccount,
          vaultTokenAccount,
          vaultAuthority,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([keeper])
        .rpc();
      assert.fail("应该抛出金额无效错误");
    } catch (error: any) {
      assert.include(error.message, "InvalidAmount");
    }
  });

  it("超时订单不能提取资金", async () => {
    const timeoutSeconds = timeout.toNumber();
    console.log(`等待订单超时中... 需要等待 ${timeoutSeconds} 秒`);
    
    // 每秒更新等待状态
    for (let i = timeoutSeconds; i > 0; i--) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (i % 10 === 0 || i <= 3) { // 每10秒显示一次，最后3秒每秒显示
        console.log(`还需等待 ${i} 秒...`);
      }
    }

    const withdrawAmount = new BN(50000);

    try {
      await program.methods
        .withdrawTokens(withdrawAmount)
        .accounts({
          depositOrder,
          keeper: keeper.publicKey,
          keeperTokenAccount,
          vaultTokenAccount,
          vaultAuthority,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([keeper])
        .rpc();
      assert.fail("应该抛出订单超时错误");
    } catch (error: any) {
      assert.include(error.message, "OrderTimeout");
    }
  });
}); 