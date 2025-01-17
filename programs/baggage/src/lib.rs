use anchor_lang::prelude::*;

pub mod error;
pub mod state;
pub mod instructions;
pub mod utils;

use instructions::*;

declare_id!("Bo21goLpUivUVo7XPUTLz2sL4uvCouWv93D47a9MvB6H");

#[program]
pub mod baggage {
    use super::*;

    pub fn deposit_tokens(
        ctx: Context<DepositTokens>,
        order_id: u64,
        amount: u64,
        keeper: Pubkey,
        timeout: i64,
    ) -> Result<()> {
        instructions::deposit::deposit_tokens(ctx, order_id, amount, keeper, timeout)
    }

    pub fn update_order_status_to_ready(
        ctx: Context<UpdateOrderStatus>
    ) -> Result<()> {
        instructions::update_status::update_order_status_to_ready(ctx)
    }

    pub fn partially_execute_order(
        ctx: Context<ExecuteOrder>,
        amount: u64,
    ) -> Result<()> {
        instructions::execute::partially_execute_order(ctx, amount)
    }

    pub fn cancel_order(ctx: Context<CancelOrder>) -> Result<()> {
        instructions::cancel::cancel_order(ctx)
    }
}
