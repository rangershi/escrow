use anchor_lang::prelude::*;
use crate::state::DepositOrder;

pub fn is_order_timed_out(order: &DepositOrder) -> Result<bool> {
    let clock = Clock::get()?;
    Ok(clock.unix_timestamp > order.creation_time + order.timeout)
} 