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
import { Keypair } from "@solana/web3.js";

describe("订单取消模块测试", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Baggage as Program<Baggage>;
  const payer = Keypair.generate();
  
  let mint: anchor.web3.PublicKey;
  let userTokenAccount: anchor.web3.PublicKey;
  let vaultTokenAccount: anchor.web3.PublicKey;
  let keeper: anchor.web3.Keypair;
  let depositOrder: anchor.web3.PublicKey;
  const orderId = new anchor.BN(1);
  const depositAmount = new anchor.BN(100000);
  
  beforeEach(async () => {
    // 给 payer 空投一些 SOL
    const signature = await provider.connection.requestAirdrop(
      payer.publicKey,
      1000000000
    );
    await provider.connection.confirmTransaction(signature);

    // 创建代币
    mint = await createMint(
      provider.connection,
      payer,
      payer.publicKey,
      null,
      6
    );

    // 创建用户代币账户
    userTokenAccount = await createAccount(
      provider.connection,
      payer,
      mint,
      payer.publicKey
    );

    // 创建程序金库账户
    vaultTokenAccount = await createAccount(
      provider.connection,
      payer,
      mint,
      payer.publicKey
    );

    // 铸造一些代币到用户账户
    await mintTo(
      provider.connection,
      payer,
      mint,
      userTokenAccount,
      payer,
      depositAmount.toNumber()
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
        deposit_order: depositOrder,
        user: payer.publicKey,
        mint,
        user_token_account: userTokenAccount,
        vault_token_account: vaultTokenAccount,
        system_program: anchor.web3.SystemProgram.programId,
        token_program: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([payer])
      .rpc();
  });

  it("用户可以取消初始状态的订单", async () => {
    // 取消订单
    await program.methods
      .cancelOrder()
      .accounts({
        deposit_order: depositOrder,
        user: payer.publicKey,
        mint,
        user_token_account: userTokenAccount,
        vault_token_account: vaultTokenAccount,
        token_program: TOKEN_PROGRAM_ID,
      })
      .signers([payer])
      .rpc();

    // 验证用户代币账户余额已恢复
    const userTokenAccountInfo = await getAccount(provider.connection, userTokenAccount);
    assert.equal(userTokenAccountInfo.amount.toString(), depositAmount.toString());
  });
}); 