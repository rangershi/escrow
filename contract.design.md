# **Solana 去中心化交易所智能合约详细设计文档（更新版）**

### **1. 总体设计**

在此设计中，智能合约管理用户存款、订单执行状态，并处理订单的部分执行、超时取消和订单的用户地址存储。

### **2. 功能模块设计**

#### **2.1 存款管理**

用户将资产存入智能合约时，会生成一个唯一的订单号，并且保存订单的初始状态为 `Initialized`。此外，订单需要记录已执行的金额，以便在订单部分执行时支持后续部分的取消。

**关键函数：**

- `deposit_tokens(user: Pubkey, amount: u64, token_mint: Pubkey, order_id: u64, keeper: Pubkey, timeout: i64)`：
  - **功能**：用户存入资产，生成订单，设置超时时间，初始化订单状态为 `Initialized`。
  - **输入**：
    - `user: Pubkey`：用户地址。
    - `amount: u64`：存款金额。
    - `token_mint: Pubkey`：Token 类型的 Mint 地址。
    - `order_id: u64`：订单号，唯一标识存款。
    - `keeper: Pubkey`：指定的 Keeper 地址。
    - `timeout: i64`：订单超时时间，单位为秒，超时后无法继续执行。
  - **输出**：订单记录被保存，状态为 `Initialized`，超时时间被设置。

```rust
fn deposit_tokens(
    user: Pubkey,
    amount: u64,
    token_mint: Pubkey,
    order_id: u64,
    keeper: Pubkey,
    timeout: i64
) -> Result<()> {
    let order = DepositOrder {
        order_id,
        user,
        amount,
        token_mint,
        keeper,
        status: OrderStatus::Initialized,
        completed_amount: 0,
        timeout,
        creation_time: current_time(),
    };
    save_deposit_order(&order)?;
    Ok(())
}
```

#### **2.2 状态更新与部分执行**

- **订单部分执行**：订单可以部分执行，并记录已经完成的金额，以便在取消订单时，只撤销未执行的部分。

**更新状态的函数：**

- `withdraw_tokens(order_id: u64, amount: u64)`：
  - **功能**：Keeper 从合约中提取指定订单的资金到自己的账户进行交易。
  - **输入**：
    - `order_id: u64`：订单号。
    - `amount: u64`：要提取的金额。
  - **输出**：无
  - **描述**：
    - 检查调用者是否为指定的 Keeper。
    - 检查订单状态是否为 `ReadyToExecute`。
    - 检查提取金额是否合法（不超过订单剩余可执行金额）。
    - 从合约的 vault token account 转移代币到 Keeper 的 token account。
    - 记录提取操作的日志。
  - **权限要求**：
    - 只有订单指定的 Keeper 可以调用此函数。
    - 订单必须处于 `ReadyToExecute` 状态。
    - 订单不能已超时。
  - **账户要求**：
    - Keeper 的签名账户。
    - Keeper 的 token account（接收资金）。
    - 合约的 vault token account（转出资金）。
    - 合约的 vault authority（PDA，用于签名转账）。
    - Token Program。
    - 订单账户。

- `update_order_status_to_ready(order_id: u64)`：
  - **功能**：当 Keeper 取走资金准备执行交易时，更新订单状态为 `ReadyToExecute`。
  - **输入**：`order_id: u64`：订单号。
  - **输出**：无
  - **描述**：此操作由 Keeper 执行，并通过调用此函数通知合约资金已准备好进行交易。

```rust
fn update_order_status_to_ready(order_id: u64) -> Result<()> {
    let mut order = get_deposit_order(order_id)?;
    if order.status == OrderStatus::Initialized {
        order.status = OrderStatus::ReadyToExecute;
        save_deposit_order(&order)?;
    }
    Ok(())
}
```

- `partially_execute_order(order_id: u64, amount: u64)`：
  - **功能**：在执行过程中，记录订单已执行的金额。
  - **输入**：`order_id: u64`：订单号，`amount: u64`：已执行的金额。
  - **输出**：更新订单中的已完成金额。
  - **描述**：当订单执行时，部分金额会被记录，以便后续能够取消未执行的部分。

