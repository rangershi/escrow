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
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Baggage as Program<Baggage>;
  
  let mint: anchor.web3.PublicKey;
  let userTokenAccount: anchor.web3.PublicKey;
  let vaultTokenAccount: anchor.web3.PublicKey;
  let keeper: anchor.web3.Keypair;
  let vaultAuthority: anchor.web3.PublicKey;
  
  before(async () => {
    // 创建代币
    mint = await createMint(
      provider.connection,
      (provider.wallet as any).payer,
      provider.wallet.publicKey,
      null,
      6
    );

    // 获取金库 PDA
    [vaultAuthority] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("vault")],
      program.programId
    );

    // 创建用户代币账户
    userTokenAccount = await createAccount(
      provider.connection,
      (provider.wallet as any).payer,
      mint,
      provider.wallet.publicKey
    );

    // 创建金库代币账户
    const vaultTokenAccountKeypair = anchor.web3.Keypair.generate();
    vaultTokenAccount = vaultTokenAccountKeypair.publicKey;
    
    const rent = await provider.connection.getMinimumBalanceForRentExemption(165);
    const createAccountIx = anchor.web3.SystemProgram.createAccount({
      fromPubkey: provider.wallet.publicKey,
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
      data: Buffer.from([1, ...vaultAuthority.toBytes(), ...mint.toBytes()]), // InitializeAccount instruction with authority and mint
    };

    const tx = new anchor.web3.Transaction().add(createAccountIx, initAccountIx);
    await provider.sendAndConfirm(tx, [vaultTokenAccountKeypair]);

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
        orderId.toArrayLike(Buffer, "le", 8),
        mint.toBuffer()
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

    // 验证存款订单状态
    const orderAccount = await program.account.depositOrder.fetch(depositOrder);
    assert.ok(orderAccount.orderId.eq(orderId));
    assert.ok(orderAccount.amount.eq(amount));
    assert.equal(orderAccount.user.toBase58(), provider.wallet.publicKey.toBase58());
    assert.equal(orderAccount.keeper.toBase58(), keeper.publicKey.toBase58());
    assert.deepEqual(orderAccount.status, { initialized: {} });
    assert.ok(orderAccount.completedAmount.eq(new anchor.BN(0)));
  });

  it("存款金额为0时应该失败", async () => {
    const orderId = new anchor.BN(2);
    const amount = new anchor.BN(0);
    const timeout = new anchor.BN(3600);

    const [depositOrder] = await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("deposit_order"),
        orderId.toArrayLike(Buffer, "le", 8),
        mint.toBuffer()
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
        orderId.toArrayLike(Buffer, "le", 8),
        mint.toBuffer()
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
      assert.fail("应该失败但没有");
    } catch (err) {
      assert.ok(err);
    }
  });
}); 