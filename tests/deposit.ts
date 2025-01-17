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

describe("存款模块测试", () => {
  // 使用默认配置
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Baggage as Program<Baggage>;
  
  let mint: anchor.web3.PublicKey;
  let userTokenAccount: anchor.web3.PublicKey;
  let vaultTokenAccount: anchor.web3.PublicKey;
  let keeper: anchor.web3.Keypair;
  
  before(async () => {
    // 创建代币
    mint = await createMint(
      provider.connection,
      (provider.wallet as any).payer,
      provider.wallet.publicKey,
      null,
      6
    );

    // 创建用户代币账户
    userTokenAccount = await createAccount(
      provider.connection,
      (provider.wallet as any).payer,
      mint,
      provider.wallet.publicKey
    );

    // 创建程序金库账户
    vaultTokenAccount = await createAccount(
      provider.connection,
      (provider.wallet as any).payer,
      mint,
      provider.wallet.publicKey
    );

    // 铸造一些代币给用户
    await mintTo(
      provider.connection,
      (provider.wallet as any).payer,
      mint,
      userTokenAccount,
      provider.wallet.publicKey,
      1000000
    );

    // 创建 keeper
    keeper = anchor.web3.Keypair.generate();
  });

  it("成功存入代币", async () => {
    const orderId = new anchor.BN(1);
    const amount = new anchor.BN(100000);
    const timeout = new anchor.BN(3600); // 1小时超时

    // 计算 PDA
    const [depositOrder] = await anchor.web3.PublicKey.findProgramAddress(
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
        deposit_order: depositOrder,
        user: provider.wallet.publicKey,
        mint,
        user_token_account: userTokenAccount,
        vault_token_account: vaultTokenAccount,
        system_program: anchor.web3.SystemProgram.programId,
        token_program: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    // 验证存款订单状态
    const orderAccount = await program.account.depositOrder.fetch(depositOrder);
    assert.ok(orderAccount.orderId.eq(orderId));
    assert.ok(orderAccount.amount.eq(amount));
    assert.equal(orderAccount.user.toBase58(), provider.wallet.publicKey.toBase58());
    assert.equal(orderAccount.keeper.toBase58(), keeper.publicKey.toBase58());
    assert.equal(orderAccount.status, { initialized: {} });
    assert.ok(orderAccount.completedAmount.eq(new anchor.BN(0)));
  });

  it("存款金额为0时应该失败", async () => {
    const orderId = new anchor.BN(2);
    const amount = new anchor.BN(0);
    const timeout = new anchor.BN(3600);

    const [depositOrder] = await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("deposit_order"),
        orderId.toArrayLike(Buffer, "le", 8)
      ],
      program.programId
    );

    try {
      await program.methods
        .depositTokens(
          orderId,
          amount,
          keeper.publicKey,
          timeout
        )
        .accounts({
          deposit_order: depositOrder,
          user: provider.wallet.publicKey,
          mint,
          user_token_account: userTokenAccount,
          vault_token_account: vaultTokenAccount,
          system_program: anchor.web3.SystemProgram.programId,
          token_program: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();
      assert.fail("应该失败但没有");
    } catch (err) {
      assert.ok(err);
    }
  });

  it("超时时间不能为负数", async () => {
    const orderId = new anchor.BN(3);
    const amount = new anchor.BN(100000);
    const timeout = new anchor.BN(-1);

    const [depositOrder] = await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("deposit_order"),
        orderId.toArrayLike(Buffer, "le", 8)
      ],
      program.programId
    );

    try {
      await program.methods
        .depositTokens(
          orderId,
          amount,
          keeper.publicKey,
          timeout
        )
        .accounts({
          deposit_order: depositOrder,
          user: provider.wallet.publicKey,
          mint,
          user_token_account: userTokenAccount,
          vault_token_account: vaultTokenAccount,
          system_program: anchor.web3.SystemProgram.programId,
          token_program: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();
      assert.fail("应该失败但没有");
    } catch (err) {
      assert.ok(err);
    }
  });
}); 