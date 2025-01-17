use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, Transfer};
use crate::state::{DepositOrder, OrderStatus};
use crate::error::BaggageError;
use crate::utils::is_order_timed_out;

pub fn cancel_order(ctx: Context<CancelOrder>) -> Result<()> {
    // 检查调用者是否为用户或keeper
    require!(
        ctx.accounts.authority.key() == ctx.accounts.deposit_order.user || 
        ctx.accounts.authority.key() == ctx.accounts.deposit_order.keeper,
        BaggageError::Unauthorized
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
        let seeds = &[
            b"deposit_order".as_ref(),
            &ctx.accounts.deposit_order.order_id.to_le_bytes(),
            &[ctx.accounts.deposit_order.bump],
        ];
        let signer = &[&seeds[..]];

        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_token_account.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: ctx.accounts.deposit_order.to_account_info(),
            },
            signer,
        );
        token::transfer(transfer_ctx, refund_amount)?;
    }

    // 更新订单状态
    let deposit_order = &mut ctx.accounts.deposit_order;
    deposit_order.status = OrderStatus::Cancelled;
    Ok(())
}

#[derive(Accounts)]
pub struct CancelOrder<'info> {
    #[account(
        mut,
        seeds = [b"deposit_order", deposit_order.order_id.to_le_bytes().as_ref()],
        bump = deposit_order.bump
    )]
    pub deposit_order: Account<'info, DepositOrder>,

    pub authority: Signer<'info>,

    /// CHECK: This is the user's token account that will receive the refunded tokens
    #[account(mut)]
    pub user_token_account: UncheckedAccount<'info>,

    /// CHECK: This is the vault's token account that holds the deposited tokens
    #[account(mut)]
    pub vault_token_account: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
} 