import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Baggage } from "../target/types/baggage";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
} from "@solana/spl-token";
import { assert } from "chai";

describe("状态更新模块测试", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Baggage as Program<Baggage>;
  
  let mint: anchor.web3.PublicKey;
  let userTokenAccount: anchor.web3.PublicKey;
  let vaultTokenAccount: anchor.web3.PublicKey;
  let keeper: anchor.web3.Keypair;
  let depositOrder: anchor.web3.PublicKey;
  
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
    const orderId = new anchor.BN(1);
    const amount = new anchor.BN(100000);
    const timeout = new anchor.BN(3600);

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
        amount,
        keeper.publicKey,
        timeout
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
        authority: keeper.publicKey,
      })
      .signers([keeper])
      .rpc();

    const orderAccount = await program.account.depositOrder.fetch(depositOrder);
    assert.equal(orderAccount.status, { readyToExecute: {} });
  });

  it("非Keeper不能更新订单状态", async () => {
    const nonKeeper = anchor.web3.Keypair.generate();

    try {
      await program.methods
        .updateOrderStatusToReady()
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

  it("已完成的订单不能更新状态", async () => {
    // 先将订单标记为完成
    const orderAccount = await program.account.depositOrder.fetch(depositOrder);
    orderAccount.status = { completed: {} };

    try {
      await program.methods
        .updateOrderStatusToReady()
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