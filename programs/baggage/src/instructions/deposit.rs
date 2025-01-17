use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::{DepositOrder, OrderStatus};

pub fn deposit_tokens(
    ctx: Context<DepositTokens>,
    order_id: u64,
    amount: u64,
    keeper: Pubkey,
    timeout: i64,
) -> Result<()> {
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

    Ok(())
}

#[derive(Accounts)]
#[instruction(order_id: u64)]
pub struct DepositTokens<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + std::mem::size_of::<DepositOrder>(),
        seeds = [b"deposit_order".as_ref(), order_id.to_le_bytes().as_ref()],
        bump
    )]
    pub deposit_order: Account<'info, DepositOrder>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub mint: Account<'info, token::Mint>,
    
    #[account(
        mut,
        constraint = user_token_account.mint == mint.key(),
        constraint = user_token_account.owner == user.key()
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = vault_token_account.mint == mint.key()
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
} 