use anchor_lang::prelude::*;
use crate::state::{DepositOrder, OrderStatus};
use crate::error::BaggageError;
use crate::utils::is_order_timed_out;

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
    }

    Ok(())
}

#[derive(Accounts)]
pub struct ExecuteOrder<'info> {
    #[account(mut)]
    pub deposit_order: Account<'info, DepositOrder>,
    pub keeper: Signer<'info>,
} 