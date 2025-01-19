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
import { Keypair } from "@solana/web3.js";

describe("订单取消模块测试", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Escrow as Program<Escrow>;
  const payer = provider.wallet.payer;

  let mint: anchor.web3.PublicKey;
  let userTokenAccount: anchor.web3.PublicKey;
  let vaultTokenAccount: anchor.web3.PublicKey;
  let keeper: anchor.web3.Keypair;
  let depositOrder: anchor.web3.PublicKey;
  let vaultAuthority: anchor.web3.PublicKey;
  const orderId = new anchor.BN(1);
  const depositAmount = new anchor.BN(100000);
  const timeout = new anchor.BN(600); // 设置10分钟的超时时间

  beforeEach(async () => {
    // 创建代币
    mint = await createMint(
      provider.connection,
      payer,
      provider.wallet.publicKey,
      null,
      6
    );

    // 创建用户代币账户
    userTokenAccount = await createAccount(
      provider.connection,
      payer,
      mint,
      provider.wallet.publicKey
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
      data: Buffer.from([1, ...vaultAuthority.toBytes(), ...mint.toBytes()]),
    };

    const tx = new anchor.web3.Transaction().add(createAccountIx, initAccountIx);
    await provider.sendAndConfirm(tx, [vaultTokenAccountKeypair]);

    // 铸造一些代币到用户账户
    await mintTo(
      provider.connection,
      payer,
      mint,
      userTokenAccount,
      provider.wallet.publicKey,
      depositAmount.toNumber()
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

    // 存入代币
    // @ts-ignore
      await program.methods
      .depositTokens(orderId, depositAmount, keeper.publicKey, timeout)
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
    // 取消订单
    await program.methods
      .cancelOrder()
      .accounts({
        depositOrder,
        authority: provider.wallet.publicKey,
        userTokenAccount,
        vaultTokenAccount,
        vaultAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    // 验证订单状态
    const orderAccount = await program.account.depositOrder.fetch(depositOrder);
    assert.deepEqual(orderAccount.status, { cancelled: {} });

    // 验证代币已经返还给用户
    const userTokenAccountInfo = await getAccount(provider.connection, userTokenAccount);
    assert.equal(userTokenAccountInfo.amount.toString(), depositAmount.toString());
  });
});
