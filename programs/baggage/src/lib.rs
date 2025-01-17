use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};
use std::fmt;

declare_id!("9aaJ19ZKGUoGQDkzHVFVyhpK7iAviedofonxiT3Ayz81");

// Constants
pub const MIN_TIMEOUT: i64 = 300; // 最小超时时间 5 分钟
pub const MAX_TIMEOUT: i64 = 86400; // 最大超时时间 24 小时
pub const DEPOSIT_ORDER_SEED: &[u8] = b"deposit_order";

// Error definitions
#[error_code]
pub enum BaggageError {
    #[msg("订单已超时")]
    OrderTimeout,
    #[msg("订单状态无效")]
    InvalidOrderStatus,
    #[msg("无效的金额")]
    InvalidAmount,
    #[msg("未授权的操作")]
    Unauthorized,
    #[msg("Token Account 所有权验证失败")]
    InvalidTokenAccountOwner,
    #[msg("Token Account Mint 不匹配")]
    InvalidTokenMint,
    #[msg("超时时间设置无效")]
    InvalidTimeout,
}

// State definitions
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq)]
pub enum OrderStatus {
    Initialized,
    ReadyToExecute,
    Completed,
    Cancelled,
}

impl fmt::Display for OrderStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            OrderStatus::Initialized => write!(f, "Initialized"),
            OrderStatus::ReadyToExecute => write!(f, "ReadyToExecute"),
            OrderStatus::Completed => write!(f, "Completed"),
            OrderStatus::Cancelled => write!(f, "Cancelled"),
        }
    }
}

#[account]
pub struct DepositOrder {
    pub order_id: u64,
    pub user: Pubkey,
    pub amount: u64,
    pub token_mint: Pubkey,
    pub keeper: Pubkey,
    pub status: OrderStatus,
    pub completed_amount: u64,
    pub timeout: i64,
    pub creation_time: i64,
    pub bump: u8,
}

// Utility functions
pub fn is_order_timed_out(order: &DepositOrder) -> Result<bool> {
    let clock = Clock::get()?;
    Ok(clock.unix_timestamp > order.creation_time + order.timeout)
}

#[program]
pub mod baggage {
    use super::*;

    // Deposit instruction
    pub fn deposit_tokens(
        ctx: Context<DepositTokens>,
        order_id: u64,
        amount: u64,
        keeper: Pubkey,
        timeout: i64,
    ) -> Result<()> {
        // 验证超时时间
        require!(
            timeout >= MIN_TIMEOUT && timeout <= MAX_TIMEOUT,
            BaggageError::InvalidTimeout
        );

        // 验证 token 账户
        let user_token = TokenAccount::try_deserialize(&mut &ctx.accounts.user_token_account.data.borrow()[..])?;
        let vault_token = TokenAccount::try_deserialize(&mut &ctx.accounts.vault_token_account.data.borrow()[..])?;
        let _mint = Mint::try_deserialize(&mut &ctx.accounts.mint.data.borrow()[..])?;

        // 验证 token 账户所有权和 mint
        require!(
            user_token.owner == ctx.accounts.user.key(),
            BaggageError::InvalidTokenAccountOwner
        );
        require!(
            user_token.mint == ctx.accounts.mint.key() && vault_token.mint == ctx.accounts.mint.key(),
            BaggageError::InvalidTokenMint
        );

        let deposit_order = &mut ctx.accounts.deposit_order;
        let clock = Clock::get()?;

        deposit_order.order_id = order_id;
        deposit_order.user = ctx.accounts.user.key();
        deposit_order.amount = amount;
        deposit_order.token_mint = ctx.accounts.mint.key();
        deposit_order.keeper = keeper;
        deposit_order.status = OrderStatus::Initialized;
        deposit_order.completed_amount = 0;
        deposit_order.timeout = timeout;
        deposit_order.creation_time = clock.unix_timestamp;
        deposit_order.bump = ctx.bumps.deposit_order;

        // 转移用户代币到程序账户
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_token_account.to_account_info(),
                to: ctx.accounts.vault_token_account.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        );
        token::transfer(transfer_ctx, amount)?;

        msg!(
            "Deposit: User {} deposited {} tokens, order_id: {}", 
            ctx.accounts.user.key(), 
            amount,
            order_id
        );

        Ok(())
    }

    // Execute instruction
    pub fn partially_execute_order(
        ctx: Context<ExecuteOrder>,
        amount: u64,
    ) -> Result<()> {
        let deposit_order = &mut ctx.accounts.deposit_order;
        
        require_keys_eq!(
            deposit_order.keeper,
            ctx.accounts.keeper.key(),
            BaggageError::Unauthorized
        );
        
        require_eq!(
            deposit_order.status,
            OrderStatus::ReadyToExecute,
            BaggageError::InvalidOrderStatus
        );

        if is_order_timed_out(deposit_order)? {
            msg!("Order {} timed out", deposit_order.order_id);
            return err!(BaggageError::OrderTimeout);
        }

        let new_completed_amount = deposit_order.completed_amount.checked_add(amount)
            .ok_or(BaggageError::InvalidAmount)?;
            
        require!(
            new_completed_amount <= deposit_order.amount,
            BaggageError::InvalidAmount
        );

        deposit_order.completed_amount = new_completed_amount;

        if new_completed_amount == deposit_order.amount {
            deposit_order.status = OrderStatus::Completed;
            msg!(
                "Execute: Order {} fully completed, total amount: {}", 
                deposit_order.order_id, 
                deposit_order.amount
            );
        } else {
            msg!(
                "Execute: Order {} partially executed, amount: {}, total completed: {}", 
                deposit_order.order_id, 
                amount,
                new_completed_amount
            );
        }

        Ok(())
    }

    // Cancel instruction
    pub fn cancel_order(ctx: Context<CancelOrder>) -> Result<()> {
        // 检查调用者是否为用户或keeper
        require!(
            ctx.accounts.authority.key() == ctx.accounts.deposit_order.user || 
            ctx.accounts.authority.key() == ctx.accounts.deposit_order.keeper,
            BaggageError::Unauthorized
        );

        // 验证 token 账户
        let user_token = TokenAccount::try_deserialize(&mut &ctx.accounts.user_token_account.data.borrow()[..])?;
        let vault_token = TokenAccount::try_deserialize(&mut &ctx.accounts.vault_token_account.data.borrow()[..])?;

        // 验证 token 账户所有权和 mint
        require!(
            user_token.owner == ctx.accounts.deposit_order.user,
            BaggageError::InvalidTokenAccountOwner
        );
        require!(
            user_token.mint == ctx.accounts.deposit_order.token_mint && 
            vault_token.mint == ctx.accounts.deposit_order.token_mint,
            BaggageError::InvalidTokenMint
        );

        // 检查订单是否可以取消
        require!(
            ctx.accounts.deposit_order.status == OrderStatus::Initialized || 
            is_order_timed_out(&ctx.accounts.deposit_order)?,
            BaggageError::InvalidOrderStatus
        );

        // 计算需要返还的金额
        let refund_amount = ctx.accounts.deposit_order.amount
            .checked_sub(ctx.accounts.deposit_order.completed_amount)
            .ok_or(BaggageError::InvalidAmount)?;

        if refund_amount > 0 {
            // 从程序账户返还代币给用户
            let vault_seeds = &[
                b"vault".as_ref(),
                &[ctx.bumps.vault_authority],
            ];
            let vault_signer = &[&vault_seeds[..]];

            let transfer_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_token_account.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.vault_authority.to_account_info(),
                },
                vault_signer,
            );
            token::transfer(transfer_ctx, refund_amount)?;
        }

        // 更新订单状态
        let deposit_order = &mut ctx.accounts.deposit_order;
        deposit_order.status = OrderStatus::Cancelled;

        msg!(
            "Cancel: Order {} cancelled, refund amount: {}", 
            deposit_order.order_id, 
            refund_amount
        );

        Ok(())
    }

    // Update status instruction
    pub fn update_order_status_to_ready(ctx: Context<UpdateOrderStatus>) -> Result<()> {
        let deposit_order = &mut ctx.accounts.deposit_order;
        
        require_keys_eq!(
            deposit_order.keeper,
            ctx.accounts.keeper.key(),
            BaggageError::Unauthorized
        );
        
        require_eq!(
            deposit_order.status,
            OrderStatus::Initialized,
            BaggageError::InvalidOrderStatus
        );

        if is_order_timed_out(deposit_order)? {
            msg!("Order {} timed out", deposit_order.order_id);
            return err!(BaggageError::OrderTimeout);
        }

        deposit_order.status = OrderStatus::ReadyToExecute;
        
        msg!(
            "Status Update: Order {} status updated to ReadyToExecute", 
            deposit_order.order_id
        );

        Ok(())
    }
}

// Account validation structures
#[derive(Accounts)]
#[instruction(order_id: u64)]
pub struct DepositTokens<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + std::mem::size_of::<DepositOrder>(),
        seeds = [
            DEPOSIT_ORDER_SEED,
            order_id.to_le_bytes().as_ref(),
            mint.key().as_ref()
        ],
        bump
    )]
    pub deposit_order: Account<'info, DepositOrder>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    /// CHECK: We check the mint in the deposit_tokens instruction
    pub mint: AccountInfo<'info>,
    
    /// CHECK: We check the token account in the deposit_tokens instruction
    #[account(mut)]
    pub user_token_account: AccountInfo<'info>,
    
    /// CHECK: We check the token account in the deposit_tokens instruction
    #[account(mut)]
    pub vault_token_account: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ExecuteOrder<'info> {
    #[account(mut)]
    pub deposit_order: Account<'info, DepositOrder>,
    pub keeper: Signer<'info>,
}

#[derive(Accounts)]
pub struct CancelOrder<'info> {
    #[account(
        mut,
        seeds = [
            DEPOSIT_ORDER_SEED,
            deposit_order.order_id.to_le_bytes().as_ref(),
            deposit_order.token_mint.as_ref()
        ],
        bump = deposit_order.bump
    )]
    pub deposit_order: Account<'info, DepositOrder>,

    pub authority: Signer<'info>,

    /// CHECK: We check the token account in the cancel_order instruction
    #[account(mut)]
    pub user_token_account: AccountInfo<'info>,

    /// CHECK: We check the token account in the cancel_order instruction
    #[account(mut)]
    pub vault_token_account: AccountInfo<'info>,

    /// CHECK: We check the vault authority in the cancel_order instruction
    #[account(
        seeds = [b"vault"],
        bump
    )]
    pub vault_authority: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdateOrderStatus<'info> {
    #[account(mut)]
    pub deposit_order: Account<'info, DepositOrder>,
    pub keeper: Signer<'info>,
}