```rust
fn partially_execute_order(order_id: u64, amount: u64) -> Result<()> {
    let mut order = get_deposit_order(order_id)?;
    if order.status != OrderStatus::ReadyToExecute {
        return Err("Order is not ready to execute.");
    }

    order.completed_amount += amount;
    save_deposit_order(&order)?;
    Ok(())
}
```

#### **2.3 超时处理与取消**

订单超时后，Keeper 无权继续执行该订单。只有用户或 Keeper 能够取消订单，取消时需要把资金返还给用户。

**取消订单的函数：**

- `cancel_order(order_id: u64)`：
  - **功能**：取消订单并返还未执行部分的资金。
  - **输入**：`order_id: u64`：订单号。
  - **输出**：无
  - **描述**：
    - 检查订单状态是否为 `Initialized` 或已超时。
    - 计算需要返还的金额（总金额减去已执行金额）。
    - 将资金返还给用户。
    - 更新订单状态为 `Cancelled`。

```rust
fn cancel_order(order_id: u64) -> Result<()> {
    let mut order = get_deposit_order(order_id)?;
    if !can_cancel(&order) {
        return Err("Cannot cancel this order.");
    }

    let refund_amount = order.amount - order.completed_amount;
    if refund_amount > 0 {
        return_funds_to_user(&order, refund_amount)?;
    }

    order.status = OrderStatus::Cancelled;
    save_deposit_order(&order)?;
    Ok(())
}
```

### **3. 数据结构**

```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
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
}
```

### **3. 操作流程**

1. **用户存款**：用户调用 `deposit_tokens` 存入资产，生成订单并设置状态为 `Initialized`，同时设置超时时间和指定 Keeper。
2. **Keeper 执行交易准备**：Keeper 取走资金并通过调用 `update_order_status_to_ready` 更新订单状态为 `ReadyToExecute`。
3. **部分执行**：Keeper 在执行交易时调用 `partially_execute_order` 更新已执行金额。
4. **订单超时或取消**：订单超时后，用户或 Keeper 调用 `cancel_order` 取消订单，未执行的部分资金返回给用户。
5. **交易完成后**：交易完成后，Keeper 通知合约并调用 `notify_trade_completion`，如果成功，则删除订单数据。

### **4. 总结**

在此设计中，考虑了订单部分执行、超时处理和用户地址存储的需求：

- **部分执行**：订单可以部分执行，记录已完成金额，支持后续部分取消。
- **超时取消**：订单超时后，Keeper 无权执行交易，用户或 Keeper 可以取消订单并退回资金。
- **用户地址存储**：用户地址被存储，以便 Keeper 在执行交易后可以将资金退回到正确的地址。

这种设计提升了系统的灵活性和安全性，同时减少了链上存储的复杂性，确保订单的管理和资金的安全。

### **6. 资金流转说明**

整个交易过程中的资金流转路径如下：

1. **存款阶段**：
   - 用户将资金从自己的 token account 转入合约的 vault token account。
   - 此时资金由合约完全控制。

2. **提取阶段**：
   - Keeper 调用 `update_order_status_to_ready` 将订单状态更新为 `ReadyToExecute`。
   - Keeper 通过 `withdraw_tokens` 从合约的 vault token account 提取资金到自己的 token account。
   - 此时资金由 Keeper 控制，用于在外部执行交易。

3. **执行阶段**：
   - Keeper 在外部执行交易。
   - 通过 `partially_execute_order` 记录已执行的金额。
   - 如果全部执行完成，订单状态更新为 `Completed`。

4. **取消阶段**（如果需要）：
   - 如果订单超时或需要取消，未执行部分的资金将从合约的 vault token account 返还给用户。
   - 已执行部分的资金由 Keeper 负责处理（比如返还或继续执行交易）。

**安全考虑**：
- 所有资金转移操作都需要相应账户的签名。
- vault token account 的操作需要 vault authority（PDA）的签名。
- 提取操作只能由指定的 Keeper 执行。
- 订单超时后，Keeper 无法继续提取或执行订单。
- 合约会记录所有资金流转操作的日志，便于追踪和审计。 