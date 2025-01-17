use anchor_lang::prelude::*;
use std::fmt;

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