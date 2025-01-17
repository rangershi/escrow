import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Baggage } from "../target/types/baggage";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";

describe("订单执行模块测试", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Baggage as Program<Baggage>;
  
  let mint: anchor.web3.PublicKey;
  let userTokenAccount: anchor.web3.PublicKey;
  let vaultTokenAccount: anchor.web3.PublicKey;
  let keeper: anchor.web3.Keypair;
  let depositOrder: anchor.web3.PublicKey;
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
    userTokenAccount = await createAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      provider.wallet.publicKey
    );

    // 创建程序金库账户
    vaultTokenAccount = await createAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      provider.wallet.publicKey
    );

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
        orderId.toArrayLike(Buffer, "le", 8)
      ],
      program.programId
    );

    // 执行存款
    await program.methods
      .depositTokens(
        orderId,
        depositAmount,
        keeper.publicKey,
        new anchor.BN(3600)
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
        authority: keeper.publicKey,
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
        authority: keeper.publicKey,
      })
      .signers([keeper])
      .rpc();

    const orderAccount = await program.account.depositOrder.fetch(depositOrder);
    assert.ok(orderAccount.completedAmount.eq(executeAmount));
    assert.equal(orderAccount.status, { readyToExecute: {} });
  });

  it("非Keeper不能执行订单", async () => {
    const nonKeeper = anchor.web3.Keypair.generate();
    const executeAmount = new anchor.BN(10000);

    try {
      await program.methods
        .partiallyExecuteOrder(executeAmount)
        .accounts({
          depositOrder,
          authority: nonKeeper.publicKey,
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
          authority: keeper.publicKey,
        })
        .signers([keeper])
        .rpc();
      assert.fail("应该失败但没有");
    } catch (err) {
      assert.ok(err);
    }
  });

  it("已取消的订单不能执行", async () => {
    // 先取消订单
    await program.methods
      .cancelOrder()
      .accounts({
        depositOrder,
        authority: keeper.publicKey,
        userTokenAccount,
        vaultTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([keeper])
      .rpc();

    const executeAmount = new anchor.BN(10000);

    try {
      await program.methods
        .partiallyExecuteOrder(executeAmount)
        .accounts({
          depositOrder,
          authority: keeper.publicKey,
        })
        .signers([keeper])
        .rpc();
      assert.fail("应该失败但没有");
    } catch (err) {
      assert.ok(err);
    }
  });
}); 