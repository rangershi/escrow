use anchor_lang::prelude::*;

declare_id!("Bo21goLpUivUVo7XPUTLz2sL4uvCouWv93D47a9MvB6H");

#[program]
pub mod baggage {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
