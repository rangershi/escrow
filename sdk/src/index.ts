import * as anchor from "@coral-xyz/anchor";
import { Program, BN, AnchorProvider } from "@coral-xyz/anchor";
import {
    PublicKey,
    Connection,
    Keypair,
    TransactionInstruction,
    SystemProgram,
} from "@solana/web3.js";
import {
    TOKEN_PROGRAM_ID,
    getAssociatedTokenAddress,
    createAssociatedTokenAccount,
    getAccount,
    createAssociatedTokenAccountInstruction,
    ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { IDL } from './idl/escrow';
import { Idl } from "@coral-xyz/anchor";

export interface TransactionInstructions {
    instructions: TransactionInstruction[];
    signers: Keypair[];
}

export type EscrowProgram = Idl;

export class EscrowSDK {
    private program: Program<Idl>;
    private connection: Connection;
    private wallet: anchor.Wallet;

    constructor(
        connection: Connection,
        wallet: anchor.Wallet,
        programId: string
    ) {
        this.connection = connection;
        this.wallet = wallet;
        const provider = new AnchorProvider(connection, wallet, {
            commitment: 'confirmed',
        });
        this.program = new Program(IDL, new PublicKey(programId), provider);
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
     * 获取金库代币账户地址
     */
    async getVaultTokenAccount(mintAddress: string): Promise<PublicKey> {
        const mint = new PublicKey(mintAddress);
        const [vaultAuthority] = await this.getVaultAuthority();
        return await getAssociatedTokenAddress(mint, vaultAuthority, true);
    }

    /**
     * 获取存款订单PDA地址
     */
    async getDepositOrderPDA(
        orderId: BN,
        mintAddress: string
    ): Promise<[PublicKey, number]> {
        const mint = new PublicKey(mintAddress);
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
     * 创建存款订单的指令
     * @param userAddress - 用户的公钥地址
     * @param orderId - 订单ID
     * @param amount - 存款金额
     * @param keeperAddress - keeper的公钥地址
     * @param timeout - 超时时间（秒）
     * @param mintAddress - 代币的Mint地址
     * @returns 包含所有必要指令和签名者的对象
     */
    async makeDepositTokensInstructions(
        userAddress: string,
        orderId: BN,
        amount: BN,
        keeperAddress: string,
        timeout: BN,
        mintAddress: string
    ): Promise<TransactionInstructions> {
        const instructions: TransactionInstruction[] = [];
        const signers: Keypair[] = [];

        const user = new PublicKey(userAddress);
        const keeper = new PublicKey(keeperAddress);
        const mint = new PublicKey(mintAddress);

        // 获取用户代币账户地址
        const userTokenAccount = await getAssociatedTokenAddress(mint, user);

        // 检查用户代币账户是否存在，如果不存在则添加创建指令
        try {
            await getAccount(this.connection, userTokenAccount);
        } catch (e) {
            instructions.push(
                createAssociatedTokenAccountInstruction(
                    user,
                    userTokenAccount,
                    user,
                    mint
                )
            );
        }

        // 获取金库代币账户
        const vaultTokenAccount = await this.getVaultTokenAccount(mintAddress);
        const [vaultAuthority] = await this.getVaultAuthority();
        const [depositOrder] = await this.getDepositOrderPDA(orderId, mintAddress);

        // 检查金库代币账户是否存在，如果不存在则添加创建指令
        try {
            await getAccount(this.connection, vaultTokenAccount);
        } catch (e) {
            const ix = createAssociatedTokenAccountInstruction(
                user,
                vaultTokenAccount,
                vaultAuthority,
                mint
            );
            instructions.push(ix);
        }

        // 添加存款指令
        const depositInstruction = await this.program.methods
            .depositTokens(orderId, amount, keeper, timeout)
            .accounts({
                depositOrder,
                user,
                mint,
                userTokenAccount,
                vaultTokenAccount,
                systemProgram: SystemProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            })
            .instruction();

        instructions.push(depositInstruction);

        return {
            instructions,
            signers,
        };
    }

    /**
     * 更新订单状态为准备执行的指令
     */
    async makeUpdateOrderStatusToReadyInstructions(
        orderId: BN,
        mintAddress: string,
        keeperAddress: string
    ): Promise<TransactionInstructions> {
        const keeper = new PublicKey(keeperAddress);
        const [depositOrder] = await this.getDepositOrderPDA(orderId, mintAddress);

        const instruction = await this.program.methods
            .updateOrderStatusToReady()
            .accounts({
                depositOrder,
                keeper,
            })
            .instruction();

        return {
            instructions: [instruction],
            signers: [],
        };
    }

    /**
     * 部分执行订单的指令
     */
    async makePartiallyExecuteOrderInstructions(
        orderId: BN,
        mintAddress: string,
        executeAmount: BN,
        keeperAddress: string
    ): Promise<TransactionInstructions> {
        const keeper = new PublicKey(keeperAddress);
        const [depositOrder] = await this.getDepositOrderPDA(orderId, mintAddress);

        const instruction = await this.program.methods
            .partiallyExecuteOrder(executeAmount)
            .accounts({
                depositOrder,
                keeper,
            })
            .instruction();

        return {
            instructions: [instruction],
            signers: [],
        };
    }

    /**
     * 取消订单的指令
     */
    async makeCancelOrderInstructions(
        orderId: BN,
        mintAddress: string,
        userAddress: string
    ): Promise<TransactionInstructions> {
        const user = new PublicKey(userAddress);
        const mint = new PublicKey(mintAddress);
        const [depositOrder] = await this.getDepositOrderPDA(orderId, mintAddress);

        // 获取用户代币账户
        const userTokenAccount = await getAssociatedTokenAddress(mint, user);

        // 获取金库代币账户
        const vaultTokenAccount = await this.getVaultTokenAccount(mintAddress);
        const [vaultAuthority] = await this.getVaultAuthority();

        const instruction = await this.program.methods
            .cancelOrder()
            .accounts({
                depositOrder,
                authority: user,
                userTokenAccount,
                vaultTokenAccount,
                vaultAuthority,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .instruction();

        return {
            instructions: [instruction],
            signers: [],
        };
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
    async getUserAssociatedTokenAccount(mintAddress: string, userAddress: string): Promise<PublicKey> {
        const mint = new PublicKey(mintAddress);
        const user = new PublicKey(userAddress);
        return await getAssociatedTokenAddress(mint, user);
    }
}
