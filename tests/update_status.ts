import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Escrow } from "../target/types/escrow";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAssociatedTokenAddress,
  createAssociatedTokenAccount,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createInitializeAccountInstruction,
} from "@solana/spl-token";
import { assert } from "chai";

describe("状态更新模块测试", () => {
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
  });

  it("Keeper可以将订单状态更新为ReadyToExecute", async () => {
    await program.methods
      .updateOrderStatusToReady()
      .accounts({
        depositOrder,
        keeper: keeper.publicKey,
      })
      .signers([keeper])
      .rpc();

    const orderAccount = await program.account.depositOrder.fetch(depositOrder);
    assert.deepEqual(orderAccount.status, { readyToExecute: {} });
  });

  it("非Keeper不能更新订单状态", async () => {
    // 创建新的订单用于测试
    const newOrderId = new anchor.BN(2);
    let newDepositOrder: anchor.web3.PublicKey;

    [newDepositOrder] = await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("deposit_order"),
        newOrderId.toArrayLike(Buffer, "le", 8),
        mint.toBuffer()
      ],
      program.programId
    );

    // 执行存款
    await program.methods
      .depositTokens(
        newOrderId,
        depositAmount,
        keeper.publicKey,
        new anchor.BN(300)
      )
      .accounts({
        depositOrder: newDepositOrder,
        user: provider.wallet.publicKey,
        mint,
        userTokenAccount,
        vaultTokenAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const nonKeeper = anchor.web3.Keypair.generate();

    try {
      await program.methods
        .updateOrderStatusToReady()
        .accounts({
          depositOrder: newDepositOrder,
          keeper: nonKeeper.publicKey,
        })
        .signers([nonKeeper])
        .rpc();
      assert.fail("应该失败但没有");
    } catch (err) {
      const error = err as anchor.AnchorError;
      assert.equal(error.error.errorCode.code, "Unauthorized");
    }
  });

  it("已完成的订单不能更新状态", async () => {
    // 创建新的订单用于测试
    const newOrderId = new anchor.BN(3);
    let newDepositOrder: anchor.web3.PublicKey;

    [newDepositOrder] = await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("deposit_order"),
        newOrderId.toArrayLike(Buffer, "le", 8),
        mint.toBuffer()
      ],
      program.programId
    );

    // 执行存款
    await program.methods
      .depositTokens(
        newOrderId,
        depositAmount,
        keeper.publicKey,
        new anchor.BN(300)
      )
      .accounts({
        depositOrder: newDepositOrder,
        user: provider.wallet.publicKey,
        mint,
        userTokenAccount,
        vaultTokenAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    // 先将订单更新为 ReadyToExecute
    await program.methods
      .updateOrderStatusToReady()
      .accounts({
        depositOrder: newDepositOrder,
        keeper: keeper.publicKey,
      })
      .signers([keeper])
      .rpc();

    // 再次尝试更新状态
    try {
      await program.methods
        .updateOrderStatusToReady()
        .accounts({
          depositOrder: newDepositOrder,
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

  // 注意: 这个测试需要等待一段时间,可能会影响测试执行效率
  // 建议在开发时注释掉这个测试,只在需要时运行
  it.skip("超时的订单不能更新状态", async () => {
    // 创建新的订单用于测试
    const newOrderId = new anchor.BN(4);
    let newDepositOrder: anchor.web3.PublicKey;

    [newDepositOrder] = await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("deposit_order"),
        newOrderId.toArrayLike(Buffer, "le", 8),
        mint.toBuffer()
      ],
      program.programId
    );

    // 执行存款,使用较短的超时时间
    await program.methods
      .depositTokens(
        newOrderId,
        depositAmount,
        keeper.publicKey,
        new anchor.BN(300) // 使用最小超时时间
      )
      .accounts({
        depositOrder: newDepositOrder,
        user: provider.wallet.publicKey,
        mint,
        userTokenAccount,
        vaultTokenAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    // 等待订单超时
    console.log("等待订单超时...");
    await new Promise(resolve => setTimeout(resolve, 301000));
    console.log("订单已超时");

    try {
      await program.methods
        .updateOrderStatusToReady()
        .accounts({
          depositOrder: newDepositOrder,
          keeper: keeper.publicKey,
        })
        .signers([keeper])
        .rpc();
      assert.fail("应该失败但没有");
    } catch (err) {
      const error = err as anchor.AnchorError;
      assert.equal(error.error.errorCode.code, "OrderTimeout");
    }
  });
}); 