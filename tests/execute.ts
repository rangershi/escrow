import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Escrow } from "../target/types/escrow";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
  getAssociatedTokenAddress,
  createAssociatedTokenAccount,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createInitializeAccountInstruction,
} from "@solana/spl-token";
import { assert } from "chai";

describe("订单执行模块测试", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Escrow as Program<Escrow>;
  
  let mint: anchor.web3.PublicKey;
  let userTokenAccount: anchor.web3.PublicKey;
  let vaultTokenAccount: anchor.web3.PublicKey;
  let keeper: anchor.web3.Keypair;
  let depositOrder: anchor.web3.PublicKey;
  let vaultAuthority: anchor.web3.PublicKey;
  const orderId = new anchor.BN(1);
  const depositAmount = new anchor.BN(100000);
  
  before(async () => {
    // 创建代币
    mint = await createMint(
      provider.connection,
      provider.wallet.payer,
      provider.wallet.publicKey,
      null,
      6
    );

    // 创建用户代币账户
    userTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      provider.wallet.publicKey
    );

    // 获取金库权限 PDA
    [vaultAuthority] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("vault")],
      program.programId
    );

    // 创建金库代币账户
    const vaultAccount = anchor.web3.Keypair.generate();
    vaultTokenAccount = vaultAccount.publicKey;

    // 创建金库代币账户
    const tx = new anchor.web3.Transaction().add(
      // 创建账户
      anchor.web3.SystemProgram.createAccount({
        fromPubkey: provider.wallet.publicKey,
        newAccountPubkey: vaultTokenAccount,
        space: 165,
        lamports: await provider.connection.getMinimumBalanceForRentExemption(165),
        programId: TOKEN_PROGRAM_ID,
      }),
      // 初始化代币账户
      createInitializeAccountInstruction(
        vaultTokenAccount,
        mint,
        vaultAuthority
      )
    );

    await provider.sendAndConfirm(tx, [vaultAccount]);

    // 铸造代币
    await mintTo(
      provider.connection,
      provider.wallet.payer,
      mint,
      userTokenAccount,
      provider.wallet.publicKey,
      1000000
    );

    // 创建 keeper
    keeper = anchor.web3.Keypair.generate();

    // 创建存款订单
    [depositOrder] = await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("deposit_order"),
        orderId.toArrayLike(Buffer, "le", 8),
        mint.toBuffer()
      ],
      program.programId
    );

    // 执行存款
    await program.methods
      .depositTokens(
        orderId,
        depositAmount,
        keeper.publicKey,
        new anchor.BN(300) // 设置超时时间为 300 秒
      )
      .accounts({
        depositOrder,
        user: provider.wallet.publicKey,
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

  it("Keeper可以部分执行订单", async () => {
    const executeAmount = new anchor.BN(50000);

    await program.methods
      .partiallyExecuteOrder(executeAmount)
      .accounts({
        depositOrder,
        keeper: keeper.publicKey,
      })
      .signers([keeper])
      .rpc();

    const orderAccount = await program.account.depositOrder.fetch(depositOrder);
    assert.ok(orderAccount.completedAmount.eq(executeAmount));
    assert.deepEqual(orderAccount.status, { readyToExecute: {} });
  });

  it("非Keeper不能执行订单", async () => {
    const nonKeeper = anchor.web3.Keypair.generate();
    const executeAmount = new anchor.BN(10000);

    try {
      await program.methods
        .partiallyExecuteOrder(executeAmount)
        .accounts({
          depositOrder,
          keeper: nonKeeper.publicKey,
        })
        .signers([nonKeeper])
        .rpc();
      assert.fail("应该失败但没有");
    } catch (err) {
      assert.ok(err);
    }
  });

  it("执行金额不能超过订单剩余金额", async () => {
    const executeAmount = depositAmount.add(new anchor.BN(1));

    try {
      await program.methods
        .partiallyExecuteOrder(executeAmount)
        .accounts({
          depositOrder,
          keeper: keeper.publicKey,
        })
        .signers([keeper])
        .rpc();
      assert.fail("应该失败但没有");
    } catch (err) {
      assert.ok(err);
    }
  });

  it("已取消的订单不能执行", async () => {
    // 创建一个新的订单用于测试取消
    const cancelOrderId = new anchor.BN(2);
    let cancelDepositOrder: anchor.web3.PublicKey;

    [cancelDepositOrder] = await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("deposit_order"),
        cancelOrderId.toArrayLike(Buffer, "le", 8),
        mint.toBuffer()
      ],
      program.programId
    );

    // 执行存款
    await program.methods
      .depositTokens(
        cancelOrderId,
        depositAmount,
        keeper.publicKey,
        new anchor.BN(300)
      )
      .accounts({
        depositOrder: cancelDepositOrder,
        user: provider.wallet.publicKey,
        mint,
        userTokenAccount,
        vaultTokenAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    // 取消订单
    await program.methods
      .cancelOrder()
      .accounts({
        depositOrder: cancelDepositOrder,
        authority: provider.wallet.publicKey,
        userTokenAccount,
        vaultTokenAccount,
        vaultAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const executeAmount = new anchor.BN(10000);

    try {
      await program.methods
        .partiallyExecuteOrder(executeAmount)
        .accounts({
          depositOrder: cancelDepositOrder,
          keeper: keeper.publicKey,
        })
        .signers([keeper])
        .rpc();
      assert.fail("应该失败但没有");
    } catch (err) {
      const error = err as anchor.AnchorError;
      assert.equal(error.error.errorCode.code, "InvalidOrderStatus");
    }
  });
}); 