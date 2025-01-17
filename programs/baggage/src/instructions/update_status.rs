use anchor_lang::prelude::*;
use crate::state::{DepositOrder, OrderStatus};
use crate::error::BaggageError;
use crate::utils::is_order_timed_out;

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
        return err!(BaggageError::OrderTimeout);
    }

    deposit_order.status = OrderStatus::ReadyToExecute;
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateOrderStatus<'info> {
    #[account(mut)]
    pub deposit_order: Account<'info, DepositOrder>,
    pub keeper: Signer<'info>,
} 