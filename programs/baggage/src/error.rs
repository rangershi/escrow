use anchor_lang::prelude::*;

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
} 