import { Idl } from "@coral-xyz/anchor";

export const IDL: Idl = {
    "version": "0.1.0",
    "name": "escrow",
    "instructions": [
        {
            "name": "depositTokens",
            "accounts": [
                {
                    "name": "depositOrder",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "user",
                    "isMut": true,
                    "isSigner": true
                },
                {
                    "name": "mint",
                    "isMut": false,
                    "isSigner": false
                },
                {
                    "name": "userTokenAccount",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "vaultTokenAccount",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "systemProgram",
                    "isMut": false,
                    "isSigner": false
                },
                {
                    "name": "tokenProgram",
                    "isMut": false,
                    "isSigner": false
                },
                {
                    "name": "rent",
                    "isMut": false,
                    "isSigner": false
                }
            ],
            "args": [
                {
                    "name": "orderId",
                    "type": "u64"
                },
                {
                    "name": "amount",
                    "type": "u64"
                },
                {
                    "name": "keeper",
                    "type": "publicKey"
                },
                {
                    "name": "timeout",
                    "type": "i64"
                }
            ]
        },
        {
            "name": "cancelOrder",
            "accounts": [
                {
                    "name": "depositOrder",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "authority",
                    "isMut": false,
                    "isSigner": true
                },
                {
                    "name": "userTokenAccount",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "vaultTokenAccount",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "vaultAuthority",
                    "isMut": false,
                    "isSigner": false
                },
                {
                    "name": "tokenProgram",
                    "isMut": false,
                    "isSigner": false
                }
            ],
            "args": []
        },
        {
            "name": "partiallyExecuteOrder",
            "accounts": [
                {
                    "name": "depositOrder",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "keeper",
                    "isMut": false,
                    "isSigner": true
                }
            ],
            "args": [
                {
                    "name": "amount",
                    "type": "u64"
                }
            ]
        },
        {
            "name": "updateOrderStatusToReady",
            "accounts": [
                {
                    "name": "depositOrder",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "keeper",
                    "isMut": false,
                    "isSigner": true
                }
            ],
            "args": []
        },
         {
        "name": "withdrawTokens",
        "accounts": [
          {
            "name": "depositOrder",
              "isMut": false,
              "isSigner": true

          },
          {
            "name": "keeper",
            "isMut": false,
            "isSigner": true
          },
          {
            "name": "keeperTokenAccount",
              "isMut": false,
              "isSigner": true
          },
          {
            "name": "vaultTokenAccount",
              "isMut": false,
              "isSigner": true
          },
          {
            "name": "vaultAuthority",
              "isMut": false,
              "isSigner": true
          },
          {
            "name": "tokenProgram",
              "isMut": false,
              "isSigner": true
          }
        ],
        "args": [
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    ],
    "accounts": [
        {
            "name": "DepositOrder",
            "type": {
                "kind": "struct",
                "fields": [
                    {
                        "name": "orderId",
                        "type": "u64"
                    },
                    {
                        "name": "user",
                        "type": "publicKey"
                    },
                    {
                        "name": "amount",
                        "type": "u64"
                    },
                    {
                        "name": "tokenMint",
                        "type": "publicKey"
                    },
                    {
                        "name": "keeper",
                        "type": "publicKey"
                    },
                    {
                        "name": "status",
                        "type": {
                            "defined": "OrderStatus"
                        }
                    },
                    {
                        "name": "completedAmount",
                        "type": "u64"
                    },
                    {
                        "name": "timeout",
                        "type": "i64"
                    },
                    {
                        "name": "creationTime",
                        "type": "i64"
                    },
                    {
                        "name": "bump",
                        "type": "u8"
                    }
                ]
            }
        }
    ],
    "types": [
        {
            "name": "OrderStatus",
            "type": {
                "kind": "enum",
                "variants": [
                    {
                        "name": "Initialized"
                    },
                    {
                        "name": "ReadyToExecute"
                    },
                    {
                        "name": "Completed"
                    },
                    {
                        "name": "Cancelled"
                    }
                ]
            }
        }
    ],
    "errors": [
        {
            "code": 6000,
            "name": "OrderTimeout",
            "msg": "订单已超时"
        },
        {
            "code": 6001,
            "name": "InvalidOrderStatus",
            "msg": "订单状态无效"
        },
        {
            "code": 6002,
            "name": "InvalidAmount",
            "msg": "无效的金额"
        },
        {
            "code": 6003,
            "name": "Unauthorized",
            "msg": "未授权的操作"
        },
        {
            "code": 6004,
            "name": "InvalidTokenAccountOwner",
            "msg": "Token Account 所有权验证失败"
        },
        {
            "code": 6005,
            "name": "InvalidTokenMint",
            "msg": "Token Account Mint 不匹配"
        },
        {
            "code": 6006,
            "name": "InvalidTimeout",
            "msg": "超时时间设置无效"
        }
    ]
};
