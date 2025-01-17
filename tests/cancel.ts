import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { Baggage } from "../target/types/baggage";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";

describe("订单取消模块测试", () => {
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
  
  beforeEach(async () => {
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
        new anchor.BN(1) // 1秒超时，方便测试
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

  it("用户可以取消初始状态的订单", async () => {
    const beforeBalance = (await getAccount(provider.connection, userTokenAccount)).amount;

    await program.methods
      .cancelOrder()
      .accounts({
        depositOrder,
        authority: provider.wallet.publicKey,
        userTokenAccount,
        vaultTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const orderAccount = await program.account.depositOrder.fetch(depositOrder);
    assert.equal(orderAccount.status, { cancelled: {} });

    const afterBalance = (await getAccount(provider.connection, userTokenAccount)).amount;
    assert.ok(afterBalance > beforeBalance);
  });

  it("Keeper可以取消超时的订单", async () => {
    // 等待订单超时
    await new Promise(resolve => setTimeout(resolve, 2000));

    const beforeBalance = (await getAccount(provider.connection, userTokenAccount)).amount;

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

    const orderAccount = await program.account.depositOrder.fetch(depositOrder);
    assert.equal(orderAccount.status, { cancelled: {} });

    const afterBalance = (await getAccount(provider.connection, userTokenAccount)).amount;
    assert.ok(afterBalance > beforeBalance);
  });

  it("非用户和Keeper不能取消订单", async () => {
    const nonAuthorized = anchor.web3.Keypair.generate();

    try {
      await program.methods
        .cancelOrder()
        .accounts({
          depositOrder,
          authority: nonAuthorized.publicKey,
          userTokenAccount,
          vaultTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([nonAuthorized])
        .rpc();
      assert.fail("应该失败但没有");
    } catch (err) {
      assert.ok(err);
    }
  });

  it("已执行的订单不能取消", async () => {
    // 先将订单更新为 ReadyToExecute
    await program.methods
      .updateOrderStatusToReady()
      .accounts({
        depositOrder,
        authority: keeper.publicKey,
      })
      .signers([keeper])
      .rpc();

    // 执行部分订单
    await program.methods
      .partiallyExecuteOrder(new anchor.BN(50000))
      .accounts({
        depositOrder,
        authority: keeper.publicKey,
      })
      .signers([keeper])
      .rpc();

    try {
      await program.methods
        .cancelOrder()
        .accounts({
          depositOrder,
          authority: provider.wallet.publicKey,
          userTokenAccount,
          vaultTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      assert.fail("应该失败但没有");
    } catch (err) {
      assert.ok(err);
    }
  });
}); 