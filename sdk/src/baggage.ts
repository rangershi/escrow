import * as anchor from "@coral-xyz/anchor";
import { Program, BN, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, Connection, Keypair } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccount,
} from "@solana/spl-token";
import { Baggage } from './idl/baggage';


export class BaggageSDK {
  private program: Program;
  private connection: Connection;
  private wallet: anchor.Wallet;

  constructor(
    connection: Connection,
    wallet: anchor.Wallet,
    programId: PublicKey
  ) {
    this.connection = connection;
    this.wallet = wallet;
    const provider = new AnchorProvider(connection, wallet, {});
    this.program = new Program(Baggage as any, programId, provider);
  }

  /**
   * 获取金库PDA地址
   */
  async getVaultAuthority(): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [Buffer.from("vault")],
      this.program.programId
    );
  }

  /**
   * 获取存款订单PDA地址
   */
  async getDepositOrderPDA(
    orderId: BN,
    mint: PublicKey
  ): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [
        Buffer.from("deposit_order"),
        orderId.toArrayLike(Buffer, "le", 8),
        mint.toBuffer(),
      ],
      this.program.programId
    );
  }

  /**
   * 创建存款订单
   */
  async depositTokens(
    orderId: BN,
    amount: BN,
    keeper: PublicKey,
    timeout: BN,
    mint: PublicKey,
    userTokenAccount: PublicKey,
    vaultTokenAccount: PublicKey
  ) {
    const [depositOrder] = await this.getDepositOrderPDA(orderId, mint);

    return await this.program.methods
      .depositTokens(orderId, amount, keeper, timeout)
      .accounts({
        depositOrder,
        user: this.wallet.publicKey,
        mint,
        userTokenAccount,
        vaultTokenAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();
  }

  /**
   * 更新订单状态为准备执行
   */
  async updateOrderStatusToReady(
    depositOrder: PublicKey,
    keeperKeypair: Keypair
  ) {
    return await this.program.methods
      .updateOrderStatusToReady()
      .accounts({
        depositOrder,
        keeper: keeperKeypair.publicKey,
      })
      .signers([keeperKeypair])
      .rpc();
  }

  /**
   * 部分执行订单
   */
  async partiallyExecuteOrder(
    depositOrder: PublicKey,
    executeAmount: BN,
    keeperKeypair: Keypair
  ) {
    return await this.program.methods
      .partiallyExecuteOrder(executeAmount)
      .accounts({
        depositOrder,
        keeper: keeperKeypair.publicKey,
      })
      .signers([keeperKeypair])
      .rpc();
  }

  /**
   * 取消订单
   */
  async cancelOrder(
    depositOrder: PublicKey,
    userTokenAccount: PublicKey,
    vaultTokenAccount: PublicKey
  ) {
    const [vaultAuthority] = await this.getVaultAuthority();

    return await this.program.methods
      .cancelOrder()
      .accounts({
        depositOrder,
        authority: this.wallet.publicKey,
        userTokenAccount,
        vaultTokenAccount,
        vaultAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * 获取存款订单信息
   */
  async getDepositOrder(depositOrder: PublicKey) {
    return await this.program.account.depositOrder.fetch(depositOrder);
  }

  /**
   * 获取用户的代币关联账户地址
   */
  async getUserAssociatedTokenAccount(mint: PublicKey): Promise<PublicKey> {
    return await getAssociatedTokenAddress(
      mint,
      this.wallet.publicKey
    );
  }

  /**
   * 创建用户的代币关联账户（如果不存在）
   */
  async createUserAssociatedTokenAccount(mint: PublicKey): Promise<PublicKey> {
    return await createAssociatedTokenAccount(
      this.connection,
      this.wallet.payer,
      mint,
      this.wallet.publicKey
    );
  }
} 